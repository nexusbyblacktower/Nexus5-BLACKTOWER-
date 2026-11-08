import React, { useRef, useState } from 'react';
import {
  Brain,
  FileText,
  Paperclip,
  Send,
  Square,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  FileAttachment,
} from '../types/nexus.ts';

interface ChatComposerProps {
  onSendMessage: (content: string, attachments: FileAttachment[]) => void;
  onRunAsAgentTask: (objective: string, attachments: FileAttachment[]) => void;
  onStopGeneration: () => void;
  isStreaming: boolean;
  activeBrain: BrainType;
  brainMode: BrainRoutingMode;
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
  onChangeBrainMode,
  onSelectBrain,
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const next: FileAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lowerName = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

      if (!hasValidExt && !file.type.startsWith('text/')) {
        setUploadError(`"${file.name}" is not a supported file. Use text, code, JSON, CSV or Markdown.`);
        continue;
      }
      if (file.size > 1024 * 1024) {
        setUploadError(`"${file.name}" is larger than 1 MB.`);
        continue;
      }

      try {
        const text = await file.text();
        next.push({
          id: `att-${Date.now()}-${i}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          contentText: text,
        });
      } catch {
        setUploadError(`Could not read "${file.name}".`);
      }
    }

    setAttachments((prev) => [...prev, ...next].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = () => {
    if (isStreaming) return;
    if (!input.trim() && attachments.length === 0) return;

    const promptText =
      input.trim() || `Analyze the attached file(s): ${attachments.map((a) => a.name).join(', ')}`;

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
      `Work on the attached file(s): ${attachments.map((a) => a.name).join(', ')}`;

    onRunAsAgentTask(objective, attachments);
    setInput('');
    setAttachments([]);
    setUploadError(null);
  };

  return (
    <div className="px-4 pb-4 pt-2 shrink-0 z-20">
      <div className="max-w-3xl mx-auto">
        {uploadError && (
          <div className="mb-2 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
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

        <div className="rounded-2xl bg-white/[0.055] backdrop-blur-2xl border border-white/[0.12] focus-within:border-violet-400/40 shadow-2xl transition-colors">
          {attachments.length > 0 && (
            <div className="px-3.5 pt-3 pb-1 flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.09] text-xs text-slate-200"
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate max-w-[180px]">{att.name}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {(att.sizeBytes / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
            placeholder="Ask NEXUS to do something… (Enter to send, Shift+Enter for a new line)"
            className="w-full px-4 pt-3.5 pb-2 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
          />

          <div className="px-3 pb-2.5 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06]">
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
                title="Attach a text or code file"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] transition-colors cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span>Attach</span>
              </button>

              <button
                type="button"
                onClick={() => onChangeBrainMode(brainMode === 'AUTO' ? 'MANUAL' : 'AUTO')}
                title="Auto picks the right depth; Manual keeps your choice"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  brainMode === 'AUTO'
                    ? 'bg-violet-500/15 border-violet-400/30 text-violet-200'
                    : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200'
                }`}
              >
                {brainMode === 'AUTO' ? 'Auto' : 'Manual'}
              </button>

              <button
                type="button"
                onClick={() => onSelectBrain(activeBrain === 'FLASH' ? 'REASONING' : 'FLASH')}
                title="Switch between fast answers and deeper reasoning"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-slate-200 transition-colors cursor-pointer"
              >
                {activeBrain === 'FLASH' ? (
                  <>
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Fast</span>
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5 text-violet-400" />
                    <span>Deep</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2">
              {!isStreaming && (
                <button
                  type="button"
                  onClick={handleAgentDispatch}
                  disabled={!input.trim() && attachments.length === 0}
                  title="Run this as a multi-step task"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/[0.04] hover:bg-violet-500/20 border border-white/[0.09] hover:border-violet-400/35 text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                >
                  <Workflow className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Run as task</span>
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
