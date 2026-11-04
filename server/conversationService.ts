import fs from 'fs';
import path from 'path';
import {
  BRAIN_MODELS,
  BrainRoutingMode,
  BrainType,
  ChatMessage,
  Conversation,
  ProjectWorkspace,
} from '../src/types/nexus.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'nexus_conversations.json');

interface ConversationDatabaseSchema {
  projects: ProjectWorkspace[];
  conversations: Conversation[];
}

const SEED_PROJECTS: ProjectWorkspace[] = [
  {
    id: 'proj-nexus-core',
    name: 'BLACKTOWER // Core Systems',
    description: 'Architecture, security hardening, and dual-brain routing protocols for NEXUS 5.5.',
    systemInstructions:
      'Focus on resilient system design, strict TypeScript contracts, zero secret leakage, and high-efficiency execution.',
    defaultBrain: 'REASONING',
    defaultMode: 'AUTO',
    colorAccent: 'violet',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'proj-quant-research',
    name: 'Strategic Intelligence & Market Synthesis',
    description: 'High-speed synthesis, risk evaluation, and executive decision briefs.',
    systemInstructions:
      'Prioritize asymmetric risk-reward analysis, verified facts over speculation, and actionable recommendations.',
    defaultBrain: 'FLASH',
    defaultMode: 'AUTO',
    colorAccent: 'cyan',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class ConversationService {
  private db: ConversationDatabaseSchema;

  constructor() {
    ensureDataDir();
    this.db = this.load();
  }

  private load(): ConversationDatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          projects: Array.isArray(parsed.projects) ? parsed.projects : SEED_PROJECTS,
          conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
        };
      }
    } catch (err) {
      console.error('Failed to load conversation database, initializing clean state:', err);
    }
    const initial: ConversationDatabaseSchema = {
      projects: [...SEED_PROJECTS],
      conversations: [],
    };
    this.save(initial);
    return initial;
  }

  private save(data: ConversationDatabaseSchema): void {
    ensureDataDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  // Projects CRUD
  public listProjects(): ProjectWorkspace[] {
    return [...this.db.projects].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getProject(id?: string | null): ProjectWorkspace | null {
    if (!id) return null;
    return this.db.projects.find((p) => p.id === id) || null;
  }

  public createProject(input: {
    name: string;
    description: string;
    systemInstructions: string;
    defaultBrain?: BrainType;
    defaultMode?: BrainRoutingMode;
    colorAccent?: 'violet' | 'cyan' | 'emerald' | 'amber';
  }): ProjectWorkspace {
    const now = new Date().toISOString();
    const project: ProjectWorkspace = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name.trim(),
      description: input.description.trim(),
      systemInstructions: input.systemInstructions.trim(),
      defaultBrain: input.defaultBrain || 'FLASH',
      defaultMode: input.defaultMode || 'AUTO',
      colorAccent: input.colorAccent || 'violet',
      createdAt: now,
      updatedAt: now,
    };
    this.db.projects.unshift(project);
    this.save(this.db);
    return project;
  }

  public deleteProject(id: string): boolean {
    const initialLen = this.db.projects.length;
    this.db.projects = this.db.projects.filter((p) => p.id !== id);
    if (this.db.projects.length !== initialLen) {
      // Unlink conversations from deleted project
      this.db.conversations = this.db.conversations.map((c) =>
        c.projectId === id ? { ...c, projectId: null } : c
      );
      this.save(this.db);
      return true;
    }
    return false;
  }

  // Conversations CRUD
  public listConversations(filters?: { search?: string; projectId?: string | null }): Conversation[] {
    let list = [...this.db.conversations];
    if (filters?.projectId) {
      list = list.filter((c) => c.projectId === filters.projectId);
    }
    if (filters?.search?.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.content.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getConversation(id: string): Conversation | null {
    return this.db.conversations.find((c) => c.id === id) || null;
  }

  public createConversation(input?: {
    title?: string;
    projectId?: string | null;
    selectedBrain?: BrainType;
    selectedModel?: string;
    brainMode?: BrainRoutingMode;
  }): Conversation {
    const now = new Date().toISOString();
    const brain = input?.selectedBrain || 'FLASH';
    const model =
      input?.selectedModel || (brain === 'REASONING' ? BRAIN_MODELS.REASONING : BRAIN_MODELS.FLASH);

    const conv: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: input?.title?.trim() || 'New Operational Session',
      projectId: input?.projectId || null,
      createdAt: now,
      updatedAt: now,
      selectedBrain: brain,
      selectedModel: model,
      brainMode: input?.brainMode || 'AUTO',
      messages: [],
    };
    this.db.conversations.unshift(conv);
    this.save(this.db);
    return conv;
  }

  public updateConversationMeta(
    id: string,
    updates: Partial<
      Pick<Conversation, 'title' | 'projectId' | 'selectedBrain' | 'selectedModel' | 'brainMode'>
    >
  ): Conversation | null {
    const idx = this.db.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    this.db.conversations[idx] = {
      ...this.db.conversations[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.save(this.db);
    return this.db.conversations[idx];
  }

  public appendMessage(conversationId: string, message: ChatMessage): Conversation | null {
    const idx = this.db.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return null;

    const conv = this.db.conversations[idx];
    conv.messages.push(message);

    // Auto-title conversation on first user message if still default
    if (
      conv.messages.filter((m) => m.role === 'user').length === 1 &&
      message.role === 'user' &&
      (conv.title === 'New Operational Session' || conv.title === 'New Chat')
    ) {
      const cleaned = message.content.replace(/\s+/g, ' ').trim();
      conv.title = cleaned.length > 48 ? `${cleaned.slice(0, 48)}...` : cleaned || 'Operational Session';
    }

    conv.updatedAt = new Date().toISOString();
    this.save(this.db);
    return conv;
  }

  public truncateMessagesFrom(conversationId: string, messageId: string): Conversation | null {
    const idx = this.db.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return null;

    const conv = this.db.conversations[idx];
    const msgIdx = conv.messages.findIndex((m) => m.id === messageId);
    if (msgIdx === -1) return conv;

    conv.messages = conv.messages.slice(0, msgIdx);
    conv.updatedAt = new Date().toISOString();
    this.save(this.db);
    return conv;
  }

  public deleteConversation(id: string): boolean {
    const initialLen = this.db.conversations.length;
    this.db.conversations = this.db.conversations.filter((c) => c.id !== id);
    if (this.db.conversations.length !== initialLen) {
      this.save(this.db);
      return true;
    }
    return false;
  }

  public getStorageMetadata() {
    return {
      engine: 'Server-Side JSON Document Persistence',
      storagePath: DB_FILE,
      persistentAcrossRestarts: true,
    };
  }
}

export const conversationService = new ConversationService();
