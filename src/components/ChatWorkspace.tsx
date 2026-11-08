import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
  Check,
  Compass,
  Copy,
  Edit3,
  FileText,
  FolderKanban,
  RefreshCw,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { ChatMessage } from '../types/nexus.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  onQuickPrompt: (prompt: string, runAsAgent?: boolean) => void;
  onEditAndResend: (messageId: string, newContent: string) => void;
  onRegenerate: (assistantMessageId: string) => void;
  onSaveToMemory: (title: string, content: string) => void;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  streamingContent,
  isStreaming,
  onQuickPrompt,
  onEditAndResend,
  onRegenerate,
  onSaveToMemory,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
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
      title: 'Ask a question',
      subtitle: 'Get a fast, clear answer',
      icon: Sparkles,
      accent: 'text-cyan-400',
      prompt:
        'Check our current Kuala Lumpur time and calculate the compound annual growth rate if monthly recurring revenue scales from $42,500 to $185,000 over 18 months. Give me a sharp executive assessment.',
      agent: false,
    },
    {
      title: 'Plan a project',
      subtitle: 'Structure, risks, and next steps',
      icon: FolderKanban,
      accent: 'text-violet-400',
      prompt:
        'Architect a zero-trust multi-tenant API gateway in TypeScript. Identify top 3 failure modes, rate-limiting strategies, and how to isolate untrusted tool outputs from prompt injection.',
      agent: false,
    },
    {
      title: 'Research a topic',
      subtitle: 'Balanced trade-offs and comparison',
      icon: Compass,
      accent: 'text-emerald-400',
      prompt:
        'Compare Dual-Brain model routing (fast Flash tier + deep Reasoning tier) against single-model deployments for enterprise AI agents. Quantify latency, token economics, and verification reliability.',
      agent: false,
    },
    {
      title: 'Run a task end to end',
      subtitle: 'Agent plans, executes, and reports back',
      icon: Workflow,
      accent: 'text-amber-400',
      prompt:
        'Run a system audit of our current workspace memories, calculate (1450 * 1.18) / 12, and dispatch a summary webhook to the production endpoint.',
      agent: true,
    },
  ];

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-10 sm:py-14 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full space-y-10">
          {/* Welcome */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] tracking-widest text-slate-400 uppercase">
              NEXUS 5.5
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              How can I help?
            </h1>

            <p className="text-sm sm:text-[15px] text-slate-400 max-w-md mx-auto leading-relaxed">
              Ask a question, attach a file to analyze, or hand over a task and let NEXUS
              work through it.
            </p>
          </div>

          {/* Suggested Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {suggestedActions.map((item, idx) => {
              const IconComponent = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onQuickPrompt(item.prompt, item.agent)}
                  className="group text-left p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-violet-400/35 backdrop-blur-xl transition-all cursor-pointer space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white group-hover:text-violet-200 transition-colors">
                      {item.title}
                    </span>
                    <IconComponent className={`w-4 h-4 ${item.accent} shrink-0`} />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-7">
      <div className="max-w-3xl mx-auto space-y-7">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isEditing = editingMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              {/* Message Header */}
              <div className="flex items-center gap-2 mb-2 px-1 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">
                  {isUser ? 'You' : 'NEXUS'}
                </span>
                <span className="text-slate-600">·</span>
                <span className="font-mono tabular-nums">{formatTime(msg.createdAt)}</span>

                {isUser && msg.isEdited && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500 italic">edited</span>
                  </>
                )}
              </div>

              {/* Message Surface */}
              <div
                className={`w-full ${
                  isUser ? 'max-w-xl' : 'max-w-3xl'
                } rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 backdrop-blur-xl border transition-colors ${
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
                ) : msg.error ? (
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-rose-100">
                        I couldn&apos;t reach the assistant.
                      </div>
                      <div className="text-xs text-rose-200/70 leading-relaxed">
                        This is usually temporary — please try again in a moment.
                      </div>
                    </div>
                  </div>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {/* Message Actions */}
                {!isEditing && (
                  <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center gap-4 text-xs text-slate-400">
                    {!msg.error && (
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
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
                    )}

                    {isUser && !isStreaming && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsgId(msg.id);
                          setEditingContent(msg.content);
                        }}
                        className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    )}

                    {!isUser && !isStreaming && (
                      <>
                        <button
                          type="button"
                          onClick={() => onRegenerate(msg.id)}
                          className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Regenerate</span>
                        </button>

                        {!msg.error && (
                        <button
                          type="button"
                          onClick={() => {
                            const title =
                              msg.content
                                .replace(/[#*`]/g, '')
                                .split('\n')[0]
                                ?.slice(0, 48) || 'Saved note';
                            onSaveToMemory(title, msg.content.slice(0, 600));
                            setSavedMemId(msg.id);
                            setTimeout(() => setSavedMemId(null), 2000);
                          }}
                          className="flex items-center gap-1.5 hover:text-violet-300 transition-colors cursor-pointer"
                        >
                          {savedMemId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">Saved</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming Response */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-2 px-1 text-[11px] text-slate-400">
              <span className="font-semibold text-white">NEXUS</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">thinking</span>
            </div>

            <div className="w-full max-w-3xl rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 backdrop-blur-xl bg-white/[0.04] border border-violet-400/30 text-slate-200">
              {streamingContent ? (
                <MarkdownRenderer content={streamingContent} />
              ) : (
                <div className="py-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400/70 animate-pulse [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 animate-pulse [animation-delay:300ms]" />
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
