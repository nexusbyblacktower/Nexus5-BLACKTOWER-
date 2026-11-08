import React, { useEffect, useState } from 'react';
import { KeyRound, RotateCcw, Save, Settings, Sparkles, SlidersHorizontal, X } from 'lucide-react';
import {
  AgentTone,
  AgentVerbosity,
  BrainRoutingMode,
  BrainType,
  GatewayStatus,
  NexusSettings,
  ReplyPattern,
} from '../types/nexus.ts';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: NexusSettings;
  gatewayStatus: GatewayStatus | null;
  onSaveSettings: (updates: Partial<NexusSettings>) => Promise<void>;
  onResetSettings: () => Promise<void>;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onClearApiKey: () => Promise<void>;
}

type TabId = 'provider' | 'style' | 'generation';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'provider', label: 'AI provider', icon: KeyRound },
  { id: 'style', label: 'Agent style', icon: Sparkles },
  { id: 'generation', label: 'Preferences', icon: SlidersHorizontal },
];

const REPLY_PATTERNS: { id: ReplyPattern; label: string; hint: string }[] = [
  { id: 'direct', label: 'Direct', hint: 'Answer first, short follow-up only if it matters.' },
  { id: 'structured', label: 'Structured', hint: 'Answer, then short labelled sections and bullets.' },
  { id: 'conversational', label: 'Conversational', hint: 'Flowing prose, like a thoughtful friend.' },
  { id: 'step_by_step', label: 'Step by step', hint: 'Numbered steps, one action each.' },
];

const TONES: { id: AgentTone; label: string }[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'warm', label: 'Warm' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'formal', label: 'Formal' },
  { id: 'playful', label: 'Playful' },
];

const VERBOSITIES: { id: AgentVerbosity; label: string; hint: string }[] = [
  { id: 'concise', label: 'Concise', hint: 'Short answers' },
  { id: 'balanced', label: 'Balanced', hint: 'Answer + reasoning' },
  { id: 'detailed', label: 'Detailed', hint: 'Full explanation' },
];

const inputClass =
  'w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white focus:outline-none focus:border-violet-400/50';
const labelClass = 'block text-[11px] text-slate-400 mb-1';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  settings,
  gatewayStatus,
  onSaveSettings,
  onResetSettings,
  onSaveApiKey,
  onClearApiKey,
}) => {
  const [formState, setFormState] = useState<NexusSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('provider');
  const [apiKey, setApiKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(settings);
      setApiKey('');
      setKeyMessage(null);
    }
  }, [open, settings]);

  if (!open) return null;

  const persona = formState.agentPersona;
  const updatePersona = (patch: Partial<NexusSettings['agentPersona']>) =>
    setFormState({ ...formState, agentPersona: { ...persona, ...patch } });

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

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      await onSaveApiKey(apiKey.trim());
      setApiKey('');
      setKeyMessage({ type: 'ok', text: 'Key saved. The assistant is ready.' });
    } catch (err) {
      setKeyMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setKeyBusy(false);
    }
  };

  const handleClearKey = async () => {
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      await onClearApiKey();
      setKeyMessage({ type: 'ok', text: 'Key removed.' });
    } catch (err) {
      setKeyMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setKeyBusy(false);
    }
  };

  const connected = Boolean(gatewayStatus?.openRouterConfigured);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-4">
      <form
        onSubmit={handleSave}
        className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-violet-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-white">Settings</h2>
              <p className="text-xs text-slate-400">
                Connect your AI provider and shape how your assistant replies.
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

        {/* Tabs */}
        <div className="px-5 sm:px-6 pt-3 flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-violet-500/20 text-violet-100 border border-violet-400/30'
                    : 'text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs">
          {activeTab === 'provider' && (
            <>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">OpenRouter account</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      connected
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Bring your own OpenRouter key. It is encrypted on the server, never sent to the
                  browser, and never shared with other people using this app.
                </p>
                {connected && (
                  <p className="text-slate-400">
                    Key ending in{' '}
                    <span className="font-mono text-slate-200">
                      {gatewayStatus?.openRouterKeyHint || '••••'}
                    </span>
                    {gatewayStatus?.openRouterKeySource === 'environment' && ' (provided by the server)'}
                  </p>
                )}

                <div>
                  <label className={labelClass}>OpenRouter API key</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-or-v1-…"
                      autoComplete="off"
                      spellCheck={false}
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={handleSaveKey}
                      disabled={keyBusy || !apiKey.trim()}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      {keyBusy ? 'Checking…' : 'Save key'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Get a key at openrouter.ai/keys — you only need to paste it once.
                  </p>
                </div>

                {keyMessage && (
                  <p
                    className={`text-[11px] ${
                      keyMessage.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {keyMessage.text}
                  </p>
                )}

                {connected && (
                  <button
                    type="button"
                    onClick={handleClearKey}
                    disabled={keyBusy}
                    className="text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove saved key
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5">
                <div className="font-semibold text-white">Memory storage</div>
                <p className="text-slate-400 leading-relaxed">
                  Memories live in your Supabase project, encrypted before they leave this server.{' '}
                  {gatewayStatus?.memoryStore.state === 'ready'
                    ? 'Connected and ready.'
                    : gatewayStatus?.memoryStore.detail ||
                      'Add your Supabase details to save memories.'}
                </p>
              </div>
            </>
          )}

          {activeTab === 'style' && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white">Reply pattern</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {REPLY_PATTERNS.map((pattern) => {
                    const active = persona.replyPattern === pattern.id;
                    return (
                      <button
                        key={pattern.id}
                        type="button"
                        onClick={() => updatePersona({ replyPattern: pattern.id })}
                        className={`text-left p-3 rounded-xl border cursor-pointer transition-colors ${
                          active
                            ? 'border-violet-400/50 bg-violet-500/15'
                            : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-white">{pattern.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{pattern.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tone</label>
                  <select
                    value={persona.tone}
                    onChange={(e) => updatePersona({ tone: e.target.value as AgentTone })}
                    className={inputClass}
                  >
                    {TONES.map((tone) => (
                      <option key={tone.id} value={tone.id} className="bg-[#0b0e17]">
                        {tone.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Answer length</label>
                  <select
                    value={persona.verbosity}
                    onChange={(e) => updatePersona({ verbosity: e.target.value as AgentVerbosity })}
                    className={inputClass}
                  >
                    {VERBOSITIES.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#0b0e17]">
                        {v.label} — {v.hint}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Personality</label>
                <textarea
                  value={persona.personality}
                  onChange={(e) => updatePersona({ personality: e.target.value })}
                  rows={3}
                  placeholder="e.g. Calm senior engineer who explains trade-offs without lecturing, and asks one sharp question when my plan is vague."
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>

              <div>
                <label className={labelClass}>Extra instructions</label>
                <textarea
                  value={persona.customInstructions}
                  onChange={(e) => updatePersona({ customInstructions: e.target.value })}
                  rows={3}
                  placeholder="e.g. Always show me the reasoning before the conclusion. No emojis. Use Malaysian examples."
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </div>
            </>
          )}

          {activeTab === 'generation' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Model choice</label>
                  <select
                    value={formState.brainMode}
                    onChange={(e) =>
                      setFormState({ ...formState, brainMode: e.target.value as BrainRoutingMode })
                    }
                    className={inputClass}
                  >
                    <option value="AUTO" className="bg-[#0b0e17]">
                      Automatic — picks the best model per message
                    </option>
                    <option value="MANUAL" className="bg-[#0b0e17]">
                      Manual — I choose each time
                    </option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Preferred model</label>
                  <select
                    value={formState.defaultBrain}
                    onChange={(e) =>
                      setFormState({ ...formState, defaultBrain: e.target.value as BrainType })
                    }
                    className={inputClass}
                  >
                    <option value="FLASH" className="bg-[#0b0e17]">
                      Fast — everyday conversation
                    </option>
                    <option value="REASONING" className="bg-[#0b0e17]">
                      Deep — explanation and reasoning
                    </option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    Creativity ({formState.temperature.toFixed(2)})
                  </label>
                  <input
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
                  <label className={labelClass}>Max answer length (tokens)</label>
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
                    className={`${inputClass} font-mono tabular-nums`}
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-white">Memory</h3>
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
                  <span className="text-slate-300">Use my long-term memory</span>
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
                  <span className="text-slate-300">Use mid-term project memory</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Ambient lighting</label>
                  <select
                    value={formState.appearance.ambientGlow}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        appearance: {
                          ...formState.appearance,
                          ambientGlow: e.target.value as NexusSettings['appearance']['ambientGlow'],
                        },
                      })
                    }
                    className={inputClass}
                  >
                    <option value="violet_cyan" className="bg-[#0b0e17]">
                      Violet & cyan
                    </option>
                    <option value="amethyst" className="bg-[#0b0e17]">
                      Amethyst
                    </option>
                    <option value="obsidian_minimal" className="bg-[#0b0e17]">
                      Obsidian minimal
                    </option>
                  </select>
                </div>
              </div>

              <details className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3">
                <summary className="text-xs font-semibold text-slate-200 cursor-pointer">
                  Advanced model IDs
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={labelClass}>Fast model</label>
                    <input
                      type="text"
                      value={formState.flashModelId}
                      onChange={(e) =>
                        setFormState({ ...formState, flashModelId: e.target.value })
                      }
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reasoning model</label>
                    <input
                      type="text"
                      value={formState.reasoningModelId}
                      onChange={(e) =>
                        setFormState({ ...formState, reasoningModelId: e.target.value })
                      }
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Fallback model</label>
                    <input
                      type="text"
                      value={formState.fallbackModelId}
                      onChange={(e) =>
                        setFormState({ ...formState, fallbackModelId: e.target.value })
                      }
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.enableVerifiedFallback}
                      onChange={(e) =>
                        setFormState({ ...formState, enableVerifiedFallback: e.target.checked })
                      }
                    />
                    <span className="text-slate-300">Fall back automatically if a model is down</span>
                  </label>
                </div>
              </details>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-white/[0.08] flex items-center justify-between gap-3 bg-[#080a10]">
          <button
            type="button"
            onClick={async () => {
              await onResetSettings();
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset to defaults</span>
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
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer disabled:opacity-50"
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
