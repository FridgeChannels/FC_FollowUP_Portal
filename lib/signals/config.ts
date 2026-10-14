import { env } from "cloudflare:workers";
function raw(name: string): string | undefined {
  return (
    (env as Record<string, string | undefined>)[name] ??
    (typeof process !== "undefined" ? process.env[name] : undefined)
  );
}
/** Default to reading only until state writes are explicitly enabled for deployment. */
export function signalsWritesEnabled() {
  const value = raw("SIGNALS_REVIEW_WRITES_ENABLED");
  return value === "true";
}

/**
 * Local/test mode. When on, sample-tap cooldown is disabled so every tap
 * surfaces as its own Signal — useful for developing Signals on a local dev
 * server. Production keeps the 24h-per-device cooldown.
 *
 * Enabled ONLY with an explicit `SIGNALS_DEV_MODE=true` (local `.env`).
 * We deliberately do NOT fall back to `NODE_ENV`, because a production box
 * mis-set to `development` would otherwise silently disable the cooldown.
 * `SIGNALS_DEV_MODE` is also absent from `WORKER_ENV_KEYS`, so the production
 * container can never receive it from a leaked `.env`.
 */
export function isSignalsDevMode() {
  const devFlag = raw("SIGNALS_DEV_MODE");
  return devFlag === "true" || devFlag === "1";
}
