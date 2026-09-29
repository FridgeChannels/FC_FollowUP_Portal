import { env } from "cloudflare:workers";

type SupabaseEnvName = "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY";

function raw(name: SupabaseEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

const DEFAULT_SUPABASE_URL = "https://vggkiumpajbvaxiflrtu.supabase.co";

export function getSupabaseUrl() {
  return (raw("SUPABASE_URL") || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}

export function getSupabaseServiceRoleKey() {
  return raw("SUPABASE_SERVICE_ROLE_KEY") || "";
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseServiceRoleKey());
}
