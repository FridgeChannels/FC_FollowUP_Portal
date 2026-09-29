import { supabaseInsert, supabaseSelect, supabaseUpsert } from "../supabase/client.ts";
import type { PosthogPageview } from "../posthog/query.ts";
import { isInternalDeviceId } from "./internal-devices.ts";
import type { MagnetExperience } from "./paths.ts";

export type SampleTapVisit = {
  id: string;
  sn: string;
  brand_id: string | null;
  posthog_event_uuid: string;
  occurred_at: string;
  device_id: string | null;
  distinct_id: string | null;
  pathname: string | null;
  url: string | null;
  geo_city: string | null;
  geo_country: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  is_internal: boolean;
  /** Snapshot at first sync: dtc | asin_plus */
  experience: MagnetExperience | string | null;
  synced_at: string;
};

export type SampleSyncCursor = {
  sn: string;
  brand_id: string | null;
  last_event_at: string | null;
  last_run_at: string | null;
  status: string;
  error: string | null;
};

export type SampleVisitRow = {
  sn: string;
  brand_id: string | null;
  posthog_event_uuid: string;
  occurred_at: string;
  device_id: string | null;
  distinct_id: string | null;
  pathname: string | null;
  url: string | null;
  geo_city: string | null;
  geo_country: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  is_internal: boolean;
  experience: MagnetExperience | null;
  synced_at: string;
};

export async function listVisitsForBrand(brandId: string, limit = 100): Promise<SampleTapVisit[]> {
  return supabaseSelect<SampleTapVisit>("sample_tap_visits", {
    select: "*",
    filters: { brand_id: `eq.${brandId}` },
    order: "occurred_at.desc",
    limit,
  });
}

export async function listVisitsForSn(sn: string, limit = 100): Promise<SampleTapVisit[]> {
  return supabaseSelect<SampleTapVisit>("sample_tap_visits", {
    select: "*",
    filters: { sn: `eq.${sn}` },
    order: "occurred_at.desc",
    limit,
  });
}

export async function getSyncCursor(sn: string): Promise<SampleSyncCursor | null> {
  const rows = await supabaseSelect<SampleSyncCursor>("sample_sync_cursors", {
    select: "*",
    filters: { sn: `eq.${sn}` },
    limit: 1,
  });
  return rows[0] || null;
}

export async function listStaleSyncCursors(limit: number): Promise<SampleSyncCursor[]> {
  return supabaseSelect<SampleSyncCursor>("sample_sync_cursors", {
    select: "*",
    order: "last_run_at.asc.nullsfirst",
    limit,
  });
}

export async function upsertSyncCursor(cursor: {
  sn: string;
  brand_id?: string | null;
  last_event_at?: string | null;
  last_run_at?: string | null;
  status?: string;
  error?: string | null;
}) {
  await supabaseUpsert(
    "sample_sync_cursors",
    [
      {
        sn: cursor.sn,
        brand_id: cursor.brand_id ?? null,
        last_event_at: cursor.last_event_at ?? null,
        last_run_at: cursor.last_run_at ?? null,
        status: cursor.status || "idle",
        error: cursor.error ?? null,
      },
    ],
    "sn",
  );
}

export function mapPageviewsToVisitRows(input: {
  sn: string;
  brandId: string | null;
  experience: MagnetExperience | null;
  pageviews: PosthogPageview[];
  internalDeviceIds: Set<string>;
}): SampleVisitRow[] {
  const syncedAt = new Date().toISOString();
  return input.pageviews.map((event) => ({
    sn: input.sn,
    brand_id: input.brandId,
    posthog_event_uuid: event.uuid,
    occurred_at: event.timestamp,
    device_id: event.deviceId,
    distinct_id: event.distinctId,
    pathname: event.pathname,
    url: event.url,
    geo_city: event.geoCity,
    geo_country: event.geoCountry,
    browser: event.browser,
    os: event.os,
    referrer: event.referrer,
    is_internal: isInternalDeviceId(event.deviceId, input.internalDeviceIds),
    experience: input.experience,
    synced_at: syncedAt,
  }));
}

async function listExistingEventUuids(uuids: string[]): Promise<Set<string>> {
  if (!uuids.length) return new Set();
  const chunkSize = 50;
  const found = new Set<string>();
  for (let i = 0; i < uuids.length; i += chunkSize) {
    const chunk = uuids.slice(i, i + chunkSize);
    const filter = `in.(${chunk.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
    const rows = await supabaseSelect<{ posthog_event_uuid: string }>("sample_tap_visits", {
      select: "posthog_event_uuid",
      filters: { posthog_event_uuid: filter },
      limit: chunk.length,
    });
    for (const row of rows) found.add(row.posthog_event_uuid);
  }
  return found;
}

/**
 * Insert new visits with experience snapshot.
 * On conflict, update metadata but never overwrite an existing experience.
 * Returns only newly inserted rows so callers can notify without replaying history.
 */
export async function upsertVisits(rows: SampleVisitRow[]): Promise<SampleTapVisit[]> {
  if (!rows.length) return [];
  const existing = await listExistingEventUuids(rows.map((row) => row.posthog_event_uuid));
  const toInsert = rows.filter((row) => !existing.has(row.posthog_event_uuid));
  const toUpdate = rows
    .filter((row) => existing.has(row.posthog_event_uuid))
    .map(({ experience: _experience, ...rest }) => rest);

  const inserted = toInsert.length
    ? ((await supabaseInsert<Record<string, unknown>>(
        "sample_tap_visits",
        toInsert as Array<Record<string, unknown>>,
      )) as SampleTapVisit[])
    : [];
  if (toUpdate.length) {
    await supabaseUpsert<Record<string, unknown>>(
      "sample_tap_visits",
      toUpdate as Array<Record<string, unknown>>,
      "posthog_event_uuid",
    );
  }
  return inserted;
}
