import { getSupabaseServiceRoleKey, getSupabaseUrl, isSupabaseConfigured } from "./config.ts";

export class SupabaseError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.body = body;
  }
}

function requireConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
}

type QueryOptions = {
  select?: string;
  filters?: Record<string, string>;
  order?: string;
  limit?: number;
  offset?: number;
  prefer?: string;
};

function buildUrl(table: string, options: QueryOptions = {}) {
  const url = new URL(`${getSupabaseUrl()}/rest/v1/${table}`);
  url.searchParams.set("select", options.select || "*");
  for (const [key, value] of Object.entries(options.filters || {})) {
    url.searchParams.set(key, value);
  }
  if (options.order) url.searchParams.set("order", options.order);
  if (options.offset != null) url.searchParams.set("offset", String(options.offset));
  if (options.limit != null) url.searchParams.set("limit", String(options.limit));
  return url;
}

function authHeaders(prefer?: string): HeadersInit {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export async function supabaseSelect<T>(table: string, options: QueryOptions = {}): Promise<T[]> {
  requireConfigured();
  const response = await fetch(buildUrl(table, options), {
    method: "GET",
    headers: authHeaders(options.prefer),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseError(`Supabase select ${table} failed`, response.status, body);
  }
  return body ? (JSON.parse(body) as T[]) : [];
}

export async function supabaseUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
): Promise<T[]> {
  requireConfigured();
  if (!rows.length) return [];
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: authHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(rows),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseError(`Supabase upsert ${table} failed`, response.status, body);
  }
  return body ? (JSON.parse(body) as T[]) : [];
}

export async function supabaseInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options?: { ignoreDuplicates?: boolean; onConflict?: string },
): Promise<T[]> {
  requireConfigured();
  if (!rows.length) return [];
  const prefer = options?.ignoreDuplicates
    ? "resolution=ignore-duplicates,return=representation"
    : "return=representation";
  const onConflict = options?.onConflict
    ? `?on_conflict=${encodeURIComponent(options.onConflict)}`
    : "";
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${table}${onConflict}`, {
    method: "POST",
    headers: authHeaders(prefer),
    body: JSON.stringify(rows),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseError(`Supabase insert ${table} failed`, response.status, body);
  }
  return body ? (JSON.parse(body) as T[]) : [];
}

export async function supabasePatch<T extends Record<string, unknown>>(
  table: string,
  patch: T,
  filters: Record<string, string>,
): Promise<T[]> {
  requireConfigured();
  const url = buildUrl(table, { select: "*", filters });
  const response = await fetch(url, {
    method: "PATCH",
    headers: authHeaders("return=representation"),
    body: JSON.stringify(patch),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseError(`Supabase patch ${table} failed`, response.status, body);
  }
  return body ? (JSON.parse(body) as T[]) : [];
}

export async function supabaseDelete<T extends Record<string, unknown> = Record<string, unknown>>(
  table: string,
  filters: Record<string, string>,
): Promise<T[]> {
  requireConfigured();
  const url = buildUrl(table, { select: "*", filters });
  const response = await fetch(url, {
    method: "DELETE",
    headers: authHeaders("return=representation"),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new SupabaseError(`Supabase delete ${table} failed`, response.status, body);
  }
  return body ? (JSON.parse(body) as T[]) : [];
}
