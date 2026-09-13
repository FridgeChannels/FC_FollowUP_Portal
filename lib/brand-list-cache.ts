import type { BrandListItem } from "./brand-list";

const STORAGE_KEY = "fc-followup-brands-v1";

let memory: BrandListItem[] = [];

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
