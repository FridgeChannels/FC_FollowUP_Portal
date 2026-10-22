import {
  supabaseDelete,
  supabasePatch,
  supabaseSelect,
  supabaseUpsert,
} from "../supabase/client.ts";
import { isSupabaseConfigured } from "../supabase/config.ts";

export type SampleInternalDevice = {
  device_id: string;
  label: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type SampleDeviceStats = {
  deviceId: string;
  tapCount: number;
  firstTapAt: string | null;
  lastTapAt: string | null;
  isInternal: boolean;
  isInactive: boolean;
  label: string | null;
  note: string | null;
  markedAt: string | null;
};

export const INTERNAL_DEVICE_CANDIDATE_MIN_TAPS = 3;
export const INTERNAL_DEVICE_INACTIVE_DAYS = 180;

export async function listInternalDeviceStats() {
  const [devices, visits] = await Promise.all([
    listAllInternalDevices(),
    listAllSampleVisits(),
  ]);
  const stats = aggregateDeviceStats(visits);
  return devices.map((device) => {
    const row = stats.get(device.device_id);
    return {
      deviceId: device.device_id,
      tapCount: row?.tapCount || 0,
      firstTapAt: row?.firstTapAt || null,
      lastTapAt: row?.lastTapAt || null,
      isInternal: true,
      isInactive: isDeviceInactive(row?.lastTapAt || null),
      label: device.label,
      note: device.note,
      markedAt: device.created_at,
    } satisfies SampleDeviceStats;
  }).sort((a, b) => (b.markedAt || "").localeCompare(a.markedAt || ""));
}

export async function listInternalDeviceCandidates() {
  const [devices, visits] = await Promise.all([
    listAllInternalDevices("device_id"),
    listAllSampleVisits(),
  ]);
  const allowlist = new Set(devices.map((device) => device.device_id));
  return [...aggregateDeviceStats(visits)]
    .filter(([deviceId, stats]) =>
      !allowlist.has(deviceId) && stats.tapCount >= INTERNAL_DEVICE_CANDIDATE_MIN_TAPS,
    )
    .map(([deviceId, stats]) => ({
      deviceId,
      tapCount: stats.tapCount,
      firstTapAt: stats.firstTapAt,
      lastTapAt: stats.lastTapAt,
      isInternal: false,
      isInactive: isDeviceInactive(stats.lastTapAt),
      label: null,
      note: null,
      markedAt: null,
    } satisfies SampleDeviceStats))
    .sort((a, b) => b.tapCount - a.tapCount || (b.lastTapAt || "").localeCompare(a.lastTapAt || ""))
    .slice(0, 100);
}

type VisitStatRow = { device_id: string | null; occurred_at: string };
async function listAllInternalDevices(select = "*") {
  const devices: SampleInternalDevice[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseSelect<SampleInternalDevice>("sample_internal_devices", {
      select,
      order: "device_id.asc",
      offset,
      limit: 1000,
    });
    devices.push(...page);
    if (page.length < 1000) return devices;
  }
}

async function listAllSampleVisits() {
  const visits: VisitStatRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseSelect<VisitStatRow>("sample_tap_visits", {
      select: "device_id,occurred_at",
      filters: { device_id: "not.is.null" },
      order: "id.asc",
      offset,
      limit: 1000,
    });
    visits.push(...page);
    if (page.length < 1000) return visits;
  }
}

function aggregateDeviceStats(visits: VisitStatRow[]) {
  const stats = new Map<string, { tapCount: number; firstTapAt: string; lastTapAt: string }>();
  for (const visit of visits) {
    const deviceId = visit.device_id?.trim();
    const timestamp = visit.occurred_at;
    if (!deviceId || !Number.isFinite(Date.parse(timestamp))) continue;
    const row = stats.get(deviceId);
    if (!row) stats.set(deviceId, { tapCount: 1, firstTapAt: timestamp, lastTapAt: timestamp });
    else {
      row.tapCount += 1;
      if (Date.parse(timestamp) < Date.parse(row.firstTapAt)) row.firstTapAt = timestamp;
      if (Date.parse(timestamp) > Date.parse(row.lastTapAt)) row.lastTapAt = timestamp;
    }
  }
  return stats;
}

function isDeviceInactive(lastTapAt: string | null) {
  return !lastTapAt || Date.now() - Date.parse(lastTapAt) > INTERNAL_DEVICE_INACTIVE_DAYS * 86_400_000;
}

const CACHE_TTL_MS = 60_000;

let cache: { at: number; ids: Set<string> } | null = null;

export function clearInternalDeviceIdCache() {
  cache = null;
}

/** Load internal PostHog `$device_id` allowlist from `sample_internal_devices`. */
export async function getInternalDeviceIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.ids;
  if (!isSupabaseConfigured()) {
    cache = { at: Date.now(), ids: new Set() };
    return cache.ids;
  }
  const ids = new Set(
    (await listAllInternalDevices("device_id"))
      .map((row) => (row.device_id || "").trim())
      .filter(Boolean),
  );
  cache = { at: Date.now(), ids };
  return ids;
}

export function isInternalDeviceId(
  deviceId: string | null | undefined,
  internalIds: Set<string>,
) {
  const id = (deviceId || "").trim();
  if (!id) return false;
  return internalIds.has(id);
}

async function setVisitsInternalFlag(deviceId: string, isInternal: boolean) {
  await supabasePatch(
    "sample_tap_visits",
    { is_internal: isInternal },
    { device_id: `eq.${deviceId}` },
  );
}

/**
 * Add device to allowlist and flip matching visit rows.
 * Uses table upsert (same path as the earlier Portal UI) so production works
 * even when the optional `set_sample_internal_device` RPC has not been applied.
 */
export async function markInternalDevice(input: {
  deviceId: string;
  label?: string | null;
  note?: string | null;
}): Promise<SampleInternalDevice> {
  const deviceId = input.deviceId.trim();
  if (!deviceId || deviceId.length > 256) {
    throw new Error("deviceId must be 1–256 characters");
  }
  const rows = await supabaseUpsert<Record<string, unknown>>(
    "sample_internal_devices",
    [
      {
        device_id: deviceId,
        label: input.label?.trim() || null,
        note: input.note?.trim() || null,
        updated_at: new Date().toISOString(),
      },
    ],
    "device_id",
  );
  clearInternalDeviceIdCache();
  await setVisitsInternalFlag(deviceId, true);
  return rows[0] as SampleInternalDevice;
}

/** Remove device from allowlist and clear matching visit flags. */
export async function unmarkInternalDevice(deviceId: string): Promise<void> {
  const id = deviceId.trim();
  if (!id || id.length > 256) {
    throw new Error("deviceId must be 1–256 characters");
  }
  await supabaseDelete("sample_internal_devices", { device_id: `eq.${id}` });
  clearInternalDeviceIdCache();
  await setVisitsInternalFlag(id, false);
}
