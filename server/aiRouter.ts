import {
  BrainRoutingDecision,
  BrainRoutingMode,
  BrainType,
  FileAttachment,
} from '../src/types/nexus.ts';
import { settingsService } from './settingsService.ts';

const COMPLEX_REASONING_PATTERNS = [
  /\b(architect|architecture|system design|refactor|debug|vulnerability|security audit|optimize|algorithm)\b/i,
  /\b(compare and contrast|trade-?offs|multi-step|step-by-step plan|strategic|root cause|distributed)\b/i,
  /\b(typescript|react|python|sql|rust|docker|kubernetes|microservices|concurrency|schema)\b/i,
  /\b(analyze|synthesize|verify|evaluate|critique|formal proof|financial model)\b/i,
  /```[\s\S]*```/,
];

export interface ToolCandidate {
  toolName: string;
  args: Record<string, unknown>;
}

export class AIRouter {
  /**
   * Analyzes user prompt and attachments to detect whether deterministic tools
   * should be invoked before or during generation.
   */
  public detectRequiredTools(
    prompt: string,
    attachments?: FileAttachment[]
  ): ToolCandidate[] {
    const candidates: ToolCandidate[] = [];
    const settings = settingsService.getSettings();

    // 1. File attachments automatically trigger file_content_analyzer
    if (attachments && attachments.length > 0 && settings.enabledTools.file_content_analyzer !== false) {
      for (const file of attachments) {
        candidates.push({
          toolName: 'file_content_analyzer',
          args: {
            fileName: file.name,
            content: file.contentText,
          },
        });
      }
    }

    // 2. Date / time / timezone queries
    if (
      settings.enabledTools.datetime_inspector !== false &&
      /\b(what time|current time|date today|current date|utc time|timezone|time in kuala lumpur|timestamp|epoch)\b/i.test(
        prompt
      )
    ) {
      const tzMatch = prompt.match(/\b(Asia\/[A-Za-z_]+|America\/[A-Za-z_]+|Europe\/[A-Za-z_]+|UTC)\b/i);
      candidates.push({
        toolName: 'datetime_inspector',
        args: {
          timezone: tzMatch ? tzMatch[1] : 'Asia/Kuala_Lumpur',
        },
      });
    }

    // 3. Mathematical calculation queries
    if (settings.enabledTools.precision_calculator !== false) {
      const explicitMathMatch = prompt.match(
        /(?:calculate|compute|evaluate|what is|solve)\s*[:=]?\s*([0-9()+*/.,^\-\s]{3,60})/i
      );
      const inlineExprMatch = prompt.match(/\b(\d+(?:\.\d+)?\s*[*/+-]\s*\d+(?:\.\d+)?(?:\s*[*/+-]\s*\d+(?:\.\d+)?)*)\b/);
      const expr = explicitMathMatch?.[1]?.trim() || inlineExprMatch?.[1]?.trim();

      if (expr && /[*/+-^]/.test(expr) && /\d/.test(expr)) {
        candidates.push({
          toolName: 'precision_calculator',
          args: { expression: expr },
        });
      }
    }

    // 4. Memory lookup queries
    if (
      settings.enabledTools.workspace_memory_lookup !== false &&
      /\b(what do you remember|my preferences|saved memory|project memory|memory vault|recall my)\b/i.test(
        prompt
      )
    ) {
      candidates.push({
        toolName: 'workspace_memory_lookup',
        args: { query: '' },
      });
    }

    // 5. Text summarization / readability metrics on long inputs
    if (
      settings.enabledTools.text_summarizer_analyzer !== false &&
      prompt.length > 550 &&
      /\b(summarize|word count|readability|key points|action items|tl;?dr)\b/i.test(prompt)
    ) {
      candidates.push({
        toolName: 'text_summarizer_analyzer',
        args: { text: prompt },
      });
    }

    // 6. External webhook dispatch (sensitive tool requiring approval)
    if (
      settings.enabledTools.external_webhook_dispatch !== false &&
      /\b(dispatch webhook|send webhook|trigger external webhook|publish to production endpoint)\b/i.test(
        prompt
      )
    ) {
      candidates.push({
        toolName: 'external_webhook_dispatch',
        args: {
          destination: 'https://api.blacktower.internal/v1/dispatch',
          payloadSummary: prompt.slice(0, 240),
        },
      });
    }

    return candidates;
  }

  /**
   * Computes complexity score (1-10) and selects FLASH vs REASONING brain
   */
  public routeRequest(params: {
    prompt: string;
    mode?: BrainRoutingMode;
    requestedBrain?: BrainType;
    requestedModel?: string;
    attachments?: FileAttachment[];
    forceAgentWorkflow?: boolean;
  }): {
    decision: BrainRoutingDecision;
    toolCandidates: ToolCandidate[];
  } {
    const settings = settingsService.getSettings();
    const mode: BrainRoutingMode = params.mode || settings.brainMode || 'AUTO';
    const toolCandidates = this.detectRequiredTools(params.prompt, params.attachments);

    // Estimate complexity score (1 - 10)
    let score = 2;
    const promptLen = params.prompt.trim().length;
    if (promptLen > 180) score += 1;
    if (promptLen > 500) score += 2;
    if (params.attachments && params.attachments.length > 0) score += 2;
    if (params.forceAgentWorkflow) score += 3;

    let matchedPatterns = 0;
    for (const regex of COMPLEX_REASONING_PATTERNS) {
      if (regex.test(params.prompt)) {
        matchedPatterns += 1;
      }
    }
    score += Math.min(4, matchedPatterns * 2);
    const complexityScore = Math.max(1, Math.min(10, score));

    let selectedBrain: BrainType;
    let requestedModelId: string;
    let reasoningSummary: string;

    if (mode === 'MANUAL' && params.requestedBrain) {
      selectedBrain = params.requestedBrain;
      requestedModelId =
        params.requestedModel ||
        (selectedBrain === 'REASONING' ? settings.reasoningModelId : settings.flashModelId);
      reasoningSummary = `Manual operator lock: ${selectedBrain} BRAIN (${requestedModelId}) explicitly selected.`;
    } else if (mode === 'MANUAL' && params.requestedModel) {
      selectedBrain =
        params.requestedModel === settings.reasoningModelId ? 'REASONING' : 'FLASH';
      requestedModelId = params.requestedModel;
      reasoningSummary = `Manual model lock: ${requestedModelId} selected by operator.`;
    } else {
      // AUTO mode routing policy
      if (complexityScore >= 6 || params.forceAgentWorkflow) {
        selectedBrain = 'REASONING';
        requestedModelId = settings.reasoningModelId;
        reasoningSummary = `AUTO Router selected REASONING BRAIN (complexity ${complexityScore}/10: multi-step analysis, architecture, or code synthesis detected).`;
      } else {
        selectedBrain = 'FLASH';
        requestedModelId = settings.flashModelId;
        reasoningSummary = `AUTO Router selected FLASH BRAIN (complexity ${complexityScore}/10: high-speed conversational synthesis & direct execution).`;
      }
    }

    const decision: BrainRoutingDecision = {
      mode,
      selectedBrain,
      requestedModelId,
      executedModelId: requestedModelId,
      gatewayUsed: 'openrouter',
      fallbackTriggered: false,
      complexityScore,
      requiresTools: toolCandidates.length > 0,
      detectedTools: toolCandidates.map((t) => t.toolName),
      reasoningSummary,
      timestamp: new Date().toISOString(),
    };

    return { decision, toolCandidates };
  }
}

export const aiRouter = new AIRouter();
