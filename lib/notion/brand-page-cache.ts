import type { NotionPage } from "./client";

const BRAND_PAGE_CACHE_MS = 10_000;

const pages = new Map<
  string,
  {
    expiresAt: number;
    page: NotionPage;
  }
>();

function pageKey(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

export function cacheBrandPages(items: NotionPage[]) {
  const expiresAt = Date.now() + BRAND_PAGE_CACHE_MS;
  for (const page of items) {
    pages.set(pageKey(page.id), { expiresAt, page });
  }
}

export function getCachedBrandPage(id: string) {
  const key = pageKey(id);
  const cached = pages.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    pages.delete(key);
    return null;
  }
  return cached.page;
}
