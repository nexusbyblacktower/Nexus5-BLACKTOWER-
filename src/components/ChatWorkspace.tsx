import React, { useEffect, useRef, useState } from 'react';
import {
  BookmarkPlus,
  CalendarDays,
  Check,
  Copy,
  Edit3,
  FileText,
  Mail,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Workflow,
} from 'lucide-react';
import {
  BrainRoutingDecision,
  BrainType,
  ChatMessage,
  ToolExecutionRecord,
} from '../types/nexus.ts';
import { toolLabel } from '../utils/toolLabels.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

interface ChatWorkspaceProps {
  messages: ChatMessage[];
  streamingContent: string;
  streamingRouting: BrainRoutingDecision | null;
  streamingTools: ToolExecutionRecord[];
  isStreaming: boolean;
  activeBrain: BrainType;
  onQuickPrompt: (prompt: string, runAsAgent?: boolean) => void;
  onEditAndResend: (messageId: string, newContent: string) => void;
  onRegenerate: (assistantMessageId: string) => void;
  onSaveToMemory: (title: string, content: string) => void;
}

const suggestedActions = [
  {
    title: 'Catch up on email',
    subtitle: 'Summarize unread messages and flag what matters',
    icon: Mail,
    accent: 'text-sky-300',
    prompt:
      'Check my unread emails from the last two days, summarize the important ones, and tell me what needs a reply.',
    agent: false,
  },
  {
    title: 'Plan my week',
    subtitle: 'See your calendar and find focus time',
    icon: CalendarDays,
    accent: 'text-violet-300',
    prompt:
      'Look at my calendar for the next 7 days and suggest where I can fit two 90-minute deep work blocks.',
    agent: false,
  },
  {
    title: 'Find a document',
    subtitle: 'Search Drive and summarize the file',
    icon: Search,
    accent: 'text-emerald-300',
    prompt:
      'Find my most recently modified proposal in Google Drive and summarize the key points and next steps.',
    agent: false,
  },
  {
    title: 'Morning briefing',
    subtitle: 'Calendar, email and priorities in one pass',
    icon: Sun,
    accent: 'text-amber-300',
    prompt:
      "Give me a morning briefing: today's calendar, unread email highlights, and the three things I should act on first.",
    agent: true,
  },
];

function ActivityChips({ tools }: { tools: ToolExecutionRecord[] }) {
  if (tools.length === 0) return null;
  const labels = Array.from(new Set(tools.map((tool) => toolLabel(tool.toolName))));
  const failed = tools.some((tool) => tool.status === 'failed');

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] text-slate-300"
        >
          <Sparkles className="w-3 h-3 text-violet-300" />
          {label}
        </span>
      ))}
      {failed && (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-400/25 text-[11px] text-amber-200">
          One step needs attention
        </span>
      )}
    </div>
  );
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  streamingContent,
  streamingRouting,
  streamingTools,
  isStreaming,
  activeBrain,
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
      // Clipboard permissions are optional.
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-10 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-[11px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Ready when you are
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
              What should we handle?
            </h1>
            <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
              NEXUS reads your mail, checks your calendar, finds documents and gets things done —
              then tells you plainly what happened.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suggestedActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onQuickPrompt(item.prompt, item.agent)}
                  className="group text-left p-4 rounded-2xl bg-white/[0.045] hover:bg-white/[0.075] border border-white/[0.09] hover:border-violet-400/30 backdrop-blur-xl transition-all cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white group-hover:text-violet-200 transition-colors">
                        {item.title}
                      </span>
                      <Icon className={`w-4 h-4 ${item.accent} shrink-0`} />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.subtitle}</p>
                  </div>
                  <div className="text-[11px] text-slate-500 group-hover:text-slate-300 flex items-center justify-between pt-2 border-t border-white/[0.06]">
                    <span className="flex items-center gap-1.5">
                      {item.agent ? (
                        <Workflow className="w-3 h-3 text-cyan-400" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-violet-400" />
                      )}
                      {item.agent ? 'Runs as a task' : 'Ask NEXUS'}
                    </span>
                    <span>→</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              {activeBrain === 'REASONING' ? 'Deep mode' : 'Fast mode'} active
            </span>
            <span>Connect Google Workspace to let NEXUS act on mail, calendar and files.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isEditing = editingMsgId === msg.id;
          const tools = msg.toolExecutions || [];

          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] text-slate-400">
                <span className="font-medium text-slate-300">{isUser ? 'You' : 'NEXUS'}</span>
                <span>·</span>
                <span className="tabular-nums">{formatTime(msg.createdAt)}</span>
                {isUser && msg.isEdited && (
                  <>
                    <span>·</span>
                    <span className="text-slate-500 italic">edited</span>
                  </>
                )}
              </div>

              <div
                className={`w-full ${isUser ? 'max-w-2xl' : 'max-w-3xl'} rounded-2xl p-4 backdrop-blur-xl border ${
                  isUser
                    ? 'bg-violet-500/[0.12] border-violet-400/20 text-slate-100'
                    : msg.error
                    ? 'bg-rose-950/25 border-rose-500/30 text-rose-100'
                    : 'bg-white/[0.045] border-white/[0.08] text-slate-200'
                }`}
              >
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {msg.attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/25 border border-white/[0.08] text-xs text-slate-300"
                      >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{att.name}</span>
                        <span className="text-slate-500 text-[10px]">
                          {(att.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!isUser && <ActivityChips tools={tools} />}

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
                        Save & send
                      </button>
                    </div>
                  </div>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {!isEditing && (
                  <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center gap-3 text-[11px] text-slate-400">
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
                        <span>Edit</span>
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
                          <span>Retry</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const title =
                              msg.content.replace(/[#*`]/g, '').split('\n')[0]?.slice(0, 48) ||
                              'Saved insight';
                            onSaveToMemory(title, msg.content.slice(0, 600));
                            setSavedMemId(msg.id);
                            setTimeout(() => setSavedMemId(null), 2000);
                          }}
                          className="flex items-center gap-1 hover:text-violet-300 transition-colors cursor-pointer"
                        >
                          {savedMemId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">Remembered</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3.5 h-3.5" />
                              <span>Remember this</span>
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] text-slate-400">
              <span className="font-medium text-white">NEXUS</span>
              <span>·</span>
              <span className="text-violet-300">working…</span>
            </div>

            <div className="w-full max-w-3xl rounded-2xl p-4 backdrop-blur-xl bg-white/[0.045] border border-violet-400/25 text-slate-200 space-y-3">
              <ActivityChips tools={streamingTools} />

              {streamingContent ? (
                <MarkdownRenderer content={streamingContent} />
              ) : (
                <div className="flex items-center gap-2 py-1.5 text-xs text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  {streamingRouting?.selectedBrain === 'REASONING'
                    ? 'Thinking it through…'
                    : 'On it…'}
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
