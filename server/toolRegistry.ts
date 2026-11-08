import { MCPConnectorAdapter, ToolDefinition } from '../src/types/nexus.ts';

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: 'datetime_inspector',
    displayName: 'Date & Time',
    description:
      'Returns accurate current date/time, timezone offsets, ISO-8601 timestamps and date arithmetic. Use whenever the answer depends on "now", today\'s date, a timezone, or a relative date like "next Friday".',
    category: 'core_utility',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone identifier (e.g. "Asia/Kuala_Lumpur", "UTC", "America/New_York").',
        },
        offsetDays: {
          type: 'string',
          description: 'Optional whole number of days to add or subtract from now (e.g. "7" or "-3").',
        },
      },
      required: [],
    },
  },
  {
    name: 'precision_calculator',
    displayName: 'Calculator',
    description:
      'Evaluates a mathematical expression exactly (arithmetic, percentages, powers, sqrt). Use for any non-trivial calculation instead of estimating.',
    category: 'core_utility',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Expression to evaluate, e.g. "(14500 * 1.085) / 12" or "sqrt(144) + 25 * 4".',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'text_summarizer_analyzer',
    displayName: 'Text Analysis',
    description:
      'Analyzes a passage for word count, reading time, key sentences and action items. Use for long documents the user wants summarized structurally.',
    category: 'analysis',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text passage to inspect.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'file_content_analyzer',
    displayName: 'File Inspector',
    description:
      'Inspects an attached text, JSON, CSV, log or source file for structure, schema and validity.',
    category: 'analysis',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'Name of the uploaded file.' },
        content: { type: 'string', description: 'Raw text content of the file.' },
      },
      required: ['fileName', 'content'],
    },
  },
  {
    name: 'workspace_memory_lookup',
    displayName: 'Memory Search',
    description:
      'Searches saved long-term memory (user preferences, project facts, earlier decisions) and can list the most recent memories when the query is empty. Use before asking the user to repeat something or when they refer to past context.',
    category: 'memory',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or topic to recall. Leave empty to list recent memories.',
        },
      },
      required: [],
    },
  },
  {
    name: 'memory_save',
    displayName: 'Save Memory',
    description:
      'Saves a durable fact to long-term memory so it can be recalled in future conversations. Use when the user states a lasting preference, a personal detail, or an important project decision. Do not save small talk or one-off task details.',
    category: 'memory',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short label for the memory (max ~60 characters).' },
        content: { type: 'string', description: 'The fact to remember, written so it stands alone.' },
        category: {
          type: 'string',
          description: 'Which memory area it belongs to: "user" for personal preferences, "project" for project knowledge.',
          enum: ['user', 'project'],
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'gmail_search',
    displayName: 'Gmail Search',
    description:
      'Searches the connected Gmail inbox and returns matching messages with sender, subject, date and snippet. Supports Gmail search syntax such as "from:boss@company.com", "is:unread", "newer_than:7d", "has:attachment".',
    category: 'google_workspace',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query. Use an empty string for the latest inbox messages.' },
        maxResults: { type: 'string', description: 'How many messages to return (1-20, default 8).' },
      },
      required: [],
    },
  },
  {
    name: 'gmail_read',
    displayName: 'Read Email',
    description:
      'Reads the full body and headers of one Gmail message by its message id (obtained from gmail_search).',
    category: 'google_workspace',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Gmail message id from gmail_search.' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'gmail_send',
    displayName: 'Send Email',
    description:
      'Sends an email from the connected Gmail account. Only use after the user has clearly asked to send an email and the recipient, subject and body are known.',
    category: 'google_workspace',
    permissionLevel: 'workspace_write',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address (comma separated for multiple).' },
        subject: { type: 'string', description: 'Email subject line.' },
        body: { type: 'string', description: 'Plain-text email body.' },
        cc: { type: 'string', description: 'Optional CC recipients.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'calendar_list_events',
    displayName: 'Calendar Lookup',
    description:
      'Lists upcoming events from the connected Google Calendar between two ISO date-times (defaults: now to 14 days ahead). Use for "what is on my calendar", scheduling checks and free-time questions.',
    category: 'google_workspace',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'Start of the window, ISO 8601 (e.g. "2026-11-09T00:00:00+08:00"). Defaults to now.' },
        timeMax: { type: 'string', description: 'End of the window, ISO 8601. Defaults to 14 days after now.' },
        maxResults: { type: 'string', description: 'Maximum events to return (1-25, default 10).' },
        query: { type: 'string', description: 'Optional text to filter events by.' },
      },
      required: [],
    },
  },
  {
    name: 'calendar_create_event',
    displayName: 'Create Calendar Event',
    description:
      'Creates an event on the connected Google Calendar and invites attendees. Only use when the user has clearly asked to schedule something and the title, start and end are known.',
    category: 'google_workspace',
    permissionLevel: 'workspace_write',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title.' },
        start: { type: 'string', description: 'Start date-time in ISO 8601, e.g. "2026-11-10T15:00:00+08:00".' },
        end: { type: 'string', description: 'End date-time in ISO 8601.' },
        timeZone: { type: 'string', description: 'IANA timezone for the event, e.g. "Asia/Kuala_Lumpur".' },
        description: { type: 'string', description: 'Optional event description or agenda.' },
        location: { type: 'string', description: 'Optional location or meeting link.' },
        attendees: { type: 'string', description: 'Optional comma-separated attendee email addresses.' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  {
    name: 'drive_search',
    displayName: 'Drive Search',
    description:
      'Searches Google Drive for files by name or content keywords and returns ids, types, owners and links. Use to find documents before reading them.',
    category: 'google_workspace',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the file name to look for.' },
        maxResults: { type: 'string', description: 'How many files to return (1-25, default 10).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'drive_read_file',
    displayName: 'Read Drive File',
    description:
      'Reads the text content of a Google Drive file (Google Docs are exported as plain text) by its file id from drive_search.',
    category: 'google_workspace',
    permissionLevel: 'read_only',
    enabledByDefault: true,
    parametersSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file id from drive_search.' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'external_webhook_dispatch',
    displayName: 'Webhook Dispatch',
    description:
      'Dispatches a structured payload to an external automation webhook. Requires explicit operator approval.',
    category: 'external_connector',
    permissionLevel: 'sensitive_approval_required',
    enabledByDefault: false,
    parametersSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Target webhook identifier or endpoint label.' },
        payloadSummary: { type: 'string', description: 'Structured summary of the data being sent.' },
      },
      required: ['destination', 'payloadSummary'],
    },
  },
];

export const GOOGLE_TOOL_NAMES = new Set(
  BUILT_IN_TOOLS.filter((tool) => tool.category === 'google_workspace').map((tool) => tool.name)
);

export const DEFAULT_MCP_CONNECTORS: MCPConnectorAdapter[] = [
  {
    id: 'connector-google-workspace',
    name: 'Google Workspace',
    transport: 'http_sse',
    endpointUrl: 'https://www.googleapis.com',
    status: 'standby',
    requiresApproval: false,
    exposedTools: [
      'gmail_search',
      'gmail_read',
      'gmail_send',
      'calendar_list_events',
      'calendar_create_event',
      'drive_search',
      'drive_read_file',
    ],
    description: 'Gmail, Calendar and Drive through your own Google account.',
  },
  {
    id: 'connector-core-utilities',
    name: 'NEXUS Core Utilities',
    transport: 'stdio_bridge',
    endpointUrl: 'internal://nexus/core',
    status: 'connected',
    requiresApproval: false,
    exposedTools: [
      'datetime_inspector',
      'precision_calculator',
      'text_summarizer_analyzer',
      'file_content_analyzer',
      'workspace_memory_lookup',
      'memory_save',
    ],
    description: 'Time, math, text analysis and long-term memory.',
  },
];

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolDefinition['parametersSchema'];
  };
}

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

  public getToolLabel(name: string): string {
    return this.tools.get(name)?.displayName || name;
  }

  /** Tools advertised to the model as OpenAI-style function definitions. */
  public getOpenAITools(enabledTools: Record<string, boolean>): OpenAIToolSchema[] {
    return this.listTools()
      .filter((tool) => enabledTools[tool.name] !== false)
      .map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parametersSchema,
        },
      }));
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
