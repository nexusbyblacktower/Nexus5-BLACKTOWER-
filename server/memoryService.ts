import fs from 'fs';
import path from 'path';
import { MemoryCategory, MemoryEntry } from '../src/types/nexus.ts';
import { syncDoc, unsyncDoc } from './supabaseStore.ts';

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
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'when', 'where',
  'which', 'about', 'your', 'you', 'our', 'can', 'could', 'would', 'should', 'please',
  'help', 'need', 'want', 'into', 'then', 'than', 'them', 'they', 'there', 'here',
  'are', 'was', 'were', 'will', 'just', 'like', 'also', 'some', 'any', 'how', 'why',
  'not', 'but', 'all', 'get', 'got', 'use', 'using', 'nexus', 'make', 'sure',
]);

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

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
    this.persistLocal();
    return [...SEED_MEMORIES];
  }

  private persistLocal(): void {
    ensureDataDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memories, null, 2), 'utf-8');
  }

  private saveStore(): void {
    this.persistLocal();
  }

  /** Replaces local state with the cloud copy, or seeds the cloud from local state. */
  public hydrateFromCloud(rows: MemoryEntry[]): void {
    if (!Array.isArray(rows) || rows.length === 0) {
      for (const memory of this.memories) syncDoc('memory', memory.id, memory);
      return;
    }
    this.memories = rows;
    this.persistLocal();
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

  /**
   * Ranks approved memories against the current prompt so NEXUS recalls what is
   * actually relevant instead of dumping the whole vault into the prompt.
   */
  public searchRelevant(
    query: string,
    options: {
      limit?: number;
      projectId?: string | null;
      conversationId?: string | null;
      includeUser?: boolean;
      includeProject?: boolean;
    } = {}
  ): MemoryEntry[] {
    const limit = options.limit ?? 10;
    const tokens = tokenize(query);
    const includeUser = options.includeUser ?? true;
    const includeProject = options.includeProject ?? true;

    const candidates = this.memories.filter((memory) => {
      if (!memory.userApproved) return false;
      if (memory.category === 'user_memory') return includeUser;
      if (memory.category === 'project_memory') {
        if (!includeProject) return false;
        return !memory.projectId || memory.projectId === options.projectId;
      }
      if (memory.category === 'conversation_context') {
        return memory.conversationId === options.conversationId;
      }
      return !memory.conversationId || memory.conversationId === options.conversationId;
    });

    const scored = candidates.map((memory) => {
      const haystack = `${memory.title} ${memory.content} ${memory.tags.join(' ')}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 3;
        if (memory.title.toLowerCase().includes(token)) score += 2;
        if (memory.tags.some((tag) => tag.toLowerCase().includes(token))) score += 1;
      }
      const ageDays = (Date.now() - new Date(memory.updatedAt).getTime()) / 86400000;
      score += Math.max(0, 2 - ageDays / 14);
      return { memory, score };
    });

    const matched = scored.filter((entry) => entry.score > 0);
    const pool = matched.length > 0 ? matched : scored;

    return pool
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.memory);
  }

  /** Memories injected into every prompt (approved + policy-scoped). */
  public getRelevantContextMemories(params: {
    projectId?: string | null;
    conversationId?: string | null;
    includeUserMemory: boolean;
    includeProjectMemory: boolean;
    query?: string;
  }): MemoryEntry[] {
    return this.searchRelevant(params.query || '', {
      limit: 12,
      projectId: params.projectId,
      conversationId: params.conversationId,
      includeUser: params.includeUserMemory,
      includeProject: params.includeProjectMemory,
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
    this.saveStore();
    syncDoc('memory', entry.id, entry);
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
    this.saveStore();
    syncDoc('memory', updated.id, updated);
    return updated;
  }

  public deleteMemory(id: string): boolean {
    const initialLen = this.memories.length;
    this.memories = this.memories.filter((m) => m.id !== id);
    if (this.memories.length !== initialLen) {
      this.saveStore();
      unsyncDoc('memory', id);
      return true;
    }
    return false;
  }
}

export const memoryService = new MemoryService();
