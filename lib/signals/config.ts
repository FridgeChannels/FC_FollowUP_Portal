import { env } from "cloudflare:workers";
/** Default to reading only until state writes are explicitly enabled for deployment. */
export function signalsWritesEnabled() {
  const value =
    (env as Record<string, string | undefined>).SIGNALS_REVIEW_WRITES_ENABLED ||
    (typeof process !== "undefined"
      ? process.env.SIGNALS_REVIEW_WRITES_ENABLED
      : undefined);
  return value === "true";
}
