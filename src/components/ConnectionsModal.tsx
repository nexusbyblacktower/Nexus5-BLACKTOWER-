import React, { useState } from 'react';
import {
  CalendarDays,
  Check,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  HardDrive,
  Loader2,
  Mail,
  Plug,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  ConnectionsStatus,
  NexusSettings,
  ToolDefinition,
} from '../types/nexus.ts';

interface ConnectionsModalProps {
  open: boolean;
  onClose: () => void;
  connections: ConnectionsStatus | null;
  tools: ToolDefinition[];
  settings: NexusSettings;
  onToggleTool: (toolName: string, enabled: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCheckGateway: () => Promise<{ ok: boolean; message?: string; error?: string }>;
  onDisconnectGoogle: () => Promise<void>;
}

const SUPABASE_SETUP_SQL = `create table if not exists public.nexus_store (
  id text primary key,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists nexus_store_kind_idx on public.nexus_store (kind);

alter table public.nexus_store enable row level security;`;

export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({
  open,
  onClose,
  connections,
  tools,
  settings,
  onToggleTool,
  onRefresh,
  onCheckGateway,
  onDisconnectGoogle,
}) => {
  const [checkingGateway, setCheckingGateway] = useState(false);
  const [gatewayResult, setGatewayResult] = useState<string | null>(null);
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);

  if (!open) return null;

  const google = connections?.google;
  const storage = connections?.storage;

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard permissions are optional.
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const testGateway = async () => {
    setCheckingGateway(true);
    setGatewayResult(null);
    try {
      const result = await onCheckGateway();
      setGatewayOk(result.ok);
      setGatewayResult(result.ok ? 'Assistant is responding normally.' : result.error || 'No response.');
    } catch (err) {
      setGatewayOk(false);
      setGatewayResult('Could not reach the assistant right now.');
    } finally {
      setCheckingGateway(false);
    }
  };

  const googleTools = tools.filter((tool) => tool.category === 'google_workspace');
  const coreTools = tools.filter((tool) => tool.category !== 'google_workspace');

  const statusPill = (state: 'on' | 'warn' | 'off', label: string) => (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
        state === 'on'
          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
          : state === 'warn'
          ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
          : 'bg-white/[0.04] border-white/[0.1] text-slate-400'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          state === 'on' ? 'bg-emerald-400' : state === 'warn' ? 'bg-amber-400' : 'bg-slate-500'
        }`}
      />
      {label}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl max-h-[88vh] rounded-3xl bg-white/[0.055] backdrop-blur-2xl border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center">
              <Plug className="w-4 h-4 text-violet-300" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Connections</h2>
              <p className="text-xs text-slate-400">
                Link your accounts and choose what NEXUS can help with.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={refresh}
              title="Refresh status"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close connections"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Assistant health */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/[0.09] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-400/25 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-violet-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    Chat assistant
                    {statusPill(connections ? 'on' : 'warn', connections ? 'Ready' : 'Checking')}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Send a test message to confirm NEXUS replies.
                  </p>
                  {gatewayResult && (
                    <p
                      className={`text-xs mt-1.5 ${
                        gatewayOk ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {gatewayResult}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={testGateway}
                disabled={checkingGateway}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 disabled:opacity-50 cursor-pointer"
              >
                {checkingGateway ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Test</span>
              </button>
            </div>
          </section>

          {/* Google Workspace */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/[0.09] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/25 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-sky-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    Google Workspace
                    {google?.connected
                      ? statusPill('on', 'Connected')
                      : google?.configured
                      ? statusPill('warn', 'Not connected')
                      : statusPill('off', 'Not available yet')}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {google?.connected
                      ? `NEXUS can read and act on Gmail, Calendar and Drive${
                          google.email ? ` for ${google.email}` : ''
                        }.`
                      : 'Connect Gmail, Calendar and Drive so NEXUS can search mail, schedule events and read documents.'}
                  </p>
                </div>
              </div>

              {google?.connected ? (
                <button
                  type="button"
                  onClick={() => onDisconnectGoogle()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-rose-500/15 border border-white/[0.1] hover:border-rose-400/30 text-slate-300 hover:text-rose-200 cursor-pointer"
                >
                  Disconnect
                </button>
              ) : google?.configured ? (
                <a
                  href="/api/google/connect"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-md cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Connect</span>
                </a>
              ) : null}
            </div>

            {!google?.configured && (
              <p className="text-xs text-slate-400 pl-11">
                This needs a Google OAuth client. Add the Google client ID and client secret in the
                app's secure settings, then reload this page.
              </p>
            )}

            {google?.configured && !google.connected && google.redirectUri && (
              <div className="ml-11 rounded-xl bg-black/25 border border-white/[0.07] p-2.5">
                <div className="text-[11px] text-slate-400 mb-1">
                  Add this as an authorized redirect URI in your Google Cloud OAuth client:
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] font-mono text-slate-200 truncate">
                    {google.redirectUri}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(google.redirectUri || '', 'redirect')}
                    className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Copy redirect URI"
                  >
                    {copied === 'redirect' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {google?.lastError && (
              <p className="text-xs text-amber-300 pl-11">{google.lastError}</p>
            )}

            <div className="pl-11 flex flex-wrap gap-3 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Mail className="w-3 h-3" /> Gmail
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" /> Calendar
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> Drive
              </span>
            </div>
          </section>

          {/* Storage */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/[0.09] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center">
                  <Database className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    Memory & history
                    {storage?.engine === 'supabase'
                      ? statusPill('on', 'Synced')
                      : storage?.configured
                      ? statusPill('warn', 'Needs setup')
                      : statusPill('off', 'On this server')}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {storage?.engine === 'supabase'
                      ? 'Conversations, settings and memories are stored in Supabase and recalled in every new chat.'
                      : storage?.configured
                      ? 'Supabase is connected but the storage table still needs to be created.'
                      : 'Conversations and memories are kept on this server. Add Supabase credentials to sync them across devices.'}
                  </p>
                </div>
              </div>
              {storage?.engine === 'supabase' && (
                <Cloud className="w-4 h-4 text-emerald-300 shrink-0" />
              )}
            </div>

            {storage?.configured && !storage.schemaReady && (
              <div className="ml-11 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSql((prev) => !prev)}
                  className="text-xs font-medium text-violet-300 hover:text-violet-200 cursor-pointer"
                >
                  {showSql ? 'Hide setup script' : 'Show one-time setup script'}
                </button>
                {showSql && (
                  <div className="rounded-xl bg-black/35 border border-white/[0.07] p-3 space-y-2">
                    <p className="text-[11px] text-slate-400">
                      Run this once in the Supabase SQL editor, then refresh.
                    </p>
                    <pre className="text-[10.5px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto">
                      {SUPABASE_SETUP_SQL}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copy(SUPABASE_SETUP_SQL, 'sql')}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 cursor-pointer"
                    >
                      {copied === 'sql' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copied === 'sql' ? 'Copied' : 'Copy script'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Capabilities */}
          <section className="rounded-2xl bg-white/[0.04] border border-white/[0.09] p-4 space-y-3">
            <div>
              <div className="text-sm font-medium text-white">What NEXUS can do</div>
              <p className="text-xs text-slate-400 mt-0.5">
                Turn capabilities on or off. Google capabilities work once your account is connected.
              </p>
            </div>

            <div className="space-y-2">
              {[...googleTools, ...coreTools].map((tool) => {
                const enabled = settings.enabledTools[tool.name] !== false;
                return (
                  <div
                    key={tool.name}
                    className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-100">{tool.displayName}</div>
                      <div className="text-[11px] text-slate-400 leading-relaxed">
                        {tool.description.split('. ')[0]}.
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={tool.displayName}
                      onClick={() => onToggleTool(tool.name, !enabled)}
                      className={`shrink-0 mt-0.5 w-9 h-5 rounded-full border transition-colors cursor-pointer relative ${
                        enabled
                          ? 'bg-violet-500/70 border-violet-400/50'
                          : 'bg-white/[0.08] border-white/[0.12]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                          enabled ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
