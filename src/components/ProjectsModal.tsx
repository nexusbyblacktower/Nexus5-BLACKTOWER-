import React, { useState } from 'react';
import { FolderKanban, Plus, Trash2, X } from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  ProjectWorkspace,
} from '../types/nexus.ts';

interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectWorkspace[];
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onCreateProject: (input: {
    name: string;
    description: string;
    systemInstructions: string;
    defaultBrain: BrainType;
    defaultMode: BrainRoutingMode;
    colorAccent: 'violet' | 'cyan' | 'emerald' | 'amber';
  }) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  onClose,
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [defaultBrain, setDefaultBrain] = useState<BrainType>('REASONING');
  const [defaultMode, setDefaultMode] = useState<BrainRoutingMode>('AUTO');

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreateProject({
      name: name.trim(),
      description: description.trim() || 'Dedicated BLACKTOWER operational project.',
      systemInstructions:
        systemInstructions.trim() ||
        'Maintain strict technical precision and executive clarity.',
      defaultBrain,
      defaultMode,
      colorAccent: defaultBrain === 'REASONING' ? 'violet' : 'cyan',
    });
    setName('');
    setDescription('');
    setSystemInstructions('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl max-h-[86vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderKanban className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Project Workspaces
              </h2>
              <p className="text-xs text-slate-400">
                Isolate conversations, custom system directives, and scoped project memory.
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

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Create Project Form */}
          <form onSubmit={handleCreate} className="md:col-span-5 space-y-3">
            <div className="text-xs font-semibold text-white">
              Create Project Workspace
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Quantum Ledger Audit"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Brief Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scope and objective of this workspace"
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Project System Directives
              </label>
              <textarea
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                rows={3}
                placeholder="Custom instructions injected into NEXUS whenever this project is active..."
                className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Default Brain
                </label>
                <select
                  value={defaultBrain}
                  onChange={(e) => setDefaultBrain(e.target.value as BrainType)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white"
                >
                  <option value="FLASH" className="bg-[#0b0e17]">
                    FLASH
                  </option>
                  <option value="REASONING" className="bg-[#0b0e17]">
                    REASONING
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Default Router
                </label>
                <select
                  value={defaultMode}
                  onChange={(e) => setDefaultMode(e.target.value as BrainRoutingMode)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white"
                >
                  <option value="AUTO" className="bg-[#0b0e17]">
                    AUTO
                  </option>
                  <option value="MANUAL" className="bg-[#0b0e17]">
                    MANUAL
                  </option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workspace</span>
            </button>
          </form>

          {/* Existing Projects */}
          <div className="md:col-span-7 space-y-2.5">
            <div className="text-xs font-semibold text-white">
              Active Workspaces ({projects.length})
            </div>

            <div className="space-y-2.5 max-h-[54vh] overflow-y-auto pr-1">
              {projects.map((p) => {
                const isSelected = selectedProjectId === p.id;
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-xl border transition-colors space-y-2 ${
                      isSelected
                        ? 'bg-violet-500/15 border-violet-400/35'
                        : 'bg-white/[0.03] border-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {p.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Default: {p.defaultBrain} · Mode: {p.defaultMode}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectProject(isSelected ? null : p.id);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.12] text-white cursor-pointer"
                        >
                          {isSelected ? 'Active' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProject(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300">{p.description}</p>
                    <div className="p-2 rounded-lg bg-black/40 text-[11px] font-mono text-slate-400">
                      Directives: {p.systemInstructions}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
