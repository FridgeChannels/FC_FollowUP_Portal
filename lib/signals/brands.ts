import type { BrandListItem } from "../brand-list";
import { retrievePage, type NotionPage } from "../notion/client";
import { getCachedBrandPage } from "../notion/brand-page-cache";
import { mapFollowupClientPages } from "../notion/followup-clients";

/**
 * Brand projections are the expensive half of the Signals payload: a cache miss
 * costs one Notion page fetch, and a cold feed fans out over every brand that
 * has a tap (60+ on the production feed, ~1.3s per call here). The projection
 * itself (name, owner, CP, Is Test) changes far less often than the events do,
 * so it is cached for minutes and — once stale — served from cache while a
 * background refresh runs. Events/read state are still fetched fresh on every
 * request; only this comparatively slow CRM projection is cached.
 *
 * The window is a deliberate trade-off: `canViewBrand` runs against the cached
 * projection, so this bounds how long a re-assigned brand can linger in a
 * previous owner's feed. Five minutes keeps that fresh enough to notice while
 * still removing almost every fan-out.
 */
const FRESH_MS = 5 * 60_000;
/** Beyond this age a cached entry is too old to serve at all. */
const STALE_MS = 24 * 60 * 60_000;
const MAX_ENTRIES = 5000;

/** `null` is a cached negative result (page missing / not shared with us). */
type Entry = { at: number; brand: BrandListItem | null };

const cache = new Map<string, Entry>();
/** One batch promise per id, so concurrent requests never fetch the same page twice. */
const inflight = new Map<string, Promise<void>>();

function cacheKey(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * Fetch and cache a batch. Page-level failures are isolated so the pages that
 * did load still land in the cache; the first such failure is re-thrown so the
 * caller reports an incomplete feed instead of silently dropping brands.
 */
async function fetchBatch(ids: string[]) {
  const failures: unknown[] = [];
  /** Indexes whose fetch failed transiently — never cached as a negative. */
  const failed = new Set<number>();
  const pages: NotionPage[] = [];
  await Promise.all(
    ids.map(async (id, index) => {
      try {
        const page = getCachedBrandPage(id) || (await retrievePage(id));
        if (page) pages.push(page);
      } catch (error) {
        // A page that is not shared with the integration is a stable negative
        // result — cache it instead of retrying on every request.
        if (error instanceof Error && /Notion 404/.test(error.message)) return;
        failed.add(index);
        failures.push(error);
      }
    }),
  );
  // Map once per batch: `mapFollowupClientPages` resolves owners and CP titles
  // through shared caches, which a per-page mapping would rebuild every time.
  const brands = await mapFollowupClientPages(pages);
  const byKey = new Map(brands.map((brand) => [cacheKey(brand.id), brand]));
  const at = Date.now();
  for (let index = 0; index < ids.length; index += 1) {
    if (failed.has(index)) continue;
    cache.set(cacheKey(ids[index]), {
      at,
      brand: byKey.get(cacheKey(ids[index])) || null,
    });
  }
  // Partial batches still populate the cache above; the failure is surfaced so
  // the feed reports an incomplete payload rather than dropping brands quietly.
  if (failures.length) throw failures[0];
}

/**
 * Kick off (or join) a fetch for `ids`, returning the shared promise so callers
 * that must wait can await exactly the work their ids are covered by.
 */
function startBatch(ids: string[]): Promise<void> | null {
  const fresh = ids.filter((id) => !inflight.has(cacheKey(id)));
  if (!fresh.length) return null;
  const task = fetchBatch(fresh);
  // Attach a handler so a rejected batch never surfaces as an unhandled
  // rejection when it was started as a background refresh.
  void task.catch(() => undefined);
  for (const id of fresh) inflight.set(cacheKey(id), task);
  const cleanup = () => {
    for (const id of fresh)
      if (inflight.get(cacheKey(id)) === task) inflight.delete(cacheKey(id));
  };
  void task.then(cleanup, cleanup);
  return task;
}

function prune(now: number) {
  // Bound memory in long-lived workers as brands leave the signal feed.
  if (cache.size <= MAX_ENTRIES) return;
  for (const [key, entry] of cache) if (now - entry.at >= FRESH_MS) cache.delete(key);
}

export async function signalBrands(ids: string[]) {
  const now = Date.now();
  const refreshLater: string[] = [];
  for (const id of ids) {
    const entry = cache.get(cacheKey(id));
    if (!entry) continue;
    const age = now - entry.at;
    if (age >= STALE_MS) cache.delete(cacheKey(id));
    else if (age >= FRESH_MS) refreshLater.push(id);
  }

  const missing = ids.filter((id) => !cache.has(cacheKey(id)));
  startBatch(missing);
  // Stale-while-revalidate: these ids are already served from cache below, so
  // the refresh runs in the background and the caller never waits for it.
  if (refreshLater.length) void startBatch(refreshLater);
  // Wait for every missing id: our own batch plus batches another request began.
  const pending = missing
    .map((id) => inflight.get(cacheKey(id)))
    .filter((task): task is Promise<void> => Boolean(task));
  if (pending.length) await Promise.all(pending);

  prune(now);
  return ids.flatMap((id) => {
    const entry = cache.get(cacheKey(id));
    return entry?.brand ? [entry.brand] : [];
  });
}
