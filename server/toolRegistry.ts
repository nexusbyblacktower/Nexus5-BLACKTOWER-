import { MCPConnectorAdapter, ToolDefinition } from '../src/types/nexus.ts';

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: 'datetime_inspector',
    displayName: 'Chronos Date & Time Inspector',
    description:
      'Returns accurate server-verified UTC/local timestamps, timezone offsets, ISO-8601 strings, and calendar calculations.',
    category: 'core_utility',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone identifier (e.g., "Asia/Kuala_Lumpur", "UTC", "America/New_York").',
        },
        offsetDays: {
          type: 'string',
          description: 'Optional number of days to add or subtract from current time (e.g., "7" or "-3").',
        },
      },
      required: [],
    },
  },
  {
    name: 'precision_calculator',
    displayName: 'Precision Mathematical & Financial Evaluator',
    description:
      'Safely evaluates mathematical expressions, percentages, compound growth, and unit conversions with exact floating-point diagnostics.',
    category: 'core_utility',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "(14500 * 1.085) / 12" or "sqrt(144) + 25 * 4").',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'text_summarizer_analyzer',
    displayName: 'Structural Text & Readability Analyzer',
    description:
      'Analyzes input text for word/token counts, reading time, sentence density, key sentences, and extracted action items.',
    category: 'analysis',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text passage or document content to inspect.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'file_content_analyzer',
    displayName: 'File Content & Schema Inspector',
    description:
      'Performs deep structural inspection on user-attached text, JSON, CSV, log, or source code files.',
    category: 'analysis',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Name of the uploaded file.',
        },
        content: {
          type: 'string',
          description: 'Raw text content of the file to analyze.',
        },
      },
      required: ['fileName', 'content'],
    },
  },
  {
    name: 'workspace_memory_lookup',
    displayName: 'NEXUS Memory Vault Lookup',
    description:
      'Queries authorized User and Project memories stored in the NEXUS Memory Vault by keyword or tag.',
    category: 'memory',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or topic to retrieve from the Memory Vault.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'external_webhook_dispatch',
    displayName: 'External Webhook / Action Dispatcher',
    description:
      'Dispatches a structured payload to an external automation webhook or production endpoint. Sensitive operation requiring explicit operator approval.',
    category: 'external_connector',
    permissionLevel: 'sensitive_approval_required',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          description: 'Target webhook identifier or endpoint label.',
        },
        payloadSummary: {
          type: 'string',
          description: 'Structured summary of data being transmitted externally.',
        },
      },
      required: ['destination', 'payloadSummary'],
    },
  },
];

export const DEFAULT_MCP_CONNECTORS: MCPConnectorAdapter[] = [
  {
    id: 'mcp-filesystem-sandbox',
    name: 'Workspace File Analyzer Adapter',
    transport: 'stdio_bridge',
    endpointUrl: 'internal://nexus-sandbox/fs-inspector',
    status: 'connected',
    requiresApproval: false,
    exposedTools: ['file_content_analyzer', 'text_summarizer_analyzer'],
    description: 'Inspects user-provided attachments with untrusted-content boundary sanitization.',
  },
  {
    id: 'mcp-blacktower-telemetry',
    name: 'Chronos & Quant Compute Engine',
    transport: 'stdio_bridge',
    endpointUrl: 'internal://nexus-core/compute',
    status: 'connected',
    requiresApproval: false,
    exposedTools: ['datetime_inspector', 'precision_calculator', 'workspace_memory_lookup'],
    description: 'Deterministic time, math, and memory retrieval subsystem.',
  },
  {
    id: 'mcp-external-webhook-bridge',
    name: 'External Webhook & Automation Gate',
    transport: 'modular_webhook',
    endpointUrl: 'https://api.blacktower.internal/v1/dispatch',
    status: 'standby',
    requiresApproval: true,
    exposedTools: ['external_webhook_dispatch'],
    description: 'Outbound automation connector protected by mandatory human-in-the-loop approval gate.',
  },
];

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private connectors: MCPConnectorAdapter[] = [...DEFAULT_MCP_CONNECTORS];

  constructor() {
    for (const tool of BUILT_IN_TOOLS) {
      this.tools.set(tool.name, tool);
    }
  }

  public listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listConnectors(): MCPConnectorAdapter[] {
    return [...this.connectors];
  }

  public registerConnector(adapter: Omit<MCPConnectorAdapter, 'id'>): MCPConnectorAdapter {
    const newConnector: MCPConnectorAdapter = {
      ...adapter,
      id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.connectors.push(newConnector);
    return newConnector;
  }

  public validateArguments(
    toolName: string,
    args: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, error: `Tool "${toolName}" is not registered in the NEXUS Tool Registry.` };
    }
    for (const reqField of tool.parametersSchema.required) {
      const val = args[reqField];
      if (val === undefined || val === null || String(val).trim() === '') {
        return {
          valid: false,
          error: `Missing required argument "${reqField}" for tool "${toolName}".`,
        };
      }
    }
    return { valid: true };
  }
}

export const toolRegistry = new ToolRegistry();
