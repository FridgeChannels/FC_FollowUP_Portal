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
  const rows = await supabaseSelect<{ device_id: string }>("sample_internal_devices", {
    select: "device_id",
    limit: 5000,
  });
  const ids = new Set(
    rows
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

/** Add device to allowlist and flip matching visit rows. */
export async function markInternalDevice(input: {
  deviceId: string;
  label?: string | null;
  note?: string | null;
}): Promise<SampleInternalDevice> {
  const deviceId = input.deviceId.trim();
  if (!deviceId) throw new Error("deviceId is required");
  const now = new Date().toISOString();
  const rows = await supabaseUpsert<Record<string, unknown>>(
    "sample_internal_devices",
    [
      {
        device_id: deviceId,
        label: input.label?.trim() || null,
        note: input.note?.trim() || null,
        updated_at: now,
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
  if (!id) throw new Error("deviceId is required");
  await supabaseDelete("sample_internal_devices", { device_id: `eq.${id}` });
  clearInternalDeviceIdCache();
  await setVisitsInternalFlag(id, false);
}
