import React, { useState } from 'react';
import {
  Brain,
  PanelLeft,
  PanelRight,
  Plug,
  Settings,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  ProjectWorkspace,
} from '../types/nexus.ts';

interface TopBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
  activeBrain: BrainType;
  brainMode: BrainRoutingMode;
  activeProject: ProjectWorkspace | null;
  operator: {
    name: string;
    role: string;
    organization: string;
    clearanceLevel: string;
  } | null;
  googleConnected: boolean;
  onChangeBrainMode: (mode: BrainRoutingMode) => void;
  onSelectBrain: (brain: BrainType) => void;
  onOpenSettings: () => void;
  onOpenConnections: () => void;
  activeTasksCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
  agentPanelOpen,
  onToggleAgentPanel,
  activeBrain,
  brainMode,
  activeProject,
  operator,
  googleConnected,
  onChangeBrainMode,
  onSelectBrain,
  onOpenSettings,
  onOpenConnections,
  activeTasksCount,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="h-14 px-4 flex items-center justify-between gap-4 border-b border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl shrink-0 z-30 select-none">
      {/* Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 via-violet-600/20 to-cyan-500/20 border border-violet-400/30 flex items-center justify-center shadow-inner">
            <span className="font-mono text-xs font-bold tracking-tighter text-violet-200">BT</span>
          </div>
          <div className="hidden sm:flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-xs font-semibold tracking-wider text-slate-400">BLACKTOWER™</span>
            <span className="text-slate-600">/</span>
            <span className="text-sm font-bold tracking-tight text-white">NEXUS 5.5</span>
          </div>
        </div>

        {activeProject && (
          <div className="hidden lg:flex items-center gap-2 pl-2 text-xs text-slate-400 truncate">
            <span className="text-slate-600">·</span>
            <span className="text-violet-300 font-medium truncate max-w-[180px]">
              {activeProject.name}
            </span>
          </div>
        )}
      </div>

      {/* Mode + depth */}
      <div className="hidden sm:flex items-center gap-2.5">
        <div
          role="group"
          aria-label="Routing mode"
          className="flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]"
        >
          <button
            type="button"
            onClick={() => onChangeBrainMode('AUTO')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              brainMode === 'AUTO'
                ? 'bg-violet-500/25 text-violet-100 border border-violet-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => onChangeBrainMode('MANUAL')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              brainMode === 'MANUAL'
                ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual
          </button>
        </div>

        <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => onSelectBrain('FLASH')}
            title="Fast responses"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeBrain === 'FLASH'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>Fast</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectBrain('REASONING')}
            title="Deeper multi-step reasoning"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              activeBrain === 'REASONING'
                ? 'bg-violet-500/25 text-violet-200 border border-violet-400/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-violet-400" />
            <span>Deep</span>
          </button>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={onOpenConnections}
          title="Connections"
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-colors whitespace-nowrap cursor-pointer ${
            googleConnected
              ? 'bg-emerald-500/10 border-emerald-400/25 text-emerald-200'
              : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Plug className="w-3.5 h-3.5" />
          <span>{googleConnected ? 'Google connected' : 'Connect Google'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleAgentPanel}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
            agentPanelOpen
              ? 'bg-violet-500/20 border-violet-400/30 text-violet-200'
              : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <PanelRight className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tasks</span>
          {activeTasksCount > 0 && (
            <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
              ({activeTasksCount})
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 rounded-md bg-violet-500/30 flex items-center justify-center text-violet-200">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="hidden lg:inline text-xs font-medium text-slate-200 whitespace-nowrap">
              {operator?.name || 'You'}
            </span>
          </button>

          {profileOpen && (
            <div
              onMouseLeave={() => setProfileOpen(false)}
              className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#12141c]/95 backdrop-blur-2xl border border-white/[0.1] shadow-2xl p-4 z-50 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {operator?.name || 'You'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {operator?.organization || 'BLACKTOWER™'}
                  </div>
                </div>
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenConnections();
                }}
                className="w-full flex items-center justify-between text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                <span>Connections</span>
                <span className={googleConnected ? 'text-emerald-300' : 'text-slate-500'}>
                  {googleConnected ? 'Google connected' : 'Google off'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenSettings();
                }}
                className="text-xs font-medium text-violet-300 hover:text-violet-200 cursor-pointer"
              >
                Open settings →
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
