/**
 * Supabase persistence layer.
 *
 * All app state (conversations, settings, memories, connected accounts) is stored
 * in a single JSON document table so the project needs only one small schema.
 * A local JSON cache is still written on disk and is used whenever Supabase is
 * not configured, so the app remains usable offline.
 */

const rawUrl = process.env.SUPABASE_URL?.trim() || '';
const apiKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

const baseUrl = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const TABLE = 'nexus_store';
const REQUEST_TIMEOUT_MS = 12_000;

export interface StoreDoc<T = unknown> {
  id: string;
  kind: string;
  data: T;
  updated_at?: string;
}

export interface SupabaseStatus {
  configured: boolean;
  reachable: boolean;
  schemaReady: boolean;
  table: string;
  error?: string;
}

let statusCache: { at: number; value: SupabaseStatus } | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(baseUrl && apiKey);
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...((init.headers as Record<string, string> | undefined) || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function readError(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.message || parsed?.error_description || parsed?.error || fallback;
  } catch {
    return body ? body.slice(0, 240) : fallback;
  }
}

/** Verifies credentials and that the `nexus_store` table exists. */
export async function getSupabaseStatus(force = false): Promise<SupabaseStatus> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      table: TABLE,
      error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.',
    };
  }

  if (!force && statusCache && Date.now() - statusCache.at < 30_000) {
    return statusCache.value;
  }

  let value: SupabaseStatus;
  try {
    const res = await request(`${TABLE}?select=id&limit=1`);
    if (res.ok) {
      value = { configured: true, reachable: true, schemaReady: true, table: TABLE };
    } else {
      const body = await res.text().catch(() => '');
      const missingTable =
        res.status === 404 || /42P01|PGRST205|PGRST204|does not exist|schema cache/i.test(body);
      value = {
        configured: true,
        reachable: true,
        schemaReady: false,
        table: TABLE,
        error: missingTable
          ? `Table "${TABLE}" is missing in Supabase.`
          : readError(body, `Supabase responded ${res.status}`),
      };
    }
  } catch (err) {
    value = {
      configured: true,
      reachable: false,
      schemaReady: false,
      table: TABLE,
      error: err instanceof Error ? err.message : 'Supabase is unreachable.',
    };
  }

  statusCache = { at: Date.now(), value };
  return value;
}

export async function listDocRecords<T>(kind: string): Promise<StoreDoc<T>[]> {
  if (!isSupabaseConfigured()) return [];
  const res = await request(
    `${TABLE}?kind=eq.${encodeURIComponent(kind)}&select=id,kind,data&order=updated_at.asc`
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readError(body, `Supabase read failed (${res.status}).`));
  }
  const rows = (await res.json()) as StoreDoc<T>[];
  return Array.isArray(rows) ? rows : [];
}

export async function listDocs<T>(kind: string): Promise<T[]> {
  const rows = await listDocRecords<T>(kind);
  return rows.map((row) => row.data);
}

export async function upsertDoc<T>(kind: string, id: string, data: T): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const res = await request(`${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([
      { id, kind, data, updated_at: new Date().toISOString() },
    ]),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readError(body, `Supabase write failed (${res.status}).`));
  }
}

export async function deleteDoc(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const res = await request(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readError(body, `Supabase delete failed (${res.status}).`));
  }
}

/** Fire-and-forget mirror write: local cache stays authoritative for the request. */
export function syncDoc<T>(kind: string, id: string, data: T): void {
  if (!isSupabaseConfigured()) return;
  upsertDoc(kind, id, data).catch((err) => {
    console.error(`[persistence] failed to sync ${kind}/${id}:`, err instanceof Error ? err.message : err);
  });
}

export function unsyncDoc(kind: string, id: string): void {
  if (!isSupabaseConfigured()) return;
  deleteDoc(id).catch((err) => {
    console.error(`[persistence] failed to delete ${kind}/${id}:`, err instanceof Error ? err.message : err);
  });
}

export const SUPABASE_SETUP_SQL = `create table if not exists public.nexus_store (
  id text primary key,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists nexus_store_kind_idx on public.nexus_store (kind);

alter table public.nexus_store enable row level security;`;
