import React, { useState } from 'react';
import { PanelLeft, PanelRight, Settings, User } from 'lucide-react';

interface TopBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  agentPanelOpen: boolean;
  onToggleAgentPanel: () => void;
  activeTasksCount: number;
  operator: {
    name: string;
    role: string;
    organization: string;
    clearanceLevel: string;
  } | null;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
  agentPanelOpen,
  onToggleAgentPanel,
  activeTasksCount,
  operator,
  onOpenSettings,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="h-16 px-3 sm:px-5 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[#0a0c12]/80 backdrop-blur-2xl shrink-0 z-30 select-none">
      {/* Left Zone: Sidebar toggle + brand */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 via-violet-600/20 to-cyan-500/20 border border-violet-400/30 flex items-center justify-center shadow-inner shrink-0">
            <span className="font-mono text-xs font-bold tracking-tighter text-violet-200">
              BT
            </span>
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-bold tracking-tight text-white truncate">
              NEXUS 5.5
            </span>
            <span className="hidden sm:block text-[10px] tracking-widest text-slate-500 uppercase">
              Workspace
            </span>
          </div>
        </div>
      </div>

      {/* Right Zone: Agent panel toggle, settings, profile */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={onToggleAgentPanel}
          title="Agent tasks"
          className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
            agentPanelOpen
              ? 'bg-violet-500/20 border-violet-400/30 text-violet-200'
              : 'bg-white/[0.03] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <PanelRight className="w-4 h-4" />
          <span className="hidden md:inline">Agent</span>
          {activeTasksCount > 0 && (
            <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
              {activeTasksCount}
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

        {/* Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 sm:pl-1.5 sm:pr-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer"
          >
            <div className="w-6 h-6 rounded-md bg-violet-500/30 flex items-center justify-center text-violet-200">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="hidden lg:inline text-xs font-medium text-slate-200 whitespace-nowrap">
              {operator?.name || 'Operator'}
            </span>
          </button>

          {profileOpen && (
            <div
              onMouseLeave={() => setProfileOpen(false)}
              className="absolute right-0 mt-2 w-64 rounded-xl bg-[#0e111a]/95 backdrop-blur-2xl border border-white/[0.1] shadow-2xl p-4 z-50 space-y-3"
            >
              <div className="border-b border-white/[0.08] pb-3">
                <div className="text-sm font-semibold text-white">
                  {operator?.name || 'Kelvin Ong'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {operator?.role || 'Chief Operator'} ·{' '}
                  {operator?.organization || 'BLACKTOWER™'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
