export type BrainType = 'FLASH' | 'REASONING';
export type BrainRoutingMode = 'AUTO' | 'MANUAL';

export const BRAIN_MODELS = {
  FLASH: 'deepseek/deepseek-v4.1-flash-1017',
  REASONING: 'anthropic/claude-sonnet-5.5',
} as const;

export interface BrainRoutingDecision {
  mode: BrainRoutingMode;
  selectedBrain: BrainType;
  requestedModelId: string;
  executedModelId: string;
  gatewayUsed: 'openrouter' | 'fallback_openrouter' | 'fallback_gemini';
  fallbackTriggered: boolean;
  fallbackReason?: string;
  complexityScore: number; // 1 to 10
  requiresTools: boolean;
  detectedTools: string[];
  reasoningSummary: string;
  timestamp: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  contentText: string;
}

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  status: 'pending_approval' | 'running' | 'completed' | 'failed' | 'rejected';
  requiresApproval: boolean;
  output?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: FileAttachment[];
  routingDecision?: BrainRoutingDecision;
  toolExecutions?: ToolExecutionRecord[];
  agentTaskId?: string;
  isEdited?: boolean;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  selectedBrain: BrainType;
  selectedModel: string;
  brainMode: BrainRoutingMode;
  messages: ChatMessage[];
}

export type MemoryCategory =
  | 'user_memory'
  | 'project_memory'
  | 'conversation_context'
  | 'temporary_task_context';

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  title: string;
  content: string;
  projectId?: string | null;
  conversationId?: string | null;
  tags: string[];
  userApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  description: string;
  systemInstructions: string;
  defaultBrain: BrainType;
  defaultMode: BrainRoutingMode;
  colorAccent: 'violet' | 'cyan' | 'emerald' | 'amber';
  createdAt: string;
  updatedAt: string;
}

export type AgentProtocolPhase =
  | 'UNDERSTAND'
  | 'PLAN'
  | 'SELECT_BRAIN'
  | 'SELECT_TOOLS'
  | 'EXECUTE'
  | 'VERIFY'
  | 'RESPOND';

export interface AgentPlanStep {
  id: string;
  index: number;
  phase: AgentProtocolPhase;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'waiting_approval' | 'completed' | 'failed';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  outputSummary?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentTask {
  id: string;
  conversationId?: string | null;
  projectId?: string | null;
  objective: string;
  status: 'planning' | 'executing' | 'waiting_approval' | 'verifying' | 'completed' | 'failed';
  currentPhase: AgentProtocolPhase;
  routingDecision: BrainRoutingDecision;
  steps: AgentPlanStep[];
  toolCalls: ToolExecutionRecord[];
  verificationSummary?: string;
  finalResult?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  category: 'core_utility' | 'analysis' | 'memory' | 'external_connector' | 'google_workspace';
  permissionLevel: 'read_only' | 'workspace_write' | 'sensitive_approval_required';
  enabledByDefault: boolean;
  parametersSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface MCPConnectorAdapter {
  id: string;
  name: string;
  transport: 'http_sse' | 'stdio_bridge' | 'modular_webhook';
  endpointUrl: string;
  status: 'connected' | 'standby' | 'disabled';
  requiresApproval: boolean;
  exposedTools: string[];
  description: string;
}

export interface NexusSettings {
  defaultBrain: BrainType;
  brainMode: BrainRoutingMode;
  flashModelId: string;
  reasoningModelId: string;
  fallbackModelId: string;
  enableVerifiedFallback: boolean;
  temperature: number;
  maxOutputTokens: number;
  streamingEnabled: boolean;
  memoryPolicy: {
    injectUserMemory: boolean;
    injectProjectMemory: boolean;
    requireExplicitApprovalToSave: boolean;
  };
  agentLimits: {
    maxPlanSteps: number;
    toolTimeoutMs: number;
    requireApprovalForExternalTools: boolean;
  };
  enabledTools: Record<string, boolean>;
  appearance: {
    glassBlurIntensity: 'subtle' | 'balanced' | 'deep';
    ambientGlow: 'violet_cyan' | 'obsidian_minimal' | 'amethyst';
    compactDensity: boolean;
  };
}

export interface GatewayStatus {
  chatGatewayReady: boolean;
  toolCallingEnabled: boolean;
  configuredModels: {
    flash: string;
    reasoning: string;
    fallback: string;
  };
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  email?: string;
  connectedAt?: string;
  scopes?: string[];
  lastError?: string;
  redirectUri?: string;
}

export interface StorageStatus {
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  engine: 'supabase' | 'local';
  error?: string;
}

export interface ConnectionsStatus {
  google: GoogleConnectionStatus;
  storage: StorageStatus;
}
