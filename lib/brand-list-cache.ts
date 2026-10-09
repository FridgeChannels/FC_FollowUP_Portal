import type { BrandListItem } from "./brand-list";

const STORAGE_KEY = "fc-followup-brands-v1";
const PAGE_STORAGE_KEY = "fc-followup-brand-list-page-v1";
const PAGE_REFRESH_REQUEST_KEY = "fc-followup-brand-list-refresh-request-v1";

let memory: BrandListItem[] = [];
let memoryPage: BrandListPageCache | null = null;
let pageRefreshRequested = false;

export type BrandListPageCache = {
  key: string;
  brands: BrandListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  cachedAt: number;
};

function readStorage(): BrandListItem[] {
  if (typeof sessionStorage === "undefined") return memory;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BrandListItem[]) : memory;
  } catch {
    return memory;
  }
}

export function cacheBrandList(items: BrandListItem[]) {
  memory = items;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fc-brands-cache-updated"));
  }
}

export function cacheBrandItem(item: BrandListItem) {
  const next = readStorage().filter((brand) => brand.id !== item.id);
  next.push(item);
  cacheBrandList(next);
}

export function getCachedBrand(id: string) {
  const normalized = id.replace(/-/g, "").toLowerCase();
  return (
    readStorage().find(
      (brand) => brand.id.replace(/-/g, "").toLowerCase() === normalized,
    ) || null
  );
}

export function getCachedBrandList() {
  return readStorage();
}

export function cacheBrandListPage(page: BrandListPageCache) {
  memoryPage = page;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(page));
  } catch {
    /* ignore quota */
  }
}

export function getCachedBrandListPage(key: string) {
  let cached = memoryPage;
  if (typeof sessionStorage !== "undefined") {
    try {
      const raw = sessionStorage.getItem(PAGE_STORAGE_KEY);
      if (raw) cached = JSON.parse(raw) as BrandListPageCache;
    } catch {
      /* use memory cache */
    }
  }
  if (!cached || cached.key !== key || !Array.isArray(cached.brands)) return null;

  const latestById = new Map(readStorage().map((brand) => [brand.id, brand]));
  return {
    ...cached,
    brands: cached.brands.map((brand) => ({
      ...brand,
      ...(latestById.get(brand.id) || {}),
    })),
  };
}

export function clearBrandListPageCache() {
  memoryPage = null;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PAGE_STORAGE_KEY);
  } catch {
    /* ignore unavailable storage */
  }
}

/**
 * Makes the next Brands view validate its cached rows against the server.
 * The cached page remains available so returning from a detail view is instant.
 */
export function requestBrandListPageRefresh() {
  pageRefreshRequested = true;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(PAGE_REFRESH_REQUEST_KEY, "1");
    } catch {
      /* ignore unavailable storage */
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fc-brand-list-refresh"));
  }
}

export function consumeBrandListPageRefreshRequest() {
  let requested = pageRefreshRequested;
  pageRefreshRequested = false;
  if (typeof sessionStorage !== "undefined") {
    try {
      requested ||= sessionStorage.getItem(PAGE_REFRESH_REQUEST_KEY) === "1";
      sessionStorage.removeItem(PAGE_REFRESH_REQUEST_KEY);
    } catch {
      /* use in-memory state */
    }
  }
  return requested;
}
