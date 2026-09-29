export type MagnetExperience = "dtc" | "asin_plus";
export type SampleChannelType = "DTC" | "Amazon";

export function pathnameForSn(sn: string) {
  return `/p/${sn.trim()}`;
}

export function normalizeMagnetExperience(
  value: string | null | undefined,
): MagnetExperience | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "dtc") return "dtc";
  if (normalized === "asin_plus" || normalized === "amazon") return "asin_plus";
  return null;
}

export function experienceToSampleType(
  experience: string | null | undefined,
): SampleChannelType | null {
  const normalized = normalizeMagnetExperience(experience);
  if (normalized === "dtc") return "DTC";
  if (normalized === "asin_plus") return "Amazon";
  return null;
}

export function sampleTypeToExperience(
  sampleType: SampleChannelType | null | undefined,
): MagnetExperience | null {
  if (sampleType === "DTC") return "dtc";
  if (sampleType === "Amazon") return "asin_plus";
  return null;
}

/** Normalize PostHog referrer tokens like `$direct` for UI display. */
export function formatReferrer(referrer: string | null | undefined) {
  const value = (referrer || "").trim();
  if (!value) return "Direct";
  if (/^\$?direct$/i.test(value)) return "Direct";
  return value;
}

export function dedupeBucket(occurredAt: string, windowMinutes: number) {
  const ms = Date.parse(occurredAt);
  if (!Number.isFinite(ms) || windowMinutes <= 0) return "0";
  return String(Math.floor(ms / (windowMinutes * 60_000)));
}

export function buildSampleVisitDedupeKey(input: {
  sn: string;
  deviceId: string | null;
  occurredAt: string;
  windowMinutes: number;
}) {
  const device = (input.deviceId || "unknown").trim() || "unknown";
  const bucket = dedupeBucket(input.occurredAt, input.windowMinutes);
  return `sample.visited:${input.sn}:${device}:${bucket}`;
}

/** Inverse of `buildSampleVisitDedupeKey` — extracts device id from the dedupe key. */
export function deviceIdFromSampleDedupeKey(dedupeKey: string): string | null {
  const key = (dedupeKey || "").trim();
  const prefix = "sample.visited:";
  if (!key.startsWith(prefix)) return null;
  // remainder: `{sn}:{deviceId}:{bucket}` — deviceId may contain ":" in theory
  const parts = key.slice(prefix.length).split(":");
  if (parts.length < 3) return null;
  const device = parts.slice(1, -1).join(":").trim();
  return device || null;
}
