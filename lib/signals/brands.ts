import type { BrandListItem } from "../brand-list";
import { retrievePage, type NotionPage } from "../notion/client";
import { getCachedBrandPage } from "../notion/brand-page-cache";
import { mapFollowupClientPages } from "../notion/followup-clients";
// Events/read state are fetched fresh; only the comparatively slow CRM projection is cached.
const cache = new Map<string, { at: number; brand: BrandListItem }>();
const TTL = 30_000;
export async function signalBrands(ids: string[]) {
  const now = Date.now();
  const missing = ids.filter(
    (id) => !cache.has(id) || now - cache.get(id)!.at >= TTL,
  );
  const resolved = await Promise.all(
    missing.map(async (id) => ({
      id,
      page:
        getCachedBrandPage(id) ||
        (await retrievePage(id).catch((error) => {
          if (error instanceof Error && /Notion 404/.test(error.message))
            return null;
          throw error;
        })),
    })),
  );
  const found = resolved.filter(
    (entry): entry is { id: string; page: NotionPage } => Boolean(entry.page),
  );
  const brands = await mapFollowupClientPages(found.map((entry) => entry.page));
  for (let index = 0; index < brands.length; index++)
    cache.set(found[index].id, { at: now, brand: brands[index] });
  // Bound memory in long-lived workers as brands leave the signal feed.
  if (cache.size > 5000)
    for (const [id, entry] of cache)
      if (now - entry.at >= TTL) cache.delete(id);
  return ids.flatMap((id) => (cache.has(id) ? [cache.get(id)!.brand] : []));
}
