import React, { useState } from 'react';
import { Check, Edit3, Lock, Plus, Search, Trash2, X } from 'lucide-react';
import {
  MEMORY_LAYERS,
  MemoryEntry,
  MemoryLayer,
  MemoryStoreStatus,
  ProjectWorkspace,
} from '../types/nexus.ts';

interface MemoryModalProps {
  open: boolean;
  onClose: () => void;
  memories: MemoryEntry[];
  projects: ProjectWorkspace[];
  storeStatus: MemoryStoreStatus | null;
  onCreateMemory: (input: {
    layer: MemoryLayer;
    title: string;
    content: string;
    projectId?: string | null;
    tags?: string[];
    userApproved?: boolean;
  }) => Promise<void>;
  onUpdateMemory: (
    id: string,
    updates: Partial<
      Pick<MemoryEntry, 'title' | 'content' | 'layer' | 'tags' | 'userApproved' | 'projectId'>
    >
  ) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none focus:border-violet-400/50';
const labelClass = 'block text-[11px] text-slate-400 mb-1';

export const MemoryModal: React.FC<MemoryModalProps> = ({
  open,
  onClose,
  memories,
  projects,
  storeStatus,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
}) => {
  const [selectedLayer, setSelectedLayer] = useState<MemoryLayer | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [newLayer, setNewLayer] = useState<MemoryLayer>('long_term');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newTags, setNewTags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const filtered = memories.filter((m) => {
    if (selectedLayer !== 'ALL' && m.layer !== selectedLayer) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateMemory({
        layer: newLayer,
        title: newTitle.trim(),
        content: newContent.trim(),
        projectId: newLayer === 'mid_term' && newProjectId ? newProjectId : null,
        tags: newTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        userApproved: true,
      });
      setNewTitle('');
      setNewContent('');
      setNewTags('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const storeReady = storeStatus?.state === 'ready';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4">
      <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white">Memory</h2>
            <p className="text-xs text-slate-400">
              What your assistant remembers about you, over time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-400 leading-relaxed">
              {storeReady
                ? 'Stored in your own Supabase database, encrypted on this server before it is saved. Only you can read it.'
                : storeStatus?.detail ||
                  'Memory needs a Supabase connection before anything can be saved.'}
              {storeStatus?.encrypted === false && ' Encryption is currently unavailable.'}
            </div>
          </div>

          {error && <p className="text-[11px] text-rose-300">{error}</p>}

          {/* Add memory */}
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="text-xs font-semibold text-white">Remember something</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MEMORY_LAYERS.map((layer) => {
                const active = newLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setNewLayer(layer.id)}
                    className={`text-left p-2.5 rounded-xl border cursor-pointer ${
                      active
                        ? 'border-violet-400/50 bg-violet-500/15'
                        : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">{layer.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                      {layer.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {newLayer === 'mid_term' && (
              <div>
                <label className={labelClass}>Project (optional)</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className={inputClass}
                >
                  <option value="" className="bg-[#0b0e17]">
                    All projects
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#0b0e17]">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelClass}>Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. How I like technical explanations"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>What should it remember?</label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={3}
                placeholder="Write it the way you would explain it to a new colleague."
                className={`${inputClass} resize-y leading-relaxed`}
              />
            </div>

            <div>
              <label className={labelClass}>Tags (comma separated, optional)</label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="work, writing, preferences"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={busy || !newTitle.trim() || !newContent.trim()}
              className="w-full py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{busy ? 'Saving…' : 'Save memory'}</span>
            </button>
          </form>

          {/* Browse */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07] overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSelectedLayer('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    selectedLayer === 'ALL'
                      ? 'bg-violet-500/25 text-violet-100'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({memories.length})
                </button>
                {MEMORY_LAYERS.map((layer) => {
                  const count = memories.filter((m) => m.layer === layer.id).length;
                  const active = selectedLayer === layer.id;
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setSelectedLayer(layer.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-violet-500/25 text-violet-100'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {layer.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search memory…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2.5 lg:max-h-[40vh] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  Nothing here yet.
                </div>
              ) : (
                filtered.map((mem) => {
                  const isEditing = editingId === mem.id;
                  const layerLabel =
                    MEMORY_LAYERS.find((l) => l.id === mem.layer)?.label || mem.layer;
                  return (
                    <div
                      key={mem.id}
                      className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#07090e] border border-violet-400/40 text-xs text-white"
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#07090e] border border-violet-400/40 text-xs text-white"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await onUpdateMemory(mem.id, {
                                    title: editTitle,
                                    content: editContent,
                                  });
                                  setEditingId(null);
                                } catch (err) {
                                  setError((err as Error).message);
                                }
                              }}
                              className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-white truncate">
                                {mem.title}
                              </div>
                              <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5">
                                <span className="text-violet-300">{layerLabel}</span>
                                <span>·</span>
                                <span>{mem.userApproved ? 'In use' : 'Paused'}</span>
                                {mem.tags.length > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">{mem.tags.join(', ')}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await onUpdateMemory(mem.id, {
                                      userApproved: !mem.userApproved,
                                    });
                                  } catch (err) {
                                    setError((err as Error).message);
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer ${
                                  mem.userApproved
                                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                                }`}
                              >
                                {mem.userApproved ? 'On' : 'Off'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(mem.id);
                                  setEditTitle(mem.title);
                                  setEditContent(mem.content);
                                }}
                                className="p-1 text-slate-400 hover:text-white cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await onDeleteMemory(mem.id);
                                  } catch (err) {
                                    setError((err as Error).message);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">{mem.content}</p>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
