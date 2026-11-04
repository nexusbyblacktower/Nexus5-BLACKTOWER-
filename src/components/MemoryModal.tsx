import React, { useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  MemoryCategory,
  MemoryEntry,
  ProjectWorkspace,
} from '../types/nexus.ts';

interface MemoryModalProps {
  open: boolean;
  onClose: () => void;
  memories: MemoryEntry[];
  projects: ProjectWorkspace[];
  onCreateMemory: (input: {
    category: MemoryCategory;
    title: string;
    content: string;
    projectId?: string | null;
    tags?: string[];
    userApproved?: boolean;
  }) => Promise<void>;
  onUpdateMemory: (
    id: string,
    updates: Partial<
      Pick<MemoryEntry, 'title' | 'content' | 'category' | 'tags' | 'userApproved' | 'projectId'>
    >
  ) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
}

const CATEGORY_LABELS: { id: MemoryCategory; label: string; desc: string }[] = [
  {
    id: 'user_memory',
    label: 'User Memory',
    desc: 'Long-term operator preferences, communication style, and identity context.',
  },
  {
    id: 'project_memory',
    label: 'Project Memory',
    desc: 'Domain knowledge, architectural decisions, and constraints scoped to a project.',
  },
  {
    id: 'conversation_context',
    label: 'Conversation Context',
    desc: 'Facts and decisions pinned to a specific operational session.',
  },
  {
    id: 'temporary_task_context',
    label: 'Temporary Task Context',
    desc: 'Short-lived scratchpad variables and active task state.',
  },
];

export const MemoryModal: React.FC<MemoryModalProps> = ({
  open,
  onClose,
  memories,
  projects,
  onCreateMemory,
  onUpdateMemory,
  onDeleteMemory,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('user_memory');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newProjectId, setNewProjectId] = useState<string>('');
  const [newTags, setNewTags] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  if (!open) return null;

  const filtered = memories.filter((m) => {
    if (selectedCategory !== 'ALL' && m.category !== selectedCategory) return false;
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
    await onCreateMemory({
      category: newCategory,
      title: newTitle.trim(),
      content: newContent.trim(),
      projectId: newCategory === 'project_memory' && newProjectId ? newProjectId : null,
      tags: newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      userApproved: true,
    });
    setNewTitle('');
    setNewContent('');
    setNewTags('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                NEXUS 4-Tier Memory Vault
              </h2>
              <p className="text-xs text-slate-400">
                Explicitly separated from raw chat logs. Only approved memories are injected into runtime context.
              </p>
            </div>
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
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Add Memory Form */}
          <form onSubmit={handleAdd} className="lg:col-span-5 space-y-3.5">
            <div className="text-xs font-semibold text-white">
              Store Authorized Memory
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Memory Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
              >
                {CATEGORY_LABELS.map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-[#0b0e17]">
                    {cat.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {CATEGORY_LABELS.find((c) => c.id === newCategory)?.desc}
              </p>
            </div>

            {newCategory === 'project_memory' && (
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Target Project Scope
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
                >
                  <option value="" className="bg-[#0b0e17]">
                    Global Project Memory
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
              <label className="block text-[11px] text-slate-400 mb-1">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., API Rate Limiting Standard"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Memory Content
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Explicit factual context or preference to persist across sessions..."
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="architecture, security, preferences"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!newTitle.trim() || !newContent.trim()}
              className="w-full py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Save Approved Memory</span>
            </button>
          </form>

          {/* Right Column: Memory Vault Browser */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            {/* Category Filter Tabs + Search */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    selectedCategory === 'ALL'
                      ? 'bg-violet-500/25 text-violet-100'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({memories.length})
                </button>
                {CATEGORY_LABELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                      selectedCategory === c.id
                        ? 'bg-violet-500/25 text-violet-100'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {c.label.split(' ')[0]}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter memories..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Memories List */}
            <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No memories match the current filter.
                </div>
              ) : (
                filtered.map((mem) => {
                  const isEditing = editingId === mem.id;
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
                                await onUpdateMemory(mem.id, {
                                  title: editTitle,
                                  content: editContent,
                                });
                                setEditingId(null);
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
                            <div>
                              <div className="text-xs font-semibold text-white">
                                {mem.title}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                                <span className="text-violet-300">{mem.category}</span>
                                <span>·</span>
                                <span>
                                  {mem.userApproved ? 'Approved for Context' : 'Paused'}
                                </span>
                                {mem.tags.length > 0 && (
                                  <>
                                    <span>·</span>
                                    <span>{mem.tags.join(', ')}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateMemory(mem.id, {
                                    userApproved: !mem.userApproved,
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                                  mem.userApproved
                                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                                }`}
                              >
                                {mem.userApproved ? 'Active' : 'Muted'}
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
                                onClick={() => onDeleteMemory(mem.id)}
                                className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">
                            {mem.content}
                          </p>
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
