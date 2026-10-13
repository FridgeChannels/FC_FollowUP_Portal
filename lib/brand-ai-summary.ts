export const BRAND_AI_SUMMARY_PROPERTY = "Portal AI Summary";
const MAX_STORED_SUMMARY_CHARS = 1_800;

export type BrandAiSummaryScope = "overall" | "am";

export type BrandAiSummary = {
  content: string;
  generatedAt: string;
  generatedBy: string | null;
  dataAsOf: string;
  amId?: string | null;
  amName?: string | null;
};

export type BrandAiSummaryStore = {
  overall?: BrandAiSummary;
  am?: Record<string, BrandAiSummary>;
};

function isSummary(value: unknown): value is BrandAiSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BrandAiSummary>;
  return typeof item.content === "string"
    && typeof item.generatedAt === "string"
    && typeof item.dataAsOf === "string";
}

/**
 * The Notion field is deliberately compact JSON so a single field can retain
 * the overall view and the most recent per-AM views without another database.
 */
export function parseBrandAiSummaryStore(value?: string | null): BrandAiSummaryStore {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as { overall?: unknown; am?: unknown };
    const store: BrandAiSummaryStore = {};
    if (isSummary(parsed.overall)) store.overall = parsed.overall;
    if (parsed.am && typeof parsed.am === "object" && !Array.isArray(parsed.am)) {
      const entries = Object.entries(parsed.am)
        .filter((entry): entry is [string, BrandAiSummary] => isSummary(entry[1]));
      if (entries.length) store.am = Object.fromEntries(entries);
    }
    return store;
  } catch {
    // A manually edited or pre-existing field must not break the brand detail.
    return {};
  }
}

export function summaryForScope(
  store: BrandAiSummaryStore | null | undefined,
  scope: BrandAiSummaryScope,
  amId?: string | null,
) {
  if (scope === "overall") return store?.overall || null;
  return amId ? store?.am?.[amId] || null : null;
}

export function putBrandAiSummary(
  current: BrandAiSummaryStore | null | undefined,
  scope: BrandAiSummaryScope,
  summary: BrandAiSummary,
): BrandAiSummaryStore {
  if (scope === "overall") return { ...current, overall: summary };
  if (!summary.amId) return current || {};
  return {
    ...current,
    am: { ...current?.am, [summary.amId]: summary },
  };
}

/** Keep the freshest summaries when a Notion rich-text field approaches its limit. */
export function stringifyBrandAiSummaryStore(store: BrandAiSummaryStore) {
  const compact = () => JSON.stringify(store);
  while (compact().length > MAX_STORED_SUMMARY_CHARS && store.am && Object.keys(store.am).length) {
    const oldest = Object.entries(store.am)
      .sort(([, left], [, right]) => left.generatedAt.localeCompare(right.generatedAt))[0]?.[0];
    if (!oldest) break;
    const remaining = Object.fromEntries(Object.entries(store.am).filter(([id]) => id !== oldest));
    store.am = Object.keys(remaining).length ? remaining : undefined;
  }
  const raw = compact();
  if (raw.length > MAX_STORED_SUMMARY_CHARS) {
    throw new Error("AI summary is too long to save. Shorten the configured AI response.");
  }
  return raw;
}
