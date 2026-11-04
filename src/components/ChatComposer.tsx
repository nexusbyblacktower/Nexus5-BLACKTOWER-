import React, { useRef, useState } from 'react';
import {
  Brain,
  FileText,
  Paperclip,
  Send,
  Square,
  Workflow,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  FileAttachment,
  NexusSettings,
} from '../types/nexus.ts';

interface ChatComposerProps {
  onSendMessage: (content: string, attachments: FileAttachment[]) => void;
  onRunAsAgentTask: (objective: string, attachments: FileAttachment[]) => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  activeBrain: BrainType;
  brainMode: BrainRoutingMode;
  settings: NexusSettings;
  onChangeBrainMode: (mode: BrainRoutingMode) => void;
  onSelectBrain: (brain: BrainType) => void;
}

const ALLOWED_EXTENSIONS = [
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.sql',
  '.yaml',
  '.yml',
  '.log',
  '.xml',
  '.html',
  '.css',
];

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSendMessage,
  onRunAsAgentTask,
  onStopGeneration,
  isStreaming,
  activeBrain,
  brainMode,
  settings,
  onChangeBrainMode,
  onSelectBrain,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const enabledToolCount = Object.values(settings.enabledTools).filter(Boolean).length;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: FileAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

      if (!hasValidExt && !file.type.startsWith('text/')) {
        setUploadError(
          `Unsupported file type for "${file.name}". Allowed: text, code, JSON, CSV, Markdown, or log files.`
        );
        continue;
      }

      if (file.size > 1024 * 1024) {
        setUploadError(`File "${file.name}" exceeds the 1 MB security limit.`);
        continue;
      }

      try {
        const text = await file.text();
        newAttachments.push({
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          contentText: text,
        });
      } catch {
        setUploadError(`Could not read file "${file.name}".`);
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments].slice(0, 5));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (isStreaming) return;
    if (!input.trim() && attachments.length === 0) return;

    const promptText =
      input.trim() ||
      `Analyze the attached file(s): ${attachments.map((a) => a.name).join(', ')}`;

    onSendMessage(promptText, attachments);
    setInput('');
    setAttachments([]);
    setUploadError(null);
  };

  const handleAgentDispatch = () => {
    if (isStreaming) return;
    if (!input.trim() && attachments.length === 0) return;

    const objective =
      input.trim() ||
      `Perform multi-step agent inspection on attached file(s): ${attachments
        .map((a) => a.name)
        .join(', ')}`;

    onRunAsAgentTask(objective, attachments);
    setInput('');
    setAttachments([]);
    setUploadError(null);
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0 z-20">
      <div className="max-w-4xl mx-auto">
        {uploadError && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Glass Composer Surface */}
        <div className="rounded-2xl bg-[#0d1018]/85 backdrop-blur-2xl border border-white/[0.1] focus-within:border-violet-400/45 shadow-2xl transition-colors">
          {/* Attached Files Strip */}
          {attachments.length > 0 && (
            <div className="px-3.5 pt-3 pb-1 flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.09] text-xs text-slate-200"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate max-w-[180px]">{att.name}</span>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    {(att.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((item) => item.id !== att.id))
                    }
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Multiline Textarea */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            rows={Math.min(6, Math.max(2, input.split('\n').length))}
            placeholder="Command NEXUS 5.5 — ask a question, analyze files, or dispatch a multi-step agent task... (Enter to send, Shift+Enter for newline)"
            className="w-full px-4 pt-3.5 pb-2 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
          />

          {/* Bottom Composer Toolbar */}
          <div className="px-3 pb-2.5 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05]">
            {/* Left Controls: Attachment, Brain Mode, Model Selector, Tool Indicator */}
            <div className="flex items-center flex-wrap gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach text, code, JSON, or CSV file for analysis"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] transition-colors cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span>Attach</span>
              </button>

              {/* Mode Selector */}
              <button
                type="button"
                onClick={() => onChangeBrainMode(brainMode === 'AUTO' ? 'MANUAL' : 'AUTO')}
                title="Switch between AUTO complexity routing and MANUAL brain lock"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  brainMode === 'AUTO'
                    ? 'bg-violet-500/15 border-violet-400/30 text-violet-200'
                    : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200'
                }`}
              >
                Mode: {brainMode}
              </button>

              {/* Active Brain Toggle */}
              <button
                type="button"
                onClick={() =>
                  onSelectBrain(activeBrain === 'FLASH' ? 'REASONING' : 'FLASH')
                }
                title={`Current Brain: ${activeBrain}. Click to switch between FLASH (${settings.flashModelId}) and REASONING (${settings.reasoningModelId}).`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-slate-200 transition-colors cursor-pointer"
              >
                {activeBrain === 'FLASH' ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>FLASH</span>
                    <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                      ({settings.flashModelId})
                    </span>
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                    <span>REASONING</span>
                    <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                      ({settings.reasoningModelId})
                    </span>
                  </>
                )}
              </button>

              {/* Active Tools Indicator */}
              <div
                title={`${enabledToolCount} verified backend tools enabled`}
                className="hidden sm:flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-400 font-mono"
              >
                <Wrench className="w-3 h-3 text-emerald-400" />
                <span>{enabledToolCount} tools ready</span>
              </div>
            </div>

            {/* Right Controls: Run as Agent Task + Send / Stop */}
            <div className="flex items-center gap-2">
              {!isStreaming && (
                <button
                  type="button"
                  onClick={handleAgentDispatch}
                  disabled={!input.trim() && attachments.length === 0}
                  title="Execute through the 7-phase Agent Operating Protocol (UNDERSTAND → PLAN → SELECT → EXECUTE → VERIFY → RESPOND)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-violet-500/20 border border-white/[0.09] hover:border-violet-400/35 text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Run Agent Protocol</span>
                </button>
              )}

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/25 hover:bg-rose-500/35 border border-rose-400/40 text-rose-100 transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim() && attachments.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-md disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
