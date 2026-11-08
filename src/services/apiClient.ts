import {
  AgentTask,
  BrainRoutingDecision,
  BrainRoutingMode,
  BrainType,
  ChatMessage,
  ConnectionsStatus,
  Conversation,
  FileAttachment,
  GatewayStatus,
  MCPConnectorAdapter,
  MemoryCategory,
  MemoryEntry,
  NexusSettings,
  ProjectWorkspace,
  ToolDefinition,
  ToolExecutionRecord,
} from '../types/nexus.ts';

export interface SystemStatusResponse {
  gateway: GatewayStatus;
  operator: {
    id: string;
    name: string;
    role: string;
    organization: string;
    clearanceLevel: string;
    sessionActive: boolean;
  };
  settings: NexusSettings;
  connections?: ConnectionsStatus;
}

export interface StreamChatCallbacks {
  onRoutingDecision?: (data: {
    conversationId: string;
    userMessage: ChatMessage;
    decision: BrainRoutingDecision;
    toolExecutions: ToolExecutionRecord[];
  }) => void;
  onRoutingUpdate?: (decision: BrainRoutingDecision) => void;
  onToolExecution?: (record: ToolExecutionRecord) => void;
  onToken: (token: string) => void;
  onComplete: (data: { assistantMessage: ChatMessage; conversation: Conversation }) => void;
  onError: (data: {
    error: string;
    assistantMessage?: ChatMessage;
    conversation?: Conversation;
  }) => void;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const apiClient = {
  getStatus: () => fetchJson<SystemStatusResponse>('/api/status'),

  getConnections: () => fetchJson<ConnectionsStatus>('/api/connections'),
  disconnectGoogle: () =>
    fetchJson<{ disconnected: boolean }>('/api/google/disconnect', { method: 'POST' }),
  checkGateway: () =>
    fetchJson<{ ok: boolean; message?: string; error?: string }>('/api/gateway/check', {
      method: 'POST',
    }),

  getSettings: () => fetchJson<NexusSettings>('/api/settings'),
  updateSettings: (updates: Partial<NexusSettings>) =>
    fetchJson<NexusSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  resetSettings: () =>
    fetchJson<NexusSettings>('/api/settings/reset', {
      method: 'POST',
    }),

  listProjects: () => fetchJson<ProjectWorkspace[]>('/api/projects'),
  createProject: (input: {
    name: string;
    description: string;
    systemInstructions: string;
    defaultBrain?: BrainType;
    defaultMode?: BrainRoutingMode;
    colorAccent?: 'violet' | 'cyan' | 'emerald' | 'amber';
  }) =>
    fetchJson<ProjectWorkspace>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteProject: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),

  listConversations: (params?: { search?: string; projectId?: string | null }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.projectId) qs.set('projectId', params.projectId);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson<Conversation[]>(`/api/conversations${queryStr}`);
  },
  getConversation: (id: string) => fetchJson<Conversation>(`/api/conversations/${id}`),
  createConversation: (input?: {
    title?: string;
    projectId?: string | null;
    selectedBrain?: BrainType;
    selectedModel?: string;
    brainMode?: BrainRoutingMode;
  }) =>
    fetchJson<Conversation>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify(input || {}),
    }),
  updateConversation: (
    id: string,
    updates: Partial<
      Pick<Conversation, 'title' | 'projectId' | 'selectedBrain' | 'selectedModel' | 'brainMode'>
    >
  ) =>
    fetchJson<Conversation>(`/api/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteConversation: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/conversations/${id}`, {
      method: 'DELETE',
    }),

  streamChat: async (
    params: {
      conversationId?: string;
      content: string;
      mode?: BrainRoutingMode;
      requestedBrain?: BrainType;
      requestedModel?: string;
      attachments?: FileAttachment[];
      editFromMessageId?: string;
      regenerateFromAssistantId?: string;
      signal?: AbortSignal;
    },
    callbacks: StreamChatCallbacks
  ): Promise<void> => {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: params.conversationId,
        content: params.content,
        mode: params.mode,
        requestedBrain: params.requestedBrain,
        requestedModel: params.requestedModel,
        attachments: params.attachments,
        editFromMessageId: params.editFromMessageId,
        regenerateFromAssistantId: params.regenerateFromAssistantId,
      }),
      signal: params.signal,
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Streaming response body unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const lines = block.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr += line.slice(5).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (eventType === 'routing_decision') {
            callbacks.onRoutingDecision?.(parsed);
          } else if (eventType === 'routing_update') {
            callbacks.onRoutingUpdate?.(parsed);
          } else if (eventType === 'tool_execution') {
            callbacks.onToolExecution?.(parsed);
          } else if (eventType === 'token') {
            callbacks.onToken(parsed.token || '');
          } else if (eventType === 'complete') {
            callbacks.onComplete(parsed);
          } else if (eventType === 'error_event') {
            callbacks.onError(parsed);
          }
        } catch (err) {
          console.error('Failed to parse SSE frame:', err);
        }
      }
    }
  },

  listMemories: (params?: {
    category?: MemoryCategory;
    projectId?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.projectId) qs.set('projectId', params.projectId);
    if (params?.search) qs.set('search', params.search);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    return fetchJson<MemoryEntry[]>(`/api/memories${queryStr}`);
  },
  createMemory: (input: {
    category: MemoryCategory;
    title: string;
    content: string;
    projectId?: string | null;
    conversationId?: string | null;
    tags?: string[];
    userApproved?: boolean;
  }) =>
    fetchJson<MemoryEntry>('/api/memories', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMemory: (
    id: string,
    updates: Partial<
      Pick<MemoryEntry, 'title' | 'content' | 'category' | 'tags' | 'userApproved' | 'projectId'>
    >
  ) =>
    fetchJson<MemoryEntry>(`/api/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  deleteMemory: (id: string) =>
    fetchJson<{ deleted: boolean }>(`/api/memories/${id}`, {
      method: 'DELETE',
    }),

  listToolsAndConnectors: () =>
    fetchJson<{ tools: ToolDefinition[]; connectors: MCPConnectorAdapter[] }>('/api/tools'),
  executeToolDirect: (toolName: string, args: Record<string, unknown>, approvedByUser = false) =>
    fetchJson<ToolExecutionRecord>('/api/tools/execute', {
      method: 'POST',
      body: JSON.stringify({ toolName, args, approvedByUser }),
    }),
  registerConnector: (input: Omit<MCPConnectorAdapter, 'id' | 'status'>) =>
    fetchJson<MCPConnectorAdapter>('/api/connectors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listAgentTasks: (conversationId?: string) => {
    const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    return fetchJson<AgentTask[]>(`/api/agent/tasks${qs}`);
  },
  runAgentTask: (input: {
    objective: string;
    conversationId?: string | null;
    projectId?: string | null;
    mode?: BrainRoutingMode;
    requestedBrain?: BrainType;
    attachments?: FileAttachment[];
  }) =>
    fetchJson<AgentTask>('/api/agent/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  resolveAgentToolApproval: (
    taskId: string,
    executionId: string,
    decision: 'approve' | 'reject'
  ) =>
    fetchJson<AgentTask>(`/api/agent/tasks/${taskId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ executionId, decision }),
    }),
};
