import { supabaseSelect, supabaseUpsert } from "../supabase/client";
import type { SampleTapVisit } from "../sample/visits";
import type { SystemNotification } from "../sample/notifications";
import { getInternalDeviceIds } from "../sample/internal-devices";
import { signalsWritesEnabled, isSignalsDevMode } from "./config";
import { notificationSignal } from "./events";
import {
  aggregateBrand,
  safeSourceUrl,
  type SignalEvent,
  type SignalReview,
} from "./model";

// Reuse the existing notification store for small review snapshots; raw visits remain untouched.
export async function allRows<T>(
  table: string,
  filters: Record<string, string>,
  order: string,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await supabaseSelect<T>(table, {
      filters,
      order,
      offset,
      limit: 500,
    });
    result.push(...rows);
    if (rows.length < 500) return result;
  }
}
function jsonBody<T>(body: string | null, fallback: T): T {
  try {
    const parsed = body ? JSON.parse(body) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as T)
      : fallback;
  } catch {
    return fallback;
  }
}
export async function loadSignalEvents(brandId?: string) {
  const scope: Record<string, string> = brandId
    ? { brand_id: `eq.${brandId}` }
    : {};
  const [visits, notifications, internal] = await Promise.all([
    allRows<SampleTapVisit>(
      "sample_tap_visits",
      {
        ...scope,
        is_internal: "eq.false",
        brand_id: brandId ? `eq.${brandId}` : "not.is.null",
      },
      "id.asc",
    ),
    allRows<SystemNotification>(
      "system_notifications",
      {
        ...scope,
        type: "in.(email.opened,linkedin.updated,signals.read,signals.brand_read,signals.review)",
      },
      "id.asc",
    ),
    getInternalDeviceIds(),
  ]);
  const events: SignalEvent[] = visits
    .filter((v) => !v.device_id || !internal.has(v.device_id))
    .map((v) => ({
      id: `sample:${v.posthog_event_uuid}`,
      brandId: v.brand_id!,
      sampleId: v.sn,
      sampleDeviceId: v.device_id || undefined,
      tapLocation:
        [v.geo_city, v.geo_country].filter(Boolean).join(", ") || undefined,
      tapDevice: [v.browser, v.os].filter(Boolean).join(" · ") || undefined,
      type: "sample",
      summary: `Sample ${v.sn} visited`,
      occurredAt: v.occurred_at,
      detectedAt: v.synced_at,
      sourceUrl: safeSourceUrl(v.url),
      evidence:
        [v.geo_city, v.geo_country, v.browser, v.os]
          .filter(Boolean)
          .join(" · ") || "Anonymous visit",
      highPriority: false,
    }));
  for (const row of notifications) {
    const event = notificationSignal(row);
    if (event) events.push(event);
  }
  return { events, notifications };
}
export function aggregateSignals(
  brand: {
    id: string;
    name: string;
    ownerName: string | null;
    currentCp: string;
  },
  events: SignalEvent[],
  notifications: SystemNotification[],
  viewerId?: string | null,
) {
  const read = notifications.find(
    (n) => n.brand_id === brand.id && n.type === "signals.read" && n.owner_id === (viewerId || null),
  );
  const brandRead = notifications.find(
    (n) => n.brand_id === brand.id && n.type === "signals.brand_read" && n.owner_id === (viewerId || null),
  );
  const review = notifications.find(
    (n) => n.brand_id === brand.id && n.type === "signals.review",
  );
  const readBody = jsonBody<{ eventIds?: unknown }>(read?.body || null, {});
  const brandReadBody = brandRead
    ? jsonBody<{ eventIds?: unknown }>(brandRead.body || null, {})
    : null;
  const reviewBody = jsonBody<SignalReview | undefined>(
    review?.body || null,
    undefined,
  );
  return aggregateBrand({
    ...brand,
    events: events
      .filter((e) => e.brandId === brand.id)
      .map((event) => event.type === "sample" ? {
        ...event,
        tapBrandName: brand.name,
        tapOwnerName: brand.ownerName || undefined,
      } : event),
    readIds: Array.isArray(readBody.eventIds) ? readBody.eventIds : [],
    brandReadIds: brandReadBody && Array.isArray(brandReadBody.eventIds)
      ? brandReadBody.eventIds
      : undefined,
    review:
      reviewBody && Array.isArray(reviewBody.eventIds) ? reviewBody : undefined,
  }, { devMode: isSignalsDevMode() });
}
export async function saveSignalSnapshot(
  brandId: string,
  ownerId: string | null,
  eventIds: string[],
  kind: "review",
  review?: Omit<SignalReview, "eventIds">,
) {
  if (!signalsWritesEnabled())
    throw new Error("Signals review writes are disabled");
  await supabaseUpsert(
    "system_notifications",
    [
      {
        type: `signals.${kind}`,
        brand_id: brandId,
        owner_id: ownerId,
        title: `Signals ${kind}`,
        body: JSON.stringify({ eventIds, ...review }),
        deep_link: `/signals?brand=${encodeURIComponent(brandId)}`,
        dedupe_key: `signals.${kind}:${ownerId || "unassigned"}:${brandId}`,
        read_at: new Date().toISOString(),
      },
    ],
    "dedupe_key",
  );
}

/** Persist the Signals queue read state and Brand-detail Sample Tap state separately. */
export async function saveSignalReadState(input: {
  brandId: string;
  ownerId: string | null;
  signalsEventIds?: string[];
  brandSampleEventIds?: string[];
  initializeBrandSampleEventIds?: string[];
}) {
  const rows: Array<Record<string, unknown>> = [];
  const { brandId, ownerId } = input;
  const ownerKey = ownerId || "unassigned";
  if (input.signalsEventIds) {
    rows.push({
      type: "signals.read",
      brand_id: brandId,
      owner_id: ownerId,
      title: "Signals read",
      body: JSON.stringify({ eventIds: input.signalsEventIds }),
      deep_link: `/signals?brand=${encodeURIComponent(brandId)}`,
      dedupe_key: `signals.read:${ownerKey}:${brandId}`,
      read_at: new Date().toISOString(),
    });
  }
  const brandSampleEventIds = input.brandSampleEventIds ?? input.initializeBrandSampleEventIds;
  if (brandSampleEventIds) {
    rows.push({
      type: "signals.brand_read",
      brand_id: brandId,
      owner_id: ownerId,
      title: "Brand Sample Taps read",
      body: JSON.stringify({ eventIds: brandSampleEventIds }),
      deep_link: `/customers/${encodeURIComponent(brandId)}`,
      dedupe_key: `signals.brand_read:${ownerKey}:${brandId}`,
      read_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return;
  await supabaseUpsert("system_notifications", rows, "dedupe_key");
}
