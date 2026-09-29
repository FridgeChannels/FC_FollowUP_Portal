import { supabaseInsert, supabasePatch, supabaseSelect } from "../supabase/client.ts";
import { isInternalDeviceId } from "./internal-devices.ts";
import { getSampleNotifyDedupeMinutes } from "./config.ts";
import {
  buildSampleVisitDedupeKey as buildDedupeKey,
  deviceIdFromSampleDedupeKey,
} from "./paths.ts";

export type SystemNotification = {
  id: string;
  type: string;
  brand_id: string;
  owner_id: string | null;
  title: string;
  body: string | null;
  deep_link: string | null;
  dedupe_key: string;
  read_at: string | null;
  created_at: string;
};

export function buildSampleVisitDedupeKey(input: {
  sn: string;
  deviceId: string | null;
  occurredAt: string;
}) {
  return buildDedupeKey({
    ...input,
    windowMinutes: getSampleNotifyDedupeMinutes(),
  });
}

export { deviceIdFromSampleDedupeKey };

export async function insertSystemNotification(input: {
  type: string;
  brandId: string;
  ownerId?: string | null;
  title: string;
  body?: string | null;
  deepLink?: string | null;
  dedupeKey: string;
}): Promise<SystemNotification | null> {
  const rows = await supabaseInsert<Record<string, unknown>>(
    "system_notifications",
    [
      {
        type: input.type,
        brand_id: input.brandId,
        owner_id: input.ownerId ?? null,
        title: input.title,
        body: input.body ?? null,
        deep_link: input.deepLink ?? null,
        dedupe_key: input.dedupeKey,
      },
    ],
    // Prefer: resolution=ignore-duplicates requires on_conflict, otherwise
    // unique(dedupe_key) collisions become hard 409 and blow up the ingest.
    { ignoreDuplicates: true, onConflict: "dedupe_key" },
  );
  return (rows[0] as SystemNotification | undefined) || null;
}

export async function listUnreadSampleNotifications(brandId: string, limit = 20) {
  return supabaseSelect<SystemNotification>("system_notifications", {
    select: "*",
    filters: {
      brand_id: `eq.${brandId}`,
      type: "eq.sample.visited",
      read_at: "is.null",
    },
    order: "created_at.desc",
    limit,
  });
}

export async function countUnreadSampleNotifications(
  brandId: string,
  internalDeviceIds?: Set<string>,
) {
  const rows = await listUnreadSampleNotifications(brandId, 100);
  if (!internalDeviceIds || internalDeviceIds.size === 0) {
    return rows.length;
  }
  return rows.filter((row) => {
    const deviceId = deviceIdFromSampleDedupeKey(row.dedupe_key);
    return !isInternalDeviceId(deviceId, internalDeviceIds);
  }).length;
}

/** Mark unread sample.visited rows as reviewed (clears the Sample page banner). */
export async function markSampleNotificationsRead(brandId: string): Promise<number> {
  const id = (brandId || "").trim();
  if (!id) return 0;
  const rows = await supabasePatch<SystemNotification>(
    "system_notifications",
    { read_at: new Date().toISOString() },
    {
      brand_id: `eq.${id}`,
      type: "eq.sample.visited",
      read_at: "is.null",
    },
  );
  return rows.length;
}

/** When a device is marked internal, clear its unread sample notifications. */
export async function markSampleNotificationsReadForDevice(
  brandId: string,
  deviceId: string,
): Promise<number> {
  const brand = (brandId || "").trim();
  const device = (deviceId || "").trim();
  if (!brand || !device) return 0;
  const unread = await listUnreadSampleNotifications(brand, 100);
  const targets = unread.filter(
    (row) => deviceIdFromSampleDedupeKey(row.dedupe_key) === device,
  );
  if (!targets.length) return 0;
  const now = new Date().toISOString();
  let marked = 0;
  for (const row of targets) {
    await supabasePatch(
      "system_notifications",
      { read_at: now },
      { id: `eq.${row.id}` },
    );
    marked += 1;
  }
  return marked;
}
