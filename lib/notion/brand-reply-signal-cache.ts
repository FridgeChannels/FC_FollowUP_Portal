import type { BrandReplySignal } from "./brand-reply-signals";
import type { BrandListItem } from "../brand-list";
import type { NotionPage } from "./client";

const BRAND_REPLY_SIGNAL_CACHE_MS = 30_000;

let generation = 0;
let cached:
  | {
      expiresAt: number;
      signals: Map<string, BrandReplySignal>;
    }
  | null = null;
export type BrandReplyMetadata = {
  page: NotionPage;
  brand: BrandListItem;
};
let metadataCached:
  | {
      expiresAt: number;
      key: string;
      items: BrandReplyMetadata[];
    }
  | null = null;

export async function getCachedBrandReplySignals(
  load: () => Promise<Map<string, BrandReplySignal>>,
): Promise<Map<string, BrandReplySignal>> {
  if (cached && cached.expiresAt > Date.now()) {
    return new Map(cached.signals);
  }
  const loadGeneration = generation;
  const signals = await load();
  if (generation === loadGeneration) {
    cached = {
      expiresAt: Date.now() + BRAND_REPLY_SIGNAL_CACHE_MS,
      signals: new Map(signals),
    };
  }
  return new Map(signals);
}

export async function getCachedBrandReplyMetadata(
  key: string,
  load: () => Promise<BrandReplyMetadata[]>,
): Promise<BrandReplyMetadata[]> {
  if (
    metadataCached &&
    metadataCached.key === key &&
    metadataCached.expiresAt > Date.now()
  ) {
    return [...metadataCached.items];
  }
  const loadGeneration = generation;
  const items = await load();
  if (generation === loadGeneration) {
    metadataCached = {
      expiresAt: Date.now() + BRAND_REPLY_SIGNAL_CACHE_MS,
      key,
      items: [...items],
    };
  }
  return [...items];
}

export function invalidateBrandReplySignalCache() {
  generation += 1;
  cached = null;
  metadataCached = null;
}
