import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  Edit3,
  FileText,
  FolderKanban,
  RefreshCw,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  BrainRoutingDecision,
  BrainType,
  ChatMessage,
  NexusSettings,
  ToolExecutionRecord,
} from '../types/nexus.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  streamingContent: string;
  streamingRouting: BrainRoutingDecision | null;
  streamingTools: ToolExecutionRecord[];
  isStreaming: boolean;
  activeBrain: BrainType;
  settings: NexusSettings;
  onQuickPrompt: (prompt: string, runAsAgent?: boolean) => void;
  onEditAndResend: (messageId: string, newContent: string) => void;
  onRegenerate: (assistantMessageId: string) => void;
  onSaveToMemory: (title: string, content: string) => void;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  streamingContent,
  streamingRouting,
  streamingTools,
  isStreaming,
  activeBrain,
  settings,
  onQuickPrompt,
  onEditAndResend,
  onRegenerate,
  onSaveToMemory,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [expandedToolsMsgId, setExpandedToolsMsgId] = useState<string | null>(null);
  const [savedMemId, setSavedMemId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const suggestedActions = [
    {
      title: 'Ask NEXUS',
      subtitle: 'Fast synthesis & time-verified reasoning',
      icon: Sparkles,
      accent: 'text-cyan-400',
      prompt:
        'Check our current Kuala Lumpur time and calculate the compound annual growth rate if monthly recurring revenue scales from $42,500 to $185,000 over 18 months. Give me a sharp executive assessment.',
      agent: false,
    },
    {
      title: 'Analyze a project',
      subtitle: 'Architecture & security review with REASONING Brain',
      icon: FolderKanban,
      accent: 'text-violet-400',
      prompt:
        'Architect a zero-trust multi-tenant API gateway in TypeScript. Identify top 3 failure modes, rate-limiting strategies, and how to isolate untrusted tool outputs from prompt injection.',
      agent: false,
    },
    {
      title: 'Research a topic',
      subtitle: 'Structured technical & strategic trade-offs',
      icon: Compass,
      accent: 'text-emerald-400',
      prompt:
        'Compare Dual-Brain model routing (fast Flash tier + deep Reasoning tier) against single-model deployments for enterprise AI agents. Quantify latency, token economics, and verification reliability.',
      agent: false,
    },
    {
      title: 'Build an agent workflow',
      subtitle: 'Execute 7-phase protocol with approval gate',
      icon: Workflow,
      accent: 'text-amber-400',
      prompt:
        'Run a system audit of our current workspace memories, calculate (1450 * 1.18) / 12, and dispatch a summary webhook to the production endpoint.',
      agent: true,
    },
  ];

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 overflow-y-auto px-6 py-10 flex flex-col items-center justify-center">
        <div className="max-w-3xl w-full space-y-8">
          {/* Hero Identity Card */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-400">
              <span>BLACKTOWER™</span>
              <span>·</span>
              <span className="text-violet-300">DUAL-BRAIN OPERATING LAYER</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
              NEXUS 5.5
            </h1>

            <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
              Intelligence that thinks, plans, executes, and verifies. Powered by Dual-Brain routing between{' '}
              <span className="font-mono text-xs text-cyan-300">{settings.flashModelId}</span> and{' '}
              <span className="font-mono text-xs text-violet-300">{settings.reasoningModelId}</span>.
            </p>
          </div>

          {/* 4 Suggested Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {suggestedActions.map((item, idx) => {
              const IconComponent = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onQuickPrompt(item.prompt, item.agent)}
                  className="group text-left p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-violet-400/35 backdrop-blur-xl transition-all cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white group-hover:text-violet-200 transition-colors">
                        {item.title}
                      </span>
                      <IconComponent className={`w-4 h-4 ${item.accent} shrink-0`} />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.subtitle}</p>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 group-hover:text-slate-300 flex items-center justify-between pt-2 border-t border-white/[0.05]">
                    <span>{item.agent ? '7-Phase Agent Protocol' : 'Dual-Brain Chat'}</span>
                    <span>Execute →</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dual-Brain Architecture Summary Strip */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium">FLASH Brain</span>
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="font-mono text-[11px]">{settings.flashModelId}</span>
                <div className="text-[11px] text-slate-500">
                  Low-latency synthesis, intent classification, and fast tool selection
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-7 w-px bg-white/[0.07]" />

            <div className="flex items-center gap-3">
              <Brain className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <span className="text-slate-200 font-medium">REASONING Brain</span>
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="font-mono text-[11px]">{settings.reasoningModelId}</span>
                <div className="text-[11px] text-slate-500">
                  Multi-step planning, system engineering, debugging, and verification
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isEditing = editingMsgId === msg.id;
          const decision = msg.routingDecision;
          const tools = msg.toolExecutions || [];
          const toolsExpanded = expandedToolsMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              {/* Message Header Metadata (Unboxed clean typography) */}
              <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">
                  {isUser ? 'Operator' : 'NEXUS 5.5'}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">{formatTime(msg.createdAt)}</span>

                {!isUser && decision && (
                  <>
                    <span>·</span>
                    <span
                      className={`font-mono font-medium ${
                        decision.selectedBrain === 'REASONING'
                          ? 'text-violet-300'
                          : 'text-cyan-300'
                      }`}
                    >
                      {decision.selectedBrain} BRAIN
                    </span>
                    <span>·</span>
                    <span className="font-mono text-slate-400">
                      {decision.executedModelId}
                    </span>
                    <span>·</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      Complexity {decision.complexityScore}/10 ({decision.mode})
                    </span>
                  </>
                )}

                {isUser && msg.isEdited && (
                  <>
                    <span>·</span>
                    <span className="text-slate-500 italic">edited</span>
                  </>
                )}
              </div>

              {/* Message Surface */}
              <div
                className={`w-full ${
                  isUser ? 'max-w-2xl' : 'max-w-4xl'
                } rounded-2xl p-4 backdrop-blur-xl border transition-colors ${
                  isUser
                    ? 'bg-violet-600/[0.14] border-violet-400/25 text-slate-100'
                    : msg.error
                    ? 'bg-rose-950/30 border-rose-500/35 text-rose-100'
                    : 'bg-white/[0.035] border-white/[0.08] text-slate-200'
                }`}
              >
                {/* Attached Files in User Message */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/30 border border-white/[0.08] text-xs text-slate-300 font-mono"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{att.name}</span>
                        <span className="text-slate-500">
                          ({(att.sizeBytes / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fallback Transparency Notice if Fallback Gateway Was Used */}
                {!isUser && decision?.fallbackTriggered && decision.fallbackReason && (
                  <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-semibold">Verified Gateway Routing Transparency</div>
                      <div className="text-amber-200/80 leading-relaxed">
                        {decision.fallbackReason}
                      </div>
                    </div>
                  </div>
                )}

                {/* Verified Backend Tool Executions Drawer */}
                {!isUser && tools.length > 0 && (
                  <div className="mb-3 rounded-xl bg-[#07090f]/80 border border-white/[0.08] overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedToolsMsgId(toolsExpanded ? null : msg.id)
                      }
                      className="w-full px-3.5 py-2 flex items-center justify-between text-xs text-slate-300 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          Executed {tools.length} verified backend tool
                          {tools.length > 1 ? 's' : ''}:{' '}
                          {tools.map((t) => t.toolName).join(', ')}
                        </span>
                      </span>
                      {toolsExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>

                    {toolsExpanded && (
                      <div className="p-3 border-t border-white/[0.07] space-y-2.5 text-xs font-mono">
                        {tools.map((t) => (
                          <div
                            key={t.id}
                            className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="font-semibold text-cyan-300">{t.toolName}</span>
                              <span className="text-[11px] text-slate-400 tabular-nums">
                                Status: {t.status} · {t.durationMs ?? 0}ms
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Args: {JSON.stringify(t.arguments)}
                            </div>
                            {t.output && (
                              <pre className="p-2 rounded bg-[#05060a] text-[11px] text-emerald-200 overflow-x-auto max-h-40">
                                {t.output}
                              </pre>
                            )}
                            {t.error && (
                              <div className="text-rose-300 text-[11px]">Error: {t.error}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Content or Edit Mode */}
                {isEditing ? (
                  <div className="space-y-2.5">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full p-2.5 rounded-xl bg-[#07080d] border border-violet-400/40 text-sm text-white focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingMsgId(null)}
                        className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-white bg-white/[0.05] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingContent.trim()) {
                            onEditAndResend(msg.id, editingContent.trim());
                            setEditingMsgId(null);
                          }
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 cursor-pointer"
                      >
                        Save & Resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {/* Message Footer Action Controls */}
                {!isEditing && (
                  <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {isUser && !isStreaming && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditingContent(msg.content);
                          }}
                          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit & Resend</span>
                        </button>
                      )}

                      {!isUser && !isStreaming && (
                        <>
                          <button
                            type="button"
                            onClick={() => onRegenerate(msg.id)}
                            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Regenerate</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const title =
                                msg.content
                                  .replace(/[#*`]/g, '')
                                  .split('\n')[0]
                                  ?.slice(0, 48) || 'NEXUS Insight';
                              onSaveToMemory(title, msg.content.slice(0, 600));
                              setSavedMemId(msg.id);
                              setTimeout(() => setSavedMemId(null), 2000);
                            }}
                            className="flex items-center gap-1 hover:text-violet-300 transition-colors cursor-pointer"
                          >
                            {savedMemId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Saved to Memory Vault</span>
                              </>
                            ) : (
                              <>
                                <BookmarkPlus className="w-3.5 h-3.5" />
                                <span>Commit to Memory</span>
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>

                    {!isUser && decision && (
                      <span className="hidden sm:inline font-mono text-[11px] text-slate-500">
                        {decision.reasoningSummary.slice(0, 72)}
                        {decision.reasoningSummary.length > 72 ? '...' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Active Streaming Response Frame */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] text-slate-400">
              <span className="font-semibold text-white">NEXUS 5.5</span>
              <span>·</span>
              <span className="font-mono text-cyan-300">
                {streamingRouting?.selectedBrain || activeBrain} BRAIN STREAMING
              </span>
              {streamingRouting && (
                <>
                  <span>·</span>
                  <span className="font-mono text-slate-400">
                    {streamingRouting.executedModelId}
                  </span>
                </>
              )}
            </div>

            <div className="w-full max-w-4xl rounded-2xl p-4 backdrop-blur-xl bg-white/[0.04] border border-violet-400/30 text-slate-200 space-y-3">
              {streamingTools.length > 0 && (
                <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/[0.07] text-xs font-mono text-emerald-300 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Verified Tool Execution:{' '}
                    {streamingTools.map((t) => `${t.toolName} (${t.status})`).join(', ')}
                  </span>
                </div>
              )}

              {streamingContent ? (
                <MarkdownRenderer content={streamingContent} />
              ) : (
                <div className="py-2 text-xs font-mono text-slate-400">
                  Routing request and synthesizing response...
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
