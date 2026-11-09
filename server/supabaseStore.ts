/**
 * Supabase persistence layer.
 *
 * All app state (conversations, settings, memories, connected accounts) is stored
 * as JSON documents inside the user's Supabase project. Two interchangeable
 * backends are supported and detected automatically:
 *
 *  - table:   the single `nexus_store` table (preferred, queryable in SQL)
 *  - storage: a private `nexus-store` bucket, used when the table does not exist
 *             so persistence works with nothing but the project URL + service key
 *
 * A local JSON cache is still written on disk and is used whenever Supabase is
 * not configured (or unreachable), so the app remains usable offline.
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
const BUCKET = 'nexus-store';
const REQUEST_TIMEOUT_MS = 12_000;

export type SupabaseEngine = 'table' | 'storage' | 'none';

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
  engine: SupabaseEngine;
  error?: string;
}

let statusCache: { at: number; value: SupabaseStatus } | null = null;
let engineCache: { at: number; value: SupabaseEngine } | null = null;
let lastProbeError: string | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(baseUrl && apiKey);
}

function withTimeout(init: RequestInit): { init: RequestInit; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { init: { ...init, signal: controller.signal }, done: () => clearTimeout(timer) };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const { init: guarded, done } = withTimeout({
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string> | undefined) || {}),
    },
  });
  try {
    return await fetch(`${baseUrl}/rest/v1/${path}`, guarded);
  } finally {
    done();
  }
}

/** Storage API call; `json: false` omits Content-Type (required for DELETE). */
async function storageRequest(path: string, init: RequestInit = {}, json = true): Promise<Response> {
  const { init: guarded, done } = withTimeout({
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...((init.headers as Record<string, string> | undefined) || {}),
    },
  });
  try {
    return await fetch(`${baseUrl}/storage/v1/${path}`, guarded);
  } finally {
    done();
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

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** `kind/id.json` inside the bucket — mirrors the table's (kind, id) pair. */
function docPath(kind: string, id: string): string {
  return `${safeSegment(kind)}/${encodeURIComponent(id)}.json`;
}

/** Creates the private bucket on first use; returns true when it is reachable. */
async function ensureBucket(): Promise<boolean> {
  const probe = () =>
    storageRequest(`object/list/${BUCKET}`, {
      method: 'POST',
      body: JSON.stringify({ prefix: '', limit: 1, offset: 0 }),
    });

  const first = await probe().catch(() => null);
  if (first?.ok) return true;

  const created = await storageRequest('bucket', {
    method: 'POST',
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: null,
      allowed_mime_types: null,
    }),
  }).catch(() => null);
  if (!created || (!created.ok && created.status !== 409)) return false;

  const retry = await probe().catch(() => null);
  return Boolean(retry?.ok);
}

/** Picks the backend once and caches it; `force` re-probes immediately. */
async function resolveEngine(force = false): Promise<SupabaseEngine> {
  if (!isSupabaseConfigured()) return 'none';
  if (!force && engineCache && Date.now() - engineCache.at < 30_000) return engineCache.value;

  let value: SupabaseEngine = 'none';
  lastProbeError = undefined;

  try {
    const res = await request(`${TABLE}?select=id&limit=1`);
    if (res.ok) {
      value = 'table';
    } else {
      const body = await res.text().catch(() => '');
      lastProbeError = readError(body, `Supabase responded ${res.status}`);
    }
  } catch (err) {
    lastProbeError = err instanceof Error ? err.message : 'Supabase is unreachable.';
  }

  if (value === 'none' && (await ensureBucket().catch(() => false))) {
    value = 'storage';
    lastProbeError = undefined;
  }

  engineCache = { at: Date.now(), value };
  return value;
}

/** Verifies the credentials and that a persistence backend is usable. */
export async function getSupabaseStatus(force = false): Promise<SupabaseStatus> {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      reachable: false,
      schemaReady: false,
      table: TABLE,
      engine: 'none',
      error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.',
    };
  }

  if (!force && statusCache && Date.now() - statusCache.at < 30_000) {
    return statusCache.value;
  }

  const engine = await resolveEngine(force);
  const value: SupabaseStatus =
    engine === 'none'
      ? {
          configured: true,
          reachable: false,
          schemaReady: false,
          table: TABLE,
          engine,
          error: lastProbeError || 'Supabase storage is unreachable.',
        }
      : {
          configured: true,
          reachable: true,
          schemaReady: true,
          table: engine === 'table' ? TABLE : BUCKET,
          engine,
        };

  statusCache = { at: Date.now(), value };
  return value;
}

async function listStorageDocs<T>(kind: string): Promise<StoreDoc<T>[]> {
  const prefix = `${safeSegment(kind)}/`;
  const res = await storageRequest(`object/list/${BUCKET}`, {
    method: 'POST',
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readError(body, `Supabase Storage list failed (${res.status}).`));
  }

  const objects = (await res.json().catch(() => [])) as { name?: string }[];
  const files = (Array.isArray(objects) ? objects : []).filter(
    (item) => typeof item?.name === 'string' && item.name.endsWith('.json')
  );

  const docs = await Promise.all(
    files.map(async (item) => {
      const name = String(item.name);
      const objectRes = await storageRequest(`object/${BUCKET}/${prefix}${name}`, {}, false);
      if (!objectRes.ok) return null;
      const data = (await objectRes.json().catch(() => null)) as T | null;
      if (!data) return null;
      return { id: decodeURIComponent(name.replace(/\.json$/, '')), kind, data } as StoreDoc<T>;
    })
  );

  return docs.filter((doc): doc is StoreDoc<T> => Boolean(doc));
}

export async function listDocRecords<T>(kind: string): Promise<StoreDoc<T>[]> {
  if (!isSupabaseConfigured()) return [];

  if ((await resolveEngine()) === 'storage') {
    return listStorageDocs<T>(kind);
  }

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

  if ((await resolveEngine()) === 'storage') {
    const res = await storageRequest(`object/${BUCKET}/${docPath(kind, id)}`, {
      method: 'POST',
      headers: { 'x-upsert': 'true' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(readError(body, `Supabase Storage write failed (${res.status}).`));
    }
    return;
  }

  const res = await request(`${TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id, kind, data, updated_at: new Date().toISOString() }]),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(readError(body, `Supabase write failed (${res.status}).`));
  }
}

export async function deleteDoc(kind: string, id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  if ((await resolveEngine()) === 'storage') {
    const res = await storageRequest(`object/${BUCKET}/${docPath(kind, id)}`, { method: 'DELETE' }, false);
    // A missing object already means the document is gone.
    if (!res.ok && res.status !== 400 && res.status !== 404) {
      const body = await res.text().catch(() => '');
      throw new Error(readError(body, `Supabase Storage delete failed (${res.status}).`));
    }
    return;
  }

  const res = await request(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  deleteDoc(kind, id).catch((err) => {
    console.error(`[persistence] failed to delete ${kind}/${id}:`, err instanceof Error ? err.message : err);
  });
}

/** Shown in Connections while the table backend is unavailable. */
export const SUPABASE_SETUP_SQL = `create table if not exists public.nexus_store (
  id text primary key,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists nexus_store_kind_idx on public.nexus_store (kind);

alter table public.nexus_store enable row level security;`;
