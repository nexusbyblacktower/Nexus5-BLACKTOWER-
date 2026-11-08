import {
  MemoryCategory,
  MemoryEntry,
  MemoryLayer,
  MemoryStoreStatus,
  categoryForLayer,
  layerForCategory,
} from '../src/types/nexus.ts';
import { getOperatorProfile } from './authService.ts';
import { supabaseMemoryStore } from './supabaseMemoryStore.ts';

/**
 * Three-layer memory facade. Storage and encryption live in Supabase
 * (see supabaseMemoryStore.ts); nothing here writes to the app's disk.
 */
export class MemoryService {
  private owner(): string {
    return getOperatorProfile().id;
  }

  public async listMemories(
    filters?: {
      category?: MemoryCategory;
      layer?: MemoryLayer;
      projectId?: string;
      conversationId?: string;
      search?: string;
    },
    userId?: string
  ): Promise<MemoryEntry[]> {
    const entries = await supabaseMemoryStore.list(userId || this.owner());
    let list = entries;

    if (filters?.category) {
      list = list.filter((m) => m.category === filters.category);
    }
    if (filters?.layer) {
      list = list.filter((m) => m.layer === filters.layer);
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

    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Memory injected into a system prompt: long-term (who the user is),
   * mid-term (project knowledge), short-term (this conversation).
   */
  public async getRelevantContextMemories(params: {
    projectId?: string | null;
    conversationId?: string | null;
    includeUserMemory: boolean;
    includeProjectMemory: boolean;
    userId?: string;
  }): Promise<MemoryEntry[]> {
    const entries = await supabaseMemoryStore.list(params.userId || this.owner());

    return entries
      .filter((m) => {
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
      })
      .slice(0, 40);
  }

  public async createMemory(
    input: {
      category?: MemoryCategory;
      layer?: MemoryLayer;
      title: string;
      content: string;
      projectId?: string | null;
      conversationId?: string | null;
      tags?: string[];
      userApproved?: boolean;
    },
    userId?: string
  ): Promise<MemoryEntry> {
    const layer: MemoryLayer = input.layer || (input.category ? layerForCategory(input.category) : 'long_term');
    const category: MemoryCategory =
      input.category || categoryForLayer(layer);

    return supabaseMemoryStore.create({
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: userId || this.owner(),
      layer,
      category,
      title: input.title.trim(),
      content: input.content.trim(),
      projectId: input.projectId || null,
      conversationId: input.conversationId || null,
      tags: input.tags || [],
      userApproved: input.userApproved ?? true,
    });
  }

  public async updateMemory(
    id: string,
    updates: Partial<
      Pick<MemoryEntry, 'title' | 'content' | 'layer' | 'category' | 'tags' | 'userApproved' | 'projectId'>
    >,
    userId?: string
  ): Promise<MemoryEntry | null> {
    const patch = { ...updates };
    if (patch.layer && !patch.category) {
      patch.category = categoryForLayer(patch.layer);
    }
    if (patch.category && !patch.layer) {
      patch.layer = layerForCategory(patch.category);
    }
    return supabaseMemoryStore.update(id, userId || this.owner(), patch);
  }

  public async deleteMemory(id: string, userId?: string): Promise<boolean> {
    return supabaseMemoryStore.remove(id, userId || this.owner());
  }

  public async getStatus(): Promise<MemoryStoreStatus> {
    return supabaseMemoryStore.status();
  }
}

export const memoryService = new MemoryService();
