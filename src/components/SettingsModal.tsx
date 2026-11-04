import React, { useState } from 'react';
import {
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  GatewayStatus,
  NexusSettings,
} from '../types/nexus.ts';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: NexusSettings;
  gatewayStatus: GatewayStatus | null;
  onSaveSettings: (updates: Partial<NexusSettings>) => Promise<void>;
  onResetSettings: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  gatewayStatus,
  onSaveSettings,
  onResetSettings,
}) => {
  const [formState, setFormState] = useState<NexusSettings>(settings);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings(formState);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-3xl max-h-[88vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-violet-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                NEXUS 5.5 System & Gateway Configuration
              </h2>
              <p className="text-xs text-slate-400">
                Configure Dual-Brain routing, OpenRouter models, sampling parameters, and security gates.
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* 1. OpenRouter Gateway & Security Status (Read-only server verification) */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Server-Side Gateway & Secret Isolation Status</span>
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                {gatewayStatus?.openRouterEndpoint}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                <div className="text-[11px] text-slate-400">OPENROUTER_API_KEY</div>
                <div className="font-mono font-semibold mt-0.5 text-slate-200">
                  {gatewayStatus?.openRouterConfigured
                    ? 'Configured (Server-Only)'
                    : 'Not Set in Environment'}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                <div className="text-[11px] text-slate-400">Verified Fallback Engine</div>
                <div className="font-mono font-semibold mt-0.5 text-slate-200">
                  {gatewayStatus?.geminiFallbackAvailable
                    ? 'Ready (Server-Side)'
                    : 'Unavailable'}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06]">
                <div className="text-[11px] text-slate-400">Persistence Engine</div>
                <div className="font-mono font-semibold mt-0.5 text-emerald-300">
                  Server Disk JSON Store
                </div>
              </div>
            </div>
          </div>

          {/* 2. Dual-Brain Model IDs & Routing Defaults */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Dual-Brain Intelligence Models
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">
                  Default Routing Mode
                </label>
                <select
                  value={formState.brainMode}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      brainMode: e.target.value as BrainRoutingMode,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white"
                >
                  <option value="AUTO" className="bg-[#0b0e17]">
                    AUTO (Complexity & Tool Aware)
                  </option>
                  <option value="MANUAL" className="bg-[#0b0e17]">
                    MANUAL (Operator Locked)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Default Active Brain
                </label>
                <select
                  value={formState.defaultBrain}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      defaultBrain: e.target.value as BrainType,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white"
                >
                  <option value="FLASH" className="bg-[#0b0e17]">
                    Brain A — FLASH
                  </option>
                  <option value="REASONING" className="bg-[#0b0e17]">
                    Brain B — REASONING
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Brain A — FLASH Model ID
                </label>
                <input
                  type="text"
                  value={formState.flashModelId}
                  onChange={(e) =>
                    setFormState({ ...formState, flashModelId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] font-mono text-cyan-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Brain B — REASONING Model ID
                </label>
                <input
                  type="text"
                  value={formState.reasoningModelId}
                  onChange={(e) =>
                    setFormState({ ...formState, reasoningModelId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] font-mono text-violet-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  OpenRouter Fallback Model ID
                </label>
                <input
                  type="text"
                  value={formState.fallbackModelId}
                  onChange={(e) =>
                    setFormState({ ...formState, fallbackModelId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] font-mono text-slate-200"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.enableVerifiedFallback}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        enableVerifiedFallback: e.target.checked,
                      })
                    }
                    className="rounded border-white/20 bg-black"
                  />
                  <span className="text-slate-200">
                    Enable Verified Fallback Gateway (with explicit model audit notice)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* 3. Generation & Sampling Parameters */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">
              Inference Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">
                  Temperature ({formState.temperature.toFixed(2)})
                </label>
                <input
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.05}
                  value={formState.temperature}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Max Output Tokens
                </label>
                <input
                  type="number"
                  min={256}
                  max={8192}
                  step={256}
                  value={formState.maxOutputTokens}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      maxOutputTokens: Number(e.target.value) || 2048,
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.09] font-mono text-white tabular-nums"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.streamingEnabled}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        streamingEnabled: e.target.checked,
                      })
                    }
                  />
                  <span className="text-slate-200">SSE Real-Time Token Streaming</span>
                </label>
              </div>
            </div>
          </div>

          {/* 4. Memory, Agent Governance & UI Appearance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-white">
                Memory & Agent Governance
              </h3>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.memoryPolicy.injectUserMemory}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      memoryPolicy: {
                        ...formState.memoryPolicy,
                        injectUserMemory: e.target.checked,
                      },
                    })
                  }
                />
                <span className="text-slate-300">Inject Approved User Memories</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.memoryPolicy.injectProjectMemory}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      memoryPolicy: {
                        ...formState.memoryPolicy,
                        injectProjectMemory: e.target.checked,
                      },
                    })
                  }
                />
                <span className="text-slate-300">Inject Scoped Project Memories</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.agentLimits.requireApprovalForExternalTools}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      agentLimits: {
                        ...formState.agentLimits,
                        requireApprovalForExternalTools: e.target.checked,
                      },
                    })
                  }
                />
                <span className="text-slate-300">
                  Require Operator Approval before External/Sensitive Tool Execution
                </span>
              </label>
            </div>

            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-white">
                Workspace Appearance
              </h3>
              <div>
                <label className="block text-slate-400 mb-1">
                  Ambient Lighting Profile
                </label>
                <select
                  value={formState.appearance.ambientGlow}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      appearance: {
                        ...formState.appearance,
                        ambientGlow: e.target.value as
                          | 'violet_cyan'
                          | 'obsidian_minimal'
                          | 'amethyst',
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-white"
                >
                  <option value="violet_cyan" className="bg-[#0b0e17]">
                    BLACKTOWER Cosmic Violet & Cyan
                  </option>
                  <option value="amethyst" className="bg-[#0b0e17]">
                    Deep Amethyst Horizon
                  </option>
                  <option value="obsidian_minimal" className="bg-[#0b0e17]">
                    Obsidian Stealth Minimal
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-[#080a10]">
          <button
            type="button"
            onClick={async () => {
              await onResetSettings();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl text-xs text-slate-300 hover:text-white bg-white/[0.04] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
