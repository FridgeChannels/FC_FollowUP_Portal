export type ExhibitionOption = {
  id: string;
  name: string;
};

/** Long-lived: options change rarely; Admin can flush via global cache clear. */
export const EXHIBITION_OPTIONS_CACHE_MS = 6 * 60 * 60 * 1000;

let generation = 0;
let cached:
  | {
      expiresAt: number;
      key: string;
      items: ExhibitionOption[];
    }
  | null = null;
let pending:
  | {
      generation: number;
      key: string;
      promise: Promise<ExhibitionOption[]>;
    }
  | null = null;

export async function getCachedExhibitionOptions(
  key: string,
  load: () => Promise<ExhibitionOption[]>,
): Promise<ExhibitionOption[]> {
  if (cached && cached.key === key && cached.expiresAt > Date.now()) {
    return [...cached.items];
  }
  const loadGeneration = generation;
  if (pending && pending.generation === loadGeneration && pending.key === key) {
    return [...(await pending.promise)];
  }
  const promise = load().then((items) => {
    if (generation === loadGeneration) {
      cached = {
        expiresAt: Date.now() + EXHIBITION_OPTIONS_CACHE_MS,
        key,
        items: [...items],
      };
    }
    return items;
  });
  pending = { generation: loadGeneration, key, promise };
  const items = await promise.finally(() => {
    if (pending?.promise === promise) pending = null;
  });
  return [...items];
}

export function invalidateExhibitionOptionsCache() {
  generation += 1;
  cached = null;
  pending = null;
}
