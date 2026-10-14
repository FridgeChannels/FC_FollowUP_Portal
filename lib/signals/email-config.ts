import { env } from "cloudflare:workers";

type EmailTrackEnvName =
  | "EMAIL_TRACK_SECRET"
  | "REPLY_INGEST_TOKEN"
  | "EMAIL_OPEN_DEDUPE_MINUTES";

function raw(name: EmailTrackEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

/**
 * HMAC key for open-tracking tokens. Falls back to the existing ingest token so
 * the pixel works in every environment that can already receive ingest — a
 * dedicated secret only changes which key signs the token, not its shape.
 */
export function getEmailTrackSecret() {
  return raw("EMAIL_TRACK_SECRET") || raw("REPLY_INGEST_TOKEN") || "";
}

/**
 * Collapses the burst of pixel fetches one open can produce (image proxies,
 * client retries) into a single raw open row. It does not affect whether a
 * signal lights up: the classifier groups every open of a message into one
 * signal regardless.
 */
export function getEmailOpenDedupeMinutes() {
  const parsed = Number(raw("EMAIL_OPEN_DEDUPE_MINUTES") || "");
  if (!Number.isFinite(parsed) || parsed <= 0) return 30;
  return Math.floor(parsed);
}
