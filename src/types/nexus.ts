export type BrainType = 'FLASH' | 'REASONING';
export type BrainRoutingMode = 'AUTO' | 'MANUAL';

/**
 * Default OpenRouter model IDs.
 * REASONING is tuned for deep, explainable reasoning and clear teaching.
 * FLASH is the low-latency conversational model.
 */
export const BRAIN_MODELS = {
  FLASH: 'google/gemini-2.5-flash',
  REASONING: 'anthropic/claude-sonnet-4.5',
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

/** Three memory layers: short term (this session), mid term (project), long term (you). */
export type MemoryLayer = 'short_term' | 'mid_term' | 'long_term';

export const MEMORY_LAYERS: {
  id: MemoryLayer;
  label: string;
  description: string;
  categories: MemoryCategory[];
}[] = [
  {
    id: 'short_term',
    label: 'Short-term',
    description: 'Working context for the active session. Fades once the conversation ends.',
    categories: ['conversation_context', 'temporary_task_context'],
  },
  {
    id: 'mid_term',
    label: 'Mid-term',
    description: 'Project knowledge — decisions and constraints that stay with one project.',
    categories: ['project_memory'],
  },
  {
    id: 'long_term',
    label: 'Long-term',
    description: 'Durable facts about you: who you are, how you like to be spoken to.',
    categories: ['user_memory'],
  },
];

export function layerForCategory(category: MemoryCategory): MemoryLayer {
  if (category === 'user_memory') return 'long_term';
  if (category === 'project_memory') return 'mid_term';
  return 'short_term';
}

export function categoryForLayer(layer: MemoryLayer): MemoryCategory {
  if (layer === 'long_term') return 'user_memory';
  if (layer === 'mid_term') return 'project_memory';
  return 'conversation_context';
}

export interface MemoryEntry {
  id: string;
  /** Owning user. Memory is never shared across users. */
  userId: string;
  layer: MemoryLayer;
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

export type MemoryStoreState = 'ready' | 'not_configured' | 'schema_missing' | 'unreachable';

export interface MemoryStoreStatus {
  provider: 'supabase';
  state: MemoryStoreState;
  encrypted: boolean;
  detail?: string;
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
  category: 'core_utility' | 'analysis' | 'memory' | 'external_connector';
  permissionLevel: 'read_only' | 'sensitive_approval_required';
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

export type ReplyPattern = 'direct' | 'structured' | 'conversational' | 'step_by_step';
export type AgentTone = 'friendly' | 'warm' | 'neutral' | 'formal' | 'playful';
export type AgentVerbosity = 'concise' | 'balanced' | 'detailed';

/** How the agent answers, and how it sounds while doing it. */
export interface AgentPersona {
  replyPattern: ReplyPattern;
  tone: AgentTone;
  verbosity: AgentVerbosity;
  /** Free-form personality brief written by the user. */
  personality: string;
  /** Free-form extra instructions (formatting rules, catchphrases, do-nots). */
  customInstructions: string;
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
  agentPersona: AgentPersona;
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
  openRouterConfigured: boolean;
  /** Where the working key came from: the user's own key, or the server environment. */
  openRouterKeySource: 'user' | 'environment' | 'none';
  /** Safe display hint (e.g. "••••4821"). Never the key itself. */
  openRouterKeyHint?: string;
  openRouterEndpoint: string;
  geminiFallbackAvailable: boolean;
  configuredModels: {
    flash: string;
    reasoning: string;
    fallback: string;
  };
  memoryStore: MemoryStoreStatus;
}
