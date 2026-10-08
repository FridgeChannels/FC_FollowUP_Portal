import { env } from "cloudflare:workers";

type SampleEnvName =
  | "SAMPLE_SYNC_SECRET"
  | "SAMPLE_SYNC_MAX_SNS_PER_RUN"
  | "SAMPLE_SYNC_LIMIT_PER_SN"
  | "SAMPLE_NOTIFY_DEDUPE_MINUTES"
  | "SAMPLE_PAGE_SYNC_STALE_MINUTES"
  | "SAMPLE_TAP_BASE_URL";

function raw(name: SampleEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

function asPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value || "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getSampleSyncSecret() {
  return raw("SAMPLE_SYNC_SECRET") || "";
}

export function getSampleSyncMaxSnsPerRun() {
  return asPositiveInt(raw("SAMPLE_SYNC_MAX_SNS_PER_RUN"), 50);
}

export function getSampleSyncLimitPerSn() {
  return asPositiveInt(raw("SAMPLE_SYNC_LIMIT_PER_SN"), 500);
}

export function getSampleNotifyDedupeMinutes() {
  return asPositiveInt(raw("SAMPLE_NOTIFY_DEDUPE_MINUTES"), 30);
}

/**
 * How long after last PostHog sync before opening Sample page may schedule a
 * background refresh. Default 6h — webhook + cron should keep data fresh.
 * Set SAMPLE_PAGE_SYNC_STALE_MINUTES=0 to disable page-triggered sync.
 */
export function getSamplePageSyncStaleMinutes() {
  const rawValue = raw("SAMPLE_PAGE_SYNC_STALE_MINUTES");
  if (rawValue === "0") return 0;
  return asPositiveInt(rawValue, 360);
}

export function isSamplePageSyncEnabled() {
  return getSamplePageSyncStaleMinutes() > 0;
}

/** Origin for Sample tap notice URLs, e.g. https://tap.example.com. Empty → use magnet.url. */
export function getSampleTapBaseUrl() {
  return (raw("SAMPLE_TAP_BASE_URL") || "").replace(/\/+$/, "");
}
