import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  ShieldAlert,
  Terminal,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { AgentTask } from '../types/nexus.ts';
import { toolLabel } from '../utils/toolLabels.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

interface AgentTaskPanelProps {
  open: boolean;
  onClose: () => void;
  tasks: AgentTask[];
  isRunningTask: boolean;
  onLaunchTask: (objective: string) => void;
  onResolveApproval: (
    taskId: string,
    executionId: string,
    decision: 'approve' | 'reject'
  ) => void;
}

export const AgentTaskPanel: React.FC<AgentTaskPanelProps> = ({
  open,
  onClose,
  tasks,
  isRunningTask,
  onLaunchTask,
  onResolveApproval,
}) => {
  const [objectiveInput, setObjectiveInput] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (!open) return null;

  const activeTask =
    tasks.find((t) => t.id === selectedTaskId) || tasks[0] || null;

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objectiveInput.trim() || isRunningTask) return;
    onLaunchTask(objectiveInput.trim());
    setObjectiveInput('');
  };

  return (
    <aside className="w-96 max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:w-[88%] max-sm:z-40 border-l border-white/[0.08] bg-[#090b11]/95 backdrop-blur-2xl flex flex-col shrink-0 z-20 select-none">
      {/* Panel Header */}
      <div className="h-14 px-4 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">Tasks</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Agent Objective Dispatcher */}
      <form onSubmit={handleLaunch} className="p-3.5 border-b border-white/[0.08] space-y-2">
        <label className="block text-[11px] font-semibold text-slate-400">
          New task
        </label>
        <textarea
          value={objectiveInput}
          onChange={(e) => setObjectiveInput(e.target.value)}
          rows={2}
          placeholder="e.g., Summarize my unread email and add any deadlines to my calendar"
          className="w-full p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-violet-400/40 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500 resize-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500">Runs end to end</span>
          <button
            type="submit"
            disabled={!objectiveInput.trim() || isRunningTask}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isRunningTask ? 'Executing...' : 'Execute'}</span>
          </button>
        </div>
      </form>

      {/* Task Selector Bar if multiple tasks exist */}
      {tasks.length > 1 && (
        <div className="px-3.5 py-2 border-b border-white/[0.07] flex items-center gap-1.5 overflow-x-auto">
          {tasks.slice(0, 6).map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTaskId(t.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono whitespace-nowrap transition-colors cursor-pointer ${
                activeTask?.id === t.id
                  ? 'bg-violet-500/25 text-violet-200 border border-violet-400/30'
                  : 'bg-white/[0.03] text-slate-400 hover:text-slate-200'
              }`}
            >
              Task #{tasks.length - idx} ({t.status})
            </button>
          ))}
        </div>
      )}

      {/* Active Task Timeline & Verification View */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {!activeTask ? (
          <div className="py-12 px-4 text-center space-y-2">
            <Workflow className="w-7 h-7 text-slate-600 mx-auto" />
            <div className="text-xs font-medium text-slate-300">
              No Active Agent Tasks
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Start a task above, or use &ldquo;Run as task&rdquo; in the composer when you want NEXUS to work through several steps.
            </p>
          </div>
        ) : (
          <>
            {/* Objective & Status Summary */}
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">
                  Phase: <strong className="text-cyan-300">{activeTask.currentPhase}</strong>
                </span>
                <span
                  className={`font-semibold ${
                    activeTask.status === 'completed'
                      ? 'text-emerald-400'
                      : activeTask.status === 'waiting_approval'
                      ? 'text-amber-400'
                      : activeTask.status === 'failed'
                      ? 'text-rose-400'
                      : 'text-violet-300'
                  }`}
                >
                  {activeTask.status.toUpperCase()}
                </span>
              </div>

              <div className="text-xs font-medium text-white leading-relaxed select-text">
                {activeTask.objective}
              </div>

              <div className="pt-1.5 border-t border-white/[0.06] text-[11px] text-slate-400 flex items-center justify-between">
                <span>
                  {activeTask.routingDecision.selectedBrain === 'REASONING' ? 'Deep' : 'Fast'} mode
                </span>
                <span>{activeTask.toolCalls.length} action(s)</span>
              </div>
            </div>

            {/* Human-in-the-Loop Approval Gate Banner */}
            {activeTask.toolCalls
              .filter((tc) => tc.status === 'pending_approval')
              .map((pendingTool) => (
                <div
                  key={pendingTool.id}
                  className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-400/35 space-y-2.5"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Approval Required: Sensitive Action</span>
                  </div>
                  <p className="text-[11px] text-amber-100/80 leading-relaxed">
                    {String(
                      pendingTool.arguments.payloadSummary ||
                        pendingTool.arguments.destination ||
                        'This action sends data outside NEXUS.'
                    )}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onResolveApproval(activeTask.id, pendingTool.id, 'approve')
                      }
                      className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      Approve & Execute
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onResolveApproval(activeTask.id, pendingTool.id, 'reject')
                      }
                      className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-400/30 text-rose-100 text-xs font-semibold cursor-pointer"
                    >
                      Reject Action
                    </button>
                  </div>
                </div>
              ))}

            {/* 7-Phase Execution Timeline */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-400">
                Protocol Steps ({activeTask.steps.filter((s) => s.status === 'completed').length}/
                {activeTask.steps.length})
              </div>

              <div className="space-y-1.5">
                {activeTask.steps.map((step) => {
                  const Icon =
                    step.status === 'completed'
                      ? CheckCircle2
                      : step.status === 'failed'
                      ? XCircle
                      : step.status === 'waiting_approval'
                      ? AlertCircle
                      : Clock;

                  const iconColor =
                    step.status === 'completed'
                      ? 'text-emerald-400'
                      : step.status === 'failed'
                      ? 'text-rose-400'
                      : step.status === 'waiting_approval'
                      ? 'text-amber-400'
                      : step.status === 'in_progress'
                      ? 'text-cyan-400'
                      : 'text-slate-600';

                  return (
                    <div
                      key={step.id}
                      className="p-2.5 rounded-xl bg-white/[0.025] border border-white/[0.06] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                          <span>
                            {step.index}. {step.phase}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {step.status}
                        </span>
                      </div>
                      <div className="pl-5 text-[11px] text-slate-400">{step.title}</div>
                      {step.outputSummary && (
                        <div className="pl-5 text-[11px] font-mono text-cyan-300/90">
                          {step.outputSummary}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions taken */}
            {activeTask.toolCalls.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">
                  Actions taken ({activeTask.toolCalls.length})
                </div>
                {activeTask.toolCalls.map((tc) => (
                  <div
                    key={tc.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px]"
                  >
                    <span className="flex items-center gap-1.5 text-slate-200">
                      <Terminal className="w-3 h-3 text-emerald-300" />
                      <span>{toolLabel(tc.toolName)}</span>
                    </span>
                    <span
                      className={
                        tc.status === 'completed'
                          ? 'text-emerald-300'
                          : tc.status === 'failed'
                          ? 'text-rose-300'
                          : 'text-amber-300'
                      }
                    >
                      {tc.status === 'completed'
                        ? 'Done'
                        : tc.status === 'failed'
                        ? 'Failed'
                        : tc.status === 'pending_approval'
                        ? 'Needs approval'
                        : 'Skipped'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Final Verified Result */}
            {activeTask.finalResult && (
              <div className="p-3 rounded-xl bg-violet-500/[0.08] border border-violet-400/25 space-y-2 select-text">
                <div className="text-xs font-semibold text-violet-200 flex items-center justify-between">
                  <span>Result</span>
                  {activeTask.verificationSummary && (
                    <span className="text-[10px] text-emerald-300">
                      {activeTask.verificationSummary}
                    </span>
                  )}
                </div>
                <div className="text-xs">
                  <MarkdownRenderer content={activeTask.finalResult} />
                </div>
              </div>
            )}

            {activeTask.error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                {activeTask.error}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
