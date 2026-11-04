import fs from 'fs';
import path from 'path';
import { MemoryCategory, MemoryEntry } from '../src/types/nexus.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'nexus_memories.json');

const SEED_MEMORIES: MemoryEntry[] = [
  {
    id: 'mem-user-01',
    category: 'user_memory',
    title: 'Communication & Language Preference',
    content:
      'Prefers concise, direct technical and strategic analysis. Comfortable with natural English and Malaysian expressions (bro, lah, steady) when appropriate.',
    tags: ['style', 'language', 'preferences'],
    userApproved: true,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'mem-user-02',
    category: 'user_memory',
    title: 'Architecture Standard',
    content:
      'Prioritizes modular full-stack TypeScript architectures, strict server-side secret isolation, and verifiable tool execution.',
    tags: ['engineering', 'security', 'architecture'],
    userApproved: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'mem-proj-01',
    category: 'project_memory',
    title: 'NEXUS 5.5 Dual-Brain Routing Policy',
    content:
      'FLASH Brain (deepseek/deepseek-v4.1-flash-1017) handles fast everyday synthesis and lightweight tool triage. REASONING Brain (anthropic/claude-sonnet-5.5) handles multi-step coding, architecture, and deep verification.',
    projectId: 'proj-nexus-core',
    tags: ['nexus', 'routing', 'models'],
    userApproved: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export class MemoryService {
  private memories: MemoryEntry[];

  constructor() {
    ensureDataDir();
    this.memories = this.load();
  }

  private load(): MemoryEntry[] {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to read memory store, initializing seed memories:', err);
    }
    this.save(SEED_MEMORIES);
    return [...SEED_MEMORIES];
  }

  private save(entries: MemoryEntry[]): void {
    ensureDataDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
  }

  public listMemories(filters?: {
    category?: MemoryCategory;
    projectId?: string;
    conversationId?: string;
    search?: string;
  }): MemoryEntry[] {
    let list = [...this.memories];
    if (filters?.category) {
      list = list.filter((m) => m.category === filters.category);
    }
    if (filters?.projectId) {
      list = list.filter((m) => !m.projectId || m.projectId === filters.projectId);
    }
    if (filters?.conversationId) {
      list = list.filter((m) => !m.conversationId || m.conversationId === filters.conversationId);
    }
    if (filters?.search?.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getRelevantContextMemories(params: {
    projectId?: string | null;
    conversationId?: string | null;
    includeUserMemory: boolean;
    includeProjectMemory: boolean;
  }): MemoryEntry[] {
    return this.memories.filter((m) => {
      if (!m.userApproved) return false;
      if (m.category === 'user_memory') return params.includeUserMemory;
      if (m.category === 'project_memory') {
        if (!params.includeProjectMemory) return false;
        return !m.projectId || m.projectId === params.projectId;
      }
      if (m.category === 'conversation_context') {
        return m.conversationId === params.conversationId;
      }
      if (m.category === 'temporary_task_context') {
        return !m.conversationId || m.conversationId === params.conversationId;
      }
      return false;
    });
  }

  public createMemory(input: {
    category: MemoryCategory;
    title: string;
    content: string;
    projectId?: string | null;
    conversationId?: string | null;
    tags?: string[];
    userApproved?: boolean;
  }): MemoryEntry {
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: input.category,
      title: input.title.trim(),
      content: input.content.trim(),
      projectId: input.projectId || null,
      conversationId: input.conversationId || null,
      tags: input.tags || [],
      userApproved: input.userApproved ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.memories.unshift(entry);
    this.save(this.memories);
    return entry;
  }

  public updateMemory(
    id: string,
    updates: Partial<Pick<MemoryEntry, 'title' | 'content' | 'category' | 'tags' | 'userApproved' | 'projectId'>>
  ): MemoryEntry | null {
    const idx = this.memories.findIndex((m) => m.id === id);
    if (idx === -1) return null;

    const updated: MemoryEntry = {
      ...this.memories[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.memories[idx] = updated;
    this.save(this.memories);
    return updated;
  }

  public deleteMemory(id: string): boolean {
    const initialLen = this.memories.length;
    this.memories = this.memories.filter((m) => m.id !== id);
    if (this.memories.length !== initialLen) {
      this.save(this.memories);
      return true;
    }
    return false;
  }
}

export const memoryService = new MemoryService();
