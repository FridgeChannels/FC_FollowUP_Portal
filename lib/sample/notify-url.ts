import { pathnameForSn } from "./paths.ts";

const DEFAULT_ORIGIN = "https://tap.fridgechannels.com";

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = (value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Sample tap notice URL.
 * `SAMPLE_TAP_BASE_URL` wins; otherwise the magnet `url` column; otherwise the
 * historical tap.fridgechannels.com path.
 */
export function sampleNotifyUrl(input: {
  sn: string;
  envBaseUrl?: string | null;
  databaseUrl?: string | null;
}) {
  const base = normalizeOrigin(input.envBaseUrl);
  if (base) return `${base}${pathnameForSn(input.sn)}`;
  const fromDb = (input.databaseUrl || "").trim();
  if (fromDb) return fromDb;
  return `${DEFAULT_ORIGIN}${pathnameForSn(input.sn)}`;
}
