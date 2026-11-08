import { Pool } from 'pg';
import {
  MemoryCategory,
  MemoryEntry,
  MemoryLayer,
  MemoryStoreState,
  MemoryStoreStatus,
  layerForCategory,
} from '../src/types/nexus.ts';
import { decryptString, encryptString, isEncryptionConfigured } from './encryption.ts';

const TABLE = 'public.nexus_memories';

export type MemoryStoreErrorCode =
  | 'not_configured'
  | 'schema_missing'
  | 'unreachable'
  | 'encryption_unavailable'
  | 'request_failed';

export class MemoryStoreError extends Error {
  code: MemoryStoreErrorCode;

  constructor(code: MemoryStoreErrorCode, message: string) {
    super(message);
    this.name = 'MemoryStoreError';
    this.code = code;
  }
}

interface MemoryRow {
  id: string;
  user_id: string;
  layer: string;
  category: string;
  title_cipher: string;
  content_cipher: string;
  tags_cipher: string | null;
  project_id: string | null;
  conversation_id: string | null;
  user_approved: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

let pool: Pool | null = null;
let poolUrl: string | null = null;
let schemaReady = false;

function connectionString(): string {
  const url = (process.env.SUPABASE_DB_URL || '').trim();
  if (!url || url.includes('YOUR_SUPABASE') || url.includes('YOUR-SUPABASE')) {
    throw new MemoryStoreError(
      'not_configured',
      'Memory storage is not connected yet. Add your Supabase project connection string.'
    );
  }
  return url;
}

function isSupabaseHost(url: string): boolean {
  return /supabase\.(co|com)/i.test(url);
}

function getPool(): Pool {
  const url = connectionString();
  if (pool && poolUrl === url) return pool;

  if (pool) {
    void pool.end().catch(() => undefined);
  }

  pool = new Pool({
    connectionString: url,
    ssl: isSupabaseHost(url) ? { rejectUnauthorized: true } : undefined,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
  });
  poolUrl = url;
  schemaReady = false;
  pool.on('error', (err) => {
    console.error('Supabase pool error:', err.message);
  });
  return pool;
}

function mapError(err: unknown): MemoryStoreError {
  if (err instanceof MemoryStoreError) return err;
  const code = (err as { code?: string })?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
    return new MemoryStoreError('unreachable', 'Could not reach your Supabase database.');
  }
  if (code === '28P01' || code === '28000') {
    return new MemoryStoreError(
      'not_configured',
      'Supabase rejected the connection. Check the password in your connection string.'
    );
  }
  if (code === '42P01') {
    return new MemoryStoreError(
      'schema_missing',
      'The memory table does not exist yet and could not be created.'
    );
  }
  return new MemoryStoreError('request_failed', 'Supabase memory request failed.');
}

/**
 * The app owns no memory storage of its own: rows live in the user's Supabase
 * project. Text is encrypted with AES-256-GCM before it is written, and every
 * statement is scoped to a single user id.
 */
async function ensureSchema(): Promise<Pool> {
  const db = getPool();
  if (!schemaReady) {
    try {
      await db.query(`
        create table if not exists ${TABLE} (
          id text primary key,
          user_id text not null,
          layer text not null,
          category text not null,
          title_cipher text not null,
          content_cipher text not null,
          tags_cipher text,
          project_id text,
          conversation_id text,
          user_approved boolean not null default true,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.query(
        `create index if not exists nexus_memories_user_updated_idx on ${TABLE} (user_id, updated_at desc)`
      );
      schemaReady = true;
    } catch (err) {
      throw mapError(err);
    }
  }
  return db;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToEntry(row: MemoryRow): MemoryEntry {
  const category = row.category as MemoryCategory;
  let tags: string[] = [];
  try {
    const rawTags = decryptString(row.tags_cipher);
    if (rawTags) {
      const parsed = JSON.parse(rawTags);
      if (Array.isArray(parsed)) tags = parsed.map(String);
    }
  } catch {
    tags = [];
  }

  let title: string;
  let content: string;
  try {
    title = decryptString(row.title_cipher);
    content = decryptString(row.content_cipher);
  } catch {
    title = '[Cannot be read with the current key]';
    content = 'This entry was encrypted with a different encryption key.';
  }

  return {
    id: row.id,
    userId: row.user_id,
    layer: (row.layer as MemoryLayer) || layerForCategory(category),
    category,
    title,
    content,
    projectId: row.project_id,
    conversationId: row.conversation_id,
    tags,
    userApproved: row.user_approved,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class SupabaseMemoryStore {
  private ensureEncryption() {
    if (!isEncryptionConfigured()) {
      throw new MemoryStoreError(
        'encryption_unavailable',
        'Encryption is not configured, so memory cannot be stored safely.'
      );
    }
  }

  public async list(userId: string): Promise<MemoryEntry[]> {
    this.ensureEncryption();
    const db = await ensureSchema();
    try {
      const { rows } = await db.query<MemoryRow>(
        `select * from ${TABLE} where user_id = $1 order by updated_at desc limit 500`,
        [userId]
      );
      return rows.map(rowToEntry);
    } catch (err) {
      throw mapError(err);
    }
  }

  public async create(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<MemoryEntry> {
    this.ensureEncryption();
    const db = await ensureSchema();
    try {
      const { rows } = await db.query<MemoryRow>(
        `insert into ${TABLE}
          (id, user_id, layer, category, title_cipher, content_cipher, tags_cipher, project_id, conversation_id, user_approved)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          entry.id,
          entry.userId,
          entry.layer,
          entry.category,
          encryptString(entry.title),
          encryptString(entry.content),
          encryptString(JSON.stringify(entry.tags || [])),
          entry.projectId || null,
          entry.conversationId || null,
          entry.userApproved,
        ]
      );
      return rowToEntry(rows[0]);
    } catch (err) {
      throw mapError(err);
    }
  }

  public async update(
    id: string,
    userId: string,
    patch: Partial<
      Pick<
        MemoryEntry,
        'title' | 'content' | 'layer' | 'category' | 'tags' | 'userApproved' | 'projectId'
      >
    >
  ): Promise<MemoryEntry | null> {
    this.ensureEncryption();
    const db = await ensureSchema();

    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (patch.title !== undefined) push('title_cipher', encryptString(patch.title));
    if (patch.content !== undefined) push('content_cipher', encryptString(patch.content));
    if (patch.tags !== undefined) push('tags_cipher', encryptString(JSON.stringify(patch.tags)));
    if (patch.layer !== undefined) push('layer', patch.layer);
    if (patch.category !== undefined) push('category', patch.category);
    if (patch.userApproved !== undefined) push('user_approved', patch.userApproved);
    if (patch.projectId !== undefined) push('project_id', patch.projectId || null);

    if (sets.length === 0) {
      const { rows } = await db.query<MemoryRow>(
        `select * from ${TABLE} where id = $1 and user_id = $2`,
        [id, userId]
      );
      return rows[0] ? rowToEntry(rows[0]) : null;
    }

    sets.push('updated_at = now()');
    values.push(id, userId);

    try {
      const { rows } = await db.query<MemoryRow>(
        `update ${TABLE} set ${sets.join(', ')}
         where id = $${values.length - 1} and user_id = $${values.length}
         returning *`,
        values
      );
      return rows[0] ? rowToEntry(rows[0]) : null;
    } catch (err) {
      throw mapError(err);
    }
  }

  public async remove(id: string, userId: string): Promise<boolean> {
    const db = await ensureSchema();
    try {
      const { rows } = await db.query(
        `delete from ${TABLE} where id = $1 and user_id = $2 returning id`,
        [id, userId]
      );
      return rows.length > 0;
    } catch (err) {
      throw mapError(err);
    }
  }

  public async status(): Promise<MemoryStoreStatus> {
    const base: MemoryStoreStatus = { provider: 'supabase', state: 'ready', encrypted: true };
    if (!isEncryptionConfigured()) {
      return {
        ...base,
        encrypted: false,
        state: 'not_configured',
        detail: 'Encryption is not configured.',
      };
    }
    try {
      const db = await ensureSchema();
      await db.query('select 1');
      return base;
    } catch (err) {
      const storeErr = mapError(err);
      return {
        ...base,
        state: storeErr.code as MemoryStoreState,
        detail: storeErr.message,
      };
    }
  }
}

export const supabaseMemoryStore = new SupabaseMemoryStore();
