import React, { useState } from 'react';
import {
  Play,
  Plug,
  Plus,
  ShieldAlert,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import {
  MCPConnectorAdapter,
  NexusSettings,
  ToolDefinition,
  ToolExecutionRecord,
} from '../types/nexus.ts';

interface ToolsConnectorsModalProps {
  open: boolean;
  onClose: () => void;
  tools: ToolDefinition[];
  connectors: MCPConnectorAdapter[];
  settings: NexusSettings;
  onToggleTool: (toolName: string, enabled: boolean) => Promise<void>;
  onTestTool: (
    toolName: string,
    args: Record<string, unknown>,
    approvedByUser: boolean
  ) => Promise<ToolExecutionRecord>;
  onRegisterConnector: (
    input: Omit<MCPConnectorAdapter, 'id' | 'status'>
  ) => Promise<void>;
}

export const ToolsConnectorsModal: React.FC<ToolsConnectorsModalProps> = ({
  open,
  onClose,
  tools,
  connectors,
  settings,
  onToggleTool,
  onTestTool,
  onRegisterConnector,
}) => {
  const [activeTab, setActiveTab] = useState<'tools' | 'connectors'>('tools');
  const [selectedTool, setSelectedTool] = useState<string>('datetime_inspector');
  const [testInputJson, setTestInputJson] = useState<string>(
    JSON.stringify({ timezone: 'Asia/Kuala_Lumpur' }, null, 2)
  );
  const [testResult, setTestResult] = useState<ToolExecutionRecord | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // New connector form
  const [connName, setConnName] = useState('');
  const [connUrl, setConnUrl] = useState('');
  const [connDesc, setConnDesc] = useState('');
  const [connTransport, setConnTransport] = useState<
    'http_sse' | 'stdio_bridge' | 'modular_webhook'
  >('http_sse');

  if (!open) return null;

  const handleSelectToolForTest = (name: string) => {
    setSelectedTool(name);
    setTestResult(null);
    if (name === 'datetime_inspector') {
      setTestInputJson(JSON.stringify({ timezone: 'Asia/Kuala_Lumpur' }, null, 2));
    } else if (name === 'precision_calculator') {
      setTestInputJson(JSON.stringify({ expression: '(24500 * 1.085) / 12' }, null, 2));
    } else if (name === 'text_summarizer_analyzer') {
      setTestInputJson(
        JSON.stringify(
          {
            text: 'NEXUS 5.5 operates a dual-brain intelligence architecture. Next step: verify all tool executions server-side before responding to the operator.',
          },
          null,
          2
        )
      );
    } else if (name === 'file_content_analyzer') {
      setTestInputJson(
        JSON.stringify(
          {
            fileName: 'config.json',
            content: '{"service":"nexus","version":"5.5","secure":true}',
          },
          null,
          2
        )
      );
    } else if (name === 'workspace_memory_lookup') {
      setTestInputJson(JSON.stringify({ query: 'architecture' }, null, 2));
    } else if (name === 'external_webhook_dispatch') {
      setTestInputJson(
        JSON.stringify(
          {
            destination: 'https://api.blacktower.internal/v1/dispatch',
            payloadSummary: 'Deployment telemetry verification packet',
          },
          null,
          2
        )
      );
    }
  };

  const handleRunSandboxTest = async (approved = false) => {
    setIsExecuting(true);
    try {
      const parsedArgs = JSON.parse(testInputJson);
      const res = await onTestTool(selectedTool, parsedArgs, approved);
      setTestResult(res);
    } catch (err) {
      setTestResult({
        id: 'err-parse',
        toolName: selectedTool,
        arguments: {},
        status: 'failed',
        requiresApproval: false,
        error: err instanceof Error ? err.message : 'Invalid JSON arguments',
        startedAt: new Date().toISOString(),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleAddConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connName.trim() || !connUrl.trim()) return;
    await onRegisterConnector({
      name: connName.trim(),
      endpointUrl: connUrl.trim(),
      transport: connTransport,
      requiresApproval: true,
      exposedTools: ['external_webhook_dispatch'],
      description: connDesc.trim() || 'Modular external MCP connector.',
    });
    setConnName('');
    setConnUrl('');
    setConnDesc('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
      <div className="w-full max-w-4xl max-h-[88vh] rounded-2xl bg-[#0b0e17]/95 border border-white/[0.1] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Tool Registry & Modular MCP Connectors
              </h2>
              <p className="text-xs text-slate-400">
                Real server-side tool execution with JSON schema validation and approval gates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setActiveTab('tools')}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  activeTab === 'tools'
                    ? 'bg-violet-500/25 text-violet-100'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tool Registry ({tools.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('connectors')}
                className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                  activeTab === 'connectors'
                    ? 'bg-violet-500/25 text-violet-100'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                MCP Connectors ({connectors.length})
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {activeTab === 'tools' ? (
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Registered Tools */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="text-xs font-semibold text-white">
                Registered Backend Tools
              </div>
              {tools.map((tool) => {
                const enabled = settings.enabledTools[tool.name] !== false;
                const isSelected = selectedTool === tool.name;
                return (
                  <div
                    key={tool.name}
                    className={`p-3.5 rounded-xl border transition-colors space-y-2 ${
                      isSelected
                        ? 'bg-white/[0.06] border-violet-400/35'
                        : 'bg-white/[0.025] border-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-2">
                          <span>{tool.displayName}</span>
                          <span className="font-mono text-[11px] text-cyan-300">
                            ({tool.name})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Category: {tool.category} · Permission: {tool.permissionLevel}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectToolForTest(tool.name)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer"
                        >
                          Inspect / Test
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleTool(tool.name, !enabled)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer ${
                            enabled
                              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                              : 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                          }`}
                        >
                          {enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {tool.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Right: Live Tool Execution Sandbox */}
            <div className="lg:col-span-5 space-y-3">
              <div className="p-4 rounded-xl bg-[#07090f] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Live Backend Tool Verifier</span>
                  </span>
                  <span className="font-mono text-[11px] text-violet-300">
                    {selectedTool}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-mono mb-1">
                    JSON Arguments Payload
                  </label>
                  <textarea
                    value={testInputJson}
                    onChange={(e) => setTestInputJson(e.target.value)}
                    rows={5}
                    className="w-full p-2.5 rounded-lg bg-black/60 border border-white/[0.09] font-mono text-xs text-emerald-200 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunSandboxTest(false)}
                    disabled={isExecuting}
                    className="flex-1 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isExecuting ? 'Executing...' : 'Execute on Server'}</span>
                  </button>
                </div>

                {testResult && (
                  <div className="pt-2 border-t border-white/[0.08] space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-slate-400">
                        Status:{' '}
                        <strong
                          className={
                            testResult.status === 'completed'
                              ? 'text-emerald-400'
                              : testResult.status === 'pending_approval'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {testResult.status}
                        </strong>
                      </span>
                      {testResult.durationMs !== undefined && (
                        <span className="text-slate-500 tabular-nums">
                          {testResult.durationMs}ms
                        </span>
                      )}
                    </div>

                    {testResult.status === 'pending_approval' && (
                      <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-400/30 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-amber-200 font-semibold">
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                          <span>Sensitive Tool Paused for Approval</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRunSandboxTest(true)}
                          className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Approve & Execute Now
                        </button>
                      </div>
                    )}

                    {testResult.output && (
                      <pre className="p-2.5 rounded-lg bg-black/70 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-52">
                        {testResult.output}
                      </pre>
                    )}

                    {testResult.error && (
                      <div className="text-xs text-rose-300 font-mono">
                        Error: {testResult.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Register Adapter Form */}
            <form onSubmit={handleAddConnector} className="lg:col-span-5 space-y-3">
              <div className="text-xs font-semibold text-white">
                Register Modular MCP / Webhook Adapter
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Adapter Name
                </label>
                <input
                  type="text"
                  value={connName}
                  onChange={(e) => setConnName(e.target.value)}
                  placeholder="e.g., GitHub Enterprise MCP Bridge"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Transport Protocol
                </label>
                <select
                  value={connTransport}
                  onChange={(e) =>
                    setConnTransport(
                      e.target.value as 'http_sse' | 'stdio_bridge' | 'modular_webhook'
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white"
                >
                  <option value="http_sse" className="bg-[#0b0e17]">
                    MCP over HTTP SSE
                  </option>
                  <option value="modular_webhook" className="bg-[#0b0e17]">
                    Modular Outbound Webhook
                  </option>
                  <option value="stdio_bridge" className="bg-[#0b0e17]">
                    Local Stdio Process Bridge
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Endpoint URI
                </label>
                <input
                  type="text"
                  value={connUrl}
                  onChange={(e) => setConnUrl(e.target.value)}
                  placeholder="https://mcp.internal.example/sse"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  value={connDesc}
                  onChange={(e) => setConnDesc(e.target.value)}
                  rows={2}
                  placeholder="Capabilities exposed by this connector..."
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.09] text-xs text-white resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={!connName.trim() || !connUrl.trim()}
                className="w-full py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Adapter</span>
              </button>
            </form>

            {/* Connected Adapters */}
            <div className="lg:col-span-7 space-y-2.5">
              <div className="text-xs font-semibold text-white">
                Configured Adapters ({connectors.length})
              </div>
              {connectors.map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-white">
                      <Plug className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{c.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-300">
                      {c.status.toUpperCase()} · {c.transport}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Endpoint: {c.endpointUrl}
                  </div>
                  <p className="text-xs text-slate-300">{c.description}</p>
                  <div className="text-[11px] font-mono text-slate-500">
                    Exposed Tools: {c.exposedTools.join(', ')} · Approval Gate:{' '}
                    {c.requiresApproval ? 'Enforced' : 'Read-Only'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
