import React, { useEffect, useState } from 'react';
import { RotateCcw, Save, Settings, X } from 'lucide-react';
import {
  BrainRoutingMode,
  BrainType,
  NexusSettings,
} from '../types/nexus.ts';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: NexusSettings;
  onSaveSettings: (updates: Partial<NexusSettings>) => Promise<void>;
  onResetSettings: () => Promise<void>;
}

const LENGTH_OPTIONS = [
  { label: 'Short', value: 1024 },
  { label: 'Balanced', value: 2048 },
  { label: 'Detailed', value: 4096 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  onSaveSettings,
  onResetSettings,
}) => {
  const [formState, setFormState] = useState<NexusSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setFormState(settings);
  }, [open, settings]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-2xl max-h-[88vh] rounded-3xl bg-white/[0.055] backdrop-blur-2xl border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
              <Settings className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Settings</h2>
              <p className="text-xs text-slate-400">How NEXUS answers and what it remembers.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Answer style */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-white">Answer style</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="routing-mode" className="block text-slate-400 mb-1">
                  Routing
                </label>
                <select
                  id="routing-mode"
                  value={formState.brainMode}
                  onChange={(e) =>
                    setFormState({ ...formState, brainMode: e.target.value as BrainRoutingMode })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none"
                >
                  <option value="AUTO" className="bg-[#0b0e17]">
                    Auto — pick the right depth
                  </option>
                  <option value="MANUAL" className="bg-[#0b0e17]">
                    Manual — keep my choice
                  </option>
                </select>
              </div>

              <div>
                <label htmlFor="default-depth" className="block text-slate-400 mb-1">
                  Default depth
                </label>
                <select
                  id="default-depth"
                  value={formState.defaultBrain}
                  onChange={(e) =>
                    setFormState({ ...formState, defaultBrain: e.target.value as BrainType })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none"
                >
                  <option value="FLASH" className="bg-[#0b0e17]">
                    Fast
                  </option>
                  <option value="REASONING" className="bg-[#0b0e17]">
                    Deep reasoning
                  </option>
                </select>
              </div>

              <div>
                <label htmlFor="creativity" className="block text-slate-400 mb-1">
                  Creativity — {formState.temperature.toFixed(2)}
                </label>
                <input
                  id="creativity"
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.05}
                  value={formState.temperature}
                  onChange={(e) =>
                    setFormState({ ...formState, temperature: parseFloat(e.target.value) })
                  }
                  className="w-full accent-violet-500"
                />
              </div>

              <div>
                <label htmlFor="length" className="block text-slate-400 mb-1">
                  Typical answer length
                </label>
                <select
                  id="length"
                  value={formState.maxOutputTokens}
                  onChange={(e) =>
                    setFormState({ ...formState, maxOutputTokens: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none"
                >
                  {LENGTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#0b0e17]">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Memory & approvals */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-medium text-white">Memory & approvals</h3>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formState.memoryPolicy.injectUserMemory}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    memoryPolicy: { ...formState.memoryPolicy, injectUserMemory: e.target.checked },
                  })
                }
                className="mt-0.5 rounded border-white/20 bg-black"
              />
              <span className="text-slate-300">Recall my preferences and past context</span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
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
                className="mt-0.5 rounded border-white/20 bg-black"
              />
              <span className="text-slate-300">Recall project knowledge</span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
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
                className="mt-0.5 rounded border-white/20 bg-black"
              />
              <span className="text-slate-300">
                Ask before running sensitive external actions
              </span>
            </label>
          </section>

          {/* Appearance */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-medium text-white">Appearance</h3>
            <div>
              <label htmlFor="ambient" className="block text-slate-400 mb-1">
                Ambient lighting
              </label>
              <select
                id="ambient"
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
                className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none"
              >
                <option value="violet_cyan" className="bg-[#0b0e17]">
                  Violet & cyan
                </option>
                <option value="amethyst" className="bg-[#0b0e17]">
                  Deep amethyst
                </option>
                <option value="obsidian_minimal" className="bg-[#0b0e17]">
                  Obsidian minimal
                </option>
              </select>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <button
            type="button"
            onClick={async () => {
              await onResetSettings();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset defaults</span>
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
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
