import React, { useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  FolderKanban,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  Workflow,
  Wrench,
  X,
} from 'lucide-react';
import { Conversation, ProjectWorkspace } from '../types/nexus.ts';

interface LeftSidebarProps {
  collapsed: boolean;
  overlay?: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  projects: ProjectWorkspace[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onOpenProjectsModal: () => void;
  onOpenAgentPanel: () => void;
  onOpenMemoryModal: () => void;
  onOpenToolsModal: () => void;
  onOpenSettingsModal: () => void;
  memoryCount: number;
  toolsCount: number;
  tasksCount: number;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  collapsed,
  overlay = false,
  conversations,
  activeConversationId,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenProjectsModal,
  onOpenAgentPanel,
  onOpenMemoryModal,
  onOpenToolsModal,
  onOpenSettingsModal,
  memoryCount,
  toolsCount,
  tasksCount,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  if (collapsed) {
    return (
      <aside className="w-14 border-r border-white/[0.08] bg-[#090b11]/75 backdrop-blur-2xl flex flex-col items-center py-4 gap-3 shrink-0 z-20 select-none">
        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className="w-9 h-9 rounded-xl bg-violet-600/25 hover:bg-violet-600/40 border border-violet-400/30 flex items-center justify-center text-violet-200 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-6 border-t border-white/[0.08] my-1" />

        <button
          type="button"
          onClick={onOpenProjectsModal}
          title="Projects"
          className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <FolderKanban className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenAgentPanel}
          title="Agent tasks"
          className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <Workflow className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenMemoryModal}
          title="Memory"
          className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <Database className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenToolsModal}
          title="Tools"
          className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <Wrench className="w-4 h-4" />
        </button>

        <div className="mt-auto">
          <button
            type="button"
            onClick={onOpenSettingsModal}
            title="Settings"
            className="w-9 h-9 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`w-72 border-r border-white/[0.08] bg-[#090b11]/95 backdrop-blur-2xl flex flex-col shrink-0 select-none ${
        overlay ? 'fixed top-16 bottom-0 left-0 z-40 shadow-2xl' : 'z-20'
      }`}
    >
      {/* New Chat + Search */}
      <div className="p-4 space-y-3 border-b border-white/[0.07]">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-violet-600/30 via-violet-500/20 to-cyan-500/20 hover:from-violet-600/40 hover:to-cyan-500/30 border border-violet-400/30 text-white text-xs font-semibold flex items-center justify-between transition-all shadow-sm cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-violet-300" />
            <span>New chat</span>
          </span>
          <span className="font-mono text-[11px] text-slate-400">⌘K</span>
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats"
            className="w-full pl-8 pr-8 py-2 rounded-lg bg-white/[0.03] border border-white/[0.07] focus:border-violet-400/40 focus:outline-none text-xs text-slate-200 placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Projects Filter Section */}
      <div className="px-4 py-3 border-b border-white/[0.07]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Projects
          </span>
          <button
            type="button"
            onClick={onOpenProjectsModal}
            className="text-[11px] text-violet-300 hover:text-violet-200 cursor-pointer"
          >
            Manage
          </button>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
              selectedProjectId === null
                ? 'bg-white/[0.07] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
            }`}
          >
            <span className="truncate">All workspaces</span>
          </button>
          {projects.map((proj) => (
            <button
              key={proj.id}
              type="button"
              onClick={() => onSelectProject(proj.id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                selectedProjectId === proj.id
                  ? 'bg-violet-500/20 text-violet-100 border border-violet-500/25 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              <span className="truncate">{proj.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Chats List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        <div className="px-2 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
            Chats
          </span>
          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-slate-500">
            No chats yet. Start a new one above.
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between gap-1.5 px-2.5 py-2.5 rounded-xl text-xs transition-colors ${
                  isActive
                    ? 'bg-white/[0.08] text-white border border-white/[0.1]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 w-full">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editingTitle.trim()) {
                          onRenameConversation(conv.id, editingTitle.trim());
                          setEditingId(null);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      className="flex-1 bg-[#06070b] border border-violet-400/40 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (editingTitle.trim()) {
                          onRenameConversation(conv.id, editingTitle.trim());
                        }
                        setEditingId(null);
                      }}
                      className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conv.id)}
                      className="flex-1 flex items-center gap-2.5 text-left min-w-0 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                      <span className="truncate font-medium">{conv.title}</span>
                    </button>

                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        title="Rename chat"
                        onClick={() => {
                          setEditingId(conv.id);
                          setEditingTitle(conv.title);
                        }}
                        className="p-1 rounded hover:bg-white/[0.08] text-slate-400 hover:text-white cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="Delete chat"
                        onClick={() => onDeleteConversation(conv.id)}
                        className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="p-3 border-t border-white/[0.08] space-y-1 bg-[#07080d]/60">
        <button
          type="button"
          onClick={onOpenAgentPanel}
          className="w-full px-2.5 py-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Workflow className="w-3.5 h-3.5 text-cyan-400" />
            <span>Agent tasks</span>
          </span>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums">{tasksCount}</span>
        </button>

        <button
          type="button"
          onClick={onOpenMemoryModal}
          className="w-full px-2.5 py-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Database className="w-3.5 h-3.5 text-violet-400" />
            <span>Memory</span>
          </span>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums">{memoryCount}</span>
        </button>

        <button
          type="button"
          onClick={onOpenToolsModal}
          className="w-full px-2.5 py-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Wrench className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tools</span>
          </span>
          <span className="font-mono text-[11px] text-slate-500 tabular-nums">{toolsCount}</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettingsModal}
          className="w-full px-2.5 py-2.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] flex items-center justify-between transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>Settings</span>
          </span>
        </button>
      </div>
    </aside>
  );
};
