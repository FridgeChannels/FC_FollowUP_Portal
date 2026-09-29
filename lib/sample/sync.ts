import { isPosthogConfigured } from "../posthog/config.ts";
import { queryPageviewsForPath } from "../posthog/query.ts";
import { isSupabaseConfigured } from "../supabase/config.ts";
import {
  getSamplePageSyncStaleMinutes,
  getSampleSyncLimitPerSn,
  getSampleSyncMaxSnsPerRun,
  isSamplePageSyncEnabled,
} from "./config.ts";
import { getExperienceBySn, pathnameForSn } from "./magnet.ts";
import { notifySampleVisits } from "./notify-visits.ts";
import {
  listSampleTargetsFromClientDb,
  resolveBrandSampleLink,
  type BrandSampleLink,
} from "./resolve.ts";
import { getInternalDeviceIds } from "./internal-devices.ts";
import {
  getSyncCursor,
  listStaleSyncCursors,
  mapPageviewsToVisitRows,
  upsertSyncCursor,
  upsertVisits,
} from "./visits.ts";

export type SyncSnResult = {
  sn: string;
  brandId: string | null;
  fetched: number;
  upserted: number;
  notified: number;
  error?: string;
}

export async function syncSampleVisitsForSn(input: {
  sn: string;
  brandId?: string | null;
  brandName?: string | null;
  ownerId?: string | null;
  sampleUrl?: string | null;
}): Promise<SyncSnResult> {
  const sn = input.sn.trim();
  const result: SyncSnResult = {
    sn,
    brandId: input.brandId || null,
    fetched: 0,
    upserted: 0,
    notified: 0,
  };

  if (!sn) {
    result.error = "Missing SN";
    return result;
  }
  if (!isSupabaseConfigured()) {
    result.error = "Supabase is not configured";
    return result;
  }
  if (!isPosthogConfigured()) {
    result.error = "PostHog is not configured";
    await upsertSyncCursor({
      sn,
      brand_id: result.brandId,
      last_run_at: new Date().toISOString(),
      status: "error",
      error: result.error,
    });
    return result;
  }

  let brandName = input.brandName || null;
  let ownerId = input.ownerId || null;
  let sampleUrl = input.sampleUrl || null;
  if (result.brandId && (!brandName || !ownerId || !sampleUrl)) {
    try {
      const link = await resolveBrandSampleLink(result.brandId);
      brandName = brandName || link.brandName;
      ownerId = ownerId || link.ownerId;
      sampleUrl = sampleUrl || link.sampleUrl;
    } catch {
      // keep partial metadata
    }
  }

  const cursor = await getSyncCursor(sn);
  await upsertSyncCursor({
    sn,
    brand_id: result.brandId,
    last_event_at: cursor?.last_event_at || null,
    last_run_at: new Date().toISOString(),
    status: "running",
    error: null,
  });

  try {
    const pageviews = await queryPageviewsForPath({
      pathname: pathnameForSn(sn),
      sinceIso: cursor?.last_event_at || null,
      limit: getSampleSyncLimitPerSn(),
    });
    result.fetched = pageviews.length;

    const experience = await getExperienceBySn(sn);
    const internalDeviceIds = await getInternalDeviceIds();
    const rows = mapPageviewsToVisitRows({
      sn,
      brandId: result.brandId,
      experience,
      pageviews,
      internalDeviceIds,
    });
    const upserted = await upsertVisits(rows);
    result.upserted = upserted.length;

    const maxTs = pageviews.reduce<string | null>((current, item) => {
      if (!current || item.timestamp > current) return item.timestamp;
      return current;
    }, cursor?.last_event_at || null);

    result.notified = await notifySampleVisits({
      sn,
      brandId: result.brandId,
      brandName,
      ownerId,
      sampleUrl,
      visits: upserted,
    });

    await upsertSyncCursor({
      sn,
      brand_id: result.brandId,
      last_event_at: maxTs,
      last_run_at: new Date().toISOString(),
      status: "idle",
      error: null,
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    await upsertSyncCursor({
      sn,
      brand_id: result.brandId,
      last_event_at: cursor?.last_event_at || null,
      last_run_at: new Date().toISOString(),
      status: "error",
      error: result.error,
    });
  }

  return result;
}

export async function syncSampleVisitsBatch(options?: {
  brandId?: string | null;
  maxSns?: number;
}): Promise<{ results: SyncSnResult[] }> {
  const maxSns = options?.maxSns || getSampleSyncMaxSnsPerRun();
  const results: SyncSnResult[] = [];

  if (options?.brandId) {
    const link = await resolveBrandSampleLink(options.brandId);
    if (!link.nfcCardSn) {
      return {
        results: [
          {
            sn: "",
            brandId: options.brandId,
            fetched: 0,
            upserted: 0,
            notified: 0,
            error: "Brand has no NFC Card SN",
          },
        ],
      };
    }
    results.push(
      await syncSampleVisitsForSn({
        sn: link.nfcCardSn,
        brandId: link.brandId,
        brandName: link.brandName,
        ownerId: link.ownerId,
        sampleUrl: link.sampleUrl,
      }),
    );
    return { results };
  }

  const stale = await listStaleSyncCursors(maxSns);
  const queued = new Map<string, { sn: string; brandId: string | null }>();
  for (const cursor of stale) {
    queued.set(cursor.sn, { sn: cursor.sn, brandId: cursor.brand_id });
  }

  if (queued.size < maxSns) {
    const discovered = await listSampleTargetsFromClientDb(maxSns);
    for (const item of discovered) {
      if (queued.size >= maxSns) break;
      if (!queued.has(item.sn)) queued.set(item.sn, { sn: item.sn, brandId: item.brandId });
    }
  }

  for (const item of queued.values()) {
    results.push(await syncSampleVisitsForSn({ sn: item.sn, brandId: item.brandId }));
  }
  return { results };
}

export async function planBrandSampleSync(input: {
  brandId: string;
  link?: BrandSampleLink | null;
}): Promise<{
  link: BrandSampleLink;
  shouldSync: boolean;
  reason: "no_sn" | "disabled" | "fresh" | "running" | "stale";
}> {
  const link = input.link || (await resolveBrandSampleLink(input.brandId));
  if (!link.nfcCardSn) return { link, shouldSync: false, reason: "no_sn" };
  if (!isSamplePageSyncEnabled()) return { link, shouldSync: false, reason: "disabled" };

  const cursor = await getSyncCursor(link.nfcCardSn);
  if (cursor?.status === "running") {
    return { link, shouldSync: false, reason: "running" };
  }
  const staleMinutes = getSamplePageSyncStaleMinutes();
  const lastRun = cursor?.last_run_at ? Date.parse(cursor.last_run_at) : NaN;
  const stale =
    !Number.isFinite(lastRun) || Date.now() - lastRun > staleMinutes * 60_000;
  if (!stale) return { link, shouldSync: false, reason: "fresh" };
  return { link, shouldSync: true, reason: "stale" };
}

export async function syncBrandSampleIfStale(brandId: string) {
  const plan = await planBrandSampleSync({ brandId });
  if (!plan.shouldSync) {
    return { skipped: true as const, reason: plan.reason, link: plan.link };
  }
  const sync = await syncSampleVisitsForSn({
    sn: plan.link.nfcCardSn!,
    brandId: plan.link.brandId,
    brandName: plan.link.brandName,
    ownerId: plan.link.ownerId,
    sampleUrl: plan.link.sampleUrl,
  });
  return { skipped: false as const, link: plan.link, sync };
}
