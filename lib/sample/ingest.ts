import { isSupabaseConfigured } from "../supabase/config.ts";
import { getExperienceBySn, getMagnetBySn, pathnameForSn } from "./magnet.ts";
import { notifySampleVisits } from "./notify-visits.ts";
import { resolveBrandIdBySn, resolveBrandSampleLink } from "./resolve.ts";
import { getInternalDeviceIds, isInternalDeviceId } from "./internal-devices.ts";
import { upsertVisits, type SampleVisitRow } from "./visits.ts";

export type SampleTapIngestEvent = {
  /** Required. PostHog event uuid (idempotency key). */
  posthogEventUuid: string;
  /** Required. ISO timestamp. */
  occurredAt: string;
  deviceId?: string | null;
  distinctId?: string | null;
  pathname?: string | null;
  url?: string | null;
  geoCity?: string | null;
  geoCountry?: string | null;
  browser?: string | null;
  os?: string | null;
  referrer?: string | null;
};

export type SampleTapIngestRequest = {
  /** Required. Magnet / NFC SN (path suffix of /p/{SN}). */
  sn: string;
  /** Optional Follow-up Client id. Resolved from ClientDB NFC Card SN when omitted. */
  brandId?: string | null;
  events: SampleTapIngestEvent[];
};

export type SampleTapIngestResult = {
  sn: string;
  brandId: string | null;
  received: number;
  upserted: number;
  notified: number;
  experience: string | null;
  error?: string;
};

function normalizeEvent(event: SampleTapIngestEvent): SampleTapIngestEvent | null {
  const posthogEventUuid = (event.posthogEventUuid || "").trim();
  const occurredAt = (event.occurredAt || "").trim();
  if (!posthogEventUuid || !occurredAt) return null;
  if (!Number.isFinite(Date.parse(occurredAt))) return null;
  return {
    ...event,
    posthogEventUuid,
    occurredAt,
  };
}

export async function ingestSampleTapEvents(
  input: SampleTapIngestRequest,
): Promise<SampleTapIngestResult> {
  const sn = (input.sn || "").trim();
  const result: SampleTapIngestResult = {
    sn,
    brandId: input.brandId?.trim() || null,
    received: 0,
    upserted: 0,
    notified: 0,
    experience: null,
  };

  if (!sn) {
    result.error = "sn is required";
    return result;
  }
  if (!isSupabaseConfigured()) {
    result.error = "Supabase is not configured";
    return result;
  }

  const events = (input.events || []).map(normalizeEvent).filter((item): item is SampleTapIngestEvent => !!item);
  result.received = events.length;
  if (!events.length) {
    result.error = "events must include at least one valid item (posthogEventUuid + occurredAt)";
    return result;
  }

  if (!result.brandId) {
    result.brandId = await resolveBrandIdBySn(sn);
  }

  let brandName: string | null = null;
  let ownerId: string | null = null;
  let ownerName: string | null = null;
  let sampleUrl: string | null = null;
  if (result.brandId) {
    try {
      const link = await resolveBrandSampleLink(result.brandId);
      brandName = link.brandName;
      ownerId = link.ownerId;
    } catch {
      // brand metadata optional for ingest
    }
  }
  {
    const magnet = await getMagnetBySn(sn);
    sampleUrl = magnet?.url || `https://tap.fridgechannels.com${pathnameForSn(sn)}`;
  }

  const experience = await getExperienceBySn(sn);
  result.experience = experience;
  const internalDeviceIds = await getInternalDeviceIds();

  const rows: SampleVisitRow[] = events.map((event) => ({
    sn,
    brand_id: result.brandId,
    posthog_event_uuid: event.posthogEventUuid,
    occurred_at: event.occurredAt,
    device_id: event.deviceId?.trim() || null,
    distinct_id: event.distinctId?.trim() || null,
    pathname: event.pathname?.trim() || pathnameForSn(sn),
    url: event.url?.trim() || sampleUrl,
    geo_city: event.geoCity?.trim() || null,
    geo_country: event.geoCountry?.trim() || null,
    browser: event.browser?.trim() || null,
    os: event.os?.trim() || null,
    referrer: event.referrer?.trim() || null,
    is_internal: isInternalDeviceId(event.deviceId, internalDeviceIds),
    experience,
    synced_at: new Date().toISOString(),
  }));

  const upserted = await upsertVisits(rows);
  result.upserted = upserted.length;
  try {
    result.notified = await notifySampleVisits({
      sn,
      brandId: result.brandId,
      brandName,
      ownerId,
      ownerName,
      sampleUrl,
      visits: upserted,
    });
  } catch (error) {
    // Visits are already persisted (idempotent on posthog_event_uuid). Do not
    // fail the whole ingest when in-app/Slack notify misbehaves — third-party
    // syncers treat non-2xx as retry forever.
    const message = error instanceof Error ? error.message : String(error);
    result.error = message;
    result.notified = 0;
  }

  return result;
}
