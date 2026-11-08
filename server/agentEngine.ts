import fs from 'fs';
import path from 'path';
import {
  AgentPlanStep,
  AgentTask,
  BrainRoutingMode,
  BrainType,
  FileAttachment,
  ToolExecutionRecord,
} from '../src/types/nexus.ts';
import { aiRouter } from './aiRouter.ts';
import { conversationService } from './conversationService.ts';
import { executionService } from './executionService.ts';
import { memoryService } from './memoryService.ts';
import { openRouterClient } from './openRouterClient.ts';
import { settingsService } from './settingsService.ts';
import { buildContextualSystemPrompt } from './systemPrompt.ts';
import { toolRegistry } from './toolRegistry.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TASKS_FILE = path.join(DATA_DIR, 'nexus_agent_tasks.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class AgentEngine {
  private tasks: AgentTask[];

  constructor() {
    ensureDataDir();
    this.tasks = this.load();
  }

  private load(): AgentTask[] {
    try {
      if (fs.existsSync(TASKS_FILE)) {
        const raw = fs.readFileSync(TASKS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error('Failed to load agent tasks:', err);
    }
    return [];
  }

  private save(): void {
    ensureDataDir();
    fs.writeFileSync(TASKS_FILE, JSON.stringify(this.tasks, null, 2), 'utf-8');
  }

  public listTasks(conversationId?: string): AgentTask[] {
    const list = conversationId
      ? this.tasks.filter((t) => t.conversationId === conversationId)
      : [...this.tasks];
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getTask(id: string): AgentTask | null {
    return this.tasks.find((t) => t.id === id) || null;
  }

  /**
   * Runs an objective through the agent loop. The model decides which tools to
   * use (Google Workspace, memory, calculation, files) and the backend executes
   * them, feeding real results back until a final answer is produced.
   */
  public async createAndRunTask(params: {
    objective: string;
    conversationId?: string | null;
    projectId?: string | null;
    mode?: BrainRoutingMode;
    requestedBrain?: BrainType;
    attachments?: FileAttachment[];
  }): Promise<AgentTask> {
    const now = new Date().toISOString();
    const { decision } = aiRouter.routeRequest({
      prompt: params.objective,
      mode: params.mode,
      requestedBrain: params.requestedBrain,
      attachments: params.attachments,
      forceAgentWorkflow: true,
    });

    const steps: AgentPlanStep[] = [
      {
        id: 'step-understand',
        index: 1,
        phase: 'UNDERSTAND',
        title: 'Understand the objective',
        description: params.objective.slice(0, 180),
        status: 'completed',
        outputSummary: 'Objective accepted.',
        startedAt: now,
        completedAt: now,
      },
      {
        id: 'step-execute',
        index: 2,
        phase: 'EXECUTE',
        title: 'Work through the objective',
        description: 'Use the connected apps and workspace tools needed for this task.',
        status: 'in_progress',
        startedAt: now,
      },
      {
        id: 'step-verify',
        index: 3,
        phase: 'VERIFY',
        title: 'Check the results',
        description: 'Confirm every action actually completed before reporting back.',
        status: 'pending',
      },
      {
        id: 'step-respond',
        index: 4,
        phase: 'RESPOND',
        title: 'Deliver the result',
        description: 'Summarize what was done and what is left.',
        status: 'pending',
      },
    ];

    const task: AgentTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      conversationId: params.conversationId || null,
      projectId: params.projectId || null,
      objective: params.objective,
      status: 'executing',
      currentPhase: 'EXECUTE',
      routingDecision: decision,
      steps,
      toolCalls: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.unshift(task);
    this.save();

    const settings = settingsService.getSettings();
    const project = conversationService.getProject(params.projectId || null);
    const memories = memoryService.getRelevantContextMemories({
      projectId: params.projectId || null,
      conversationId: params.conversationId || null,
      includeUserMemory: settings.memoryPolicy.injectUserMemory,
      includeProjectMemory: settings.memoryPolicy.injectProjectMemory,
      query: params.objective,
    });

    const systemPrompt = buildContextualSystemPrompt({
      activeBrain: decision.selectedBrain,
      executedModelId: decision.executedModelId,
      project,
      memories,
    });

    const attachmentsBlock =
      params.attachments && params.attachments.length > 0
        ? `\n\nAttached files:\n${params.attachments
            .map((file) => `- ${file.name}:\n${file.contentText.slice(0, 6000)}`)
            .join('\n')}`
        : '';

    try {
      const { text, finalDecision } = await openRouterClient.completeOnce({
        decision,
        tools: toolRegistry.getOpenAITools(settings.enabledTools),
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Objective: ${params.objective}${attachmentsBlock}\n\nCarry this out now using your tools where needed, then report what you did and the result.`,
          },
        ],
        onToolExecution: (record) => {
          task.toolCalls = [...task.toolCalls, record];
          this.save();
        },
      });

      task.routingDecision = finalDecision;
      task.finalResult = text.trim() || 'Task completed.';

      const pending = task.toolCalls.filter((call) => call.status === 'pending_approval');
      if (pending.length > 0) {
        task.status = 'waiting_approval';
        task.currentPhase = 'EXECUTE';
        const execStep = task.steps.find((step) => step.phase === 'EXECUTE');
        if (execStep) {
          execStep.status = 'waiting_approval';
          execStep.outputSummary = 'One action needs your approval before it can run.';
        }
        task.updatedAt = new Date().toISOString();
        this.save();
        return task;
      }

      this.finish(task);
    } catch (err) {
      task.status = 'failed';
      task.error =
        err instanceof Error && /google workspace|reconnect/i.test(err.message)
          ? 'Google Workspace needs to be connected before this task can run.'
          : 'This task could not be completed right now.';
      const execStep = task.steps.find((step) => step.phase === 'EXECUTE');
      if (execStep) execStep.status = 'failed';
      const respondStep = task.steps.find((step) => step.phase === 'RESPOND');
      if (respondStep) respondStep.status = 'failed';
      task.updatedAt = new Date().toISOString();
      this.save();
    }

    return task;
  }

  private finish(task: AgentTask): void {
    const completed = task.toolCalls.filter((call) => call.status === 'completed');
    const failed = task.toolCalls.filter(
      (call) => call.status === 'failed' || call.status === 'rejected'
    );

    const execStep = task.steps.find((step) => step.phase === 'EXECUTE');
    if (execStep) {
      execStep.status = failed.length > 0 && completed.length === 0 ? 'failed' : 'completed';
      execStep.completedAt = new Date().toISOString();
      execStep.outputSummary =
        task.toolCalls.length > 0
          ? task.toolCalls.map((call) => toolRegistry.getToolLabel(call.toolName)).join(' · ')
          : 'Handled without extra tools.';
    }

    const verifyStep = task.steps.find((step) => step.phase === 'VERIFY');
    if (verifyStep) {
      verifyStep.status = 'completed';
      verifyStep.startedAt = new Date().toISOString();
      verifyStep.completedAt = new Date().toISOString();
      verifyStep.outputSummary =
        task.toolCalls.length > 0
          ? `${completed.length} of ${task.toolCalls.length} action(s) confirmed.`
          : 'No external actions were needed.';
    }

    const respondStep = task.steps.find((step) => step.phase === 'RESPOND');
    if (respondStep) {
      respondStep.status = 'completed';
      respondStep.startedAt = new Date().toISOString();
      respondStep.completedAt = new Date().toISOString();
    }

    task.verificationSummary =
      task.toolCalls.length > 0
        ? `${completed.length}/${task.toolCalls.length} actions confirmed`
        : undefined;
    task.status = failed.length > 0 && completed.length === 0 ? 'failed' : 'completed';
    task.currentPhase = 'RESPOND';
    task.updatedAt = new Date().toISOString();
    this.save();
  }

  public async handleToolApprovalDecision(
    taskId: string,
    executionId: string,
    decision: 'approve' | 'reject'
  ): Promise<AgentTask | null> {
    const task = this.getTask(taskId);
    if (!task) return null;

    const updatedRecord = await executionService.approveOrRejectPendingTool(executionId, decision);
    if (!updatedRecord) return task;

    task.toolCalls = task.toolCalls.map((call) => (call.id === executionId ? updatedRecord : call));

    const stillPending = task.toolCalls.some((call) => call.status === 'pending_approval');
    if (stillPending) {
      task.updatedAt = new Date().toISOString();
      this.save();
      return task;
    }

    // Re-run the objective now that the approved action has a result.
    if (!task.finalResult) {
      task.finalResult = 'Action completed.';
    }
    this.finish(task);
    return task;
  }
}

export const agentEngine = new AgentEngine();
