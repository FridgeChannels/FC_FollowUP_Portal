import type { BrandListItem } from "../brand-list";

export const BRAND_LIST_SORTS = [
  "priority",
  "nameAsc",
  "nameDesc",
  "lastNewest",
  "lastOldest",
  "lastInboundNewest",
  "lastOutboundNewest",
  "ownerAssignedNewest",
  "replyDue",
] as const;

export type BrandListSort = (typeof BRAND_LIST_SORTS)[number];

export function normalizeBrandListSort(value?: string | null): BrandListSort {
  const next = value?.trim() || "priority";
  return (BRAND_LIST_SORTS as readonly string[]).includes(next)
    ? (next as BrandListSort)
    : "priority";
}

/** Default list: Needs Reply first (by due), then qualification, then recency. */
export function sortBrandListItems(brands: BrandListItem[]) {
  return sortBrandListItemsBy(brands, "priority");
}

export function sortBrandListItemsBy(
  brands: BrandListItem[],
  sort: BrandListSort,
) {
  return [...brands].sort((a, b) => compareBrandListItems(a, b, sort));
}

export function compareBrandListItems(
  a: BrandListItem,
  b: BrandListItem,
  sort: BrandListSort,
) {
  const timeValue = (value?: string | null) => (value ? Date.parse(value) || 0 : 0);
  if (sort === "nameAsc") return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (sort === "nameDesc") return b.name.localeCompare(a.name) || a.id.localeCompare(b.id);
  if (sort === "lastNewest") {
    return (
      timeValue(b.lastInteractionAt) - timeValue(a.lastInteractionAt) ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "lastOldest") {
    return (
      timeValue(a.lastInteractionAt) - timeValue(b.lastInteractionAt) ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "lastInboundNewest") {
    return (
      timeValue(b.lastReplyAt) - timeValue(a.lastReplyAt) ||
      a.name.localeCompare(b.name)
    );
  }
  // Outbound recency is resolved from ConversationDB in the all-brands listing.
  // Other scoped views fall back to the latest interaction.
  if (sort === "lastOutboundNewest") {
    return (
      timeValue(b.lastInteractionAt) - timeValue(a.lastInteractionAt) ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "ownerAssignedNewest") {
    return (
      timeValue(b.ownerAssignedAt) - timeValue(a.ownerAssignedAt) ||
      a.name.localeCompare(b.name)
    );
  }
  if (sort === "replyDue") {
    const replyRank = (item: BrandListItem) => (item.needsReply ? 1 : 0);
    const aDue = itemDue(a);
    const bDue = itemDue(b);
    return (
      replyRank(b) - replyRank(a) ||
      (a.needsReply && b.needsReply ? aDue.localeCompare(bDue) : 0) ||
      a.name.localeCompare(b.name)
    );
  }
  // priority
  const replyRank = (item: BrandListItem) => (item.needsReply ? 1 : 0);
  const qualificationRank = (item: BrandListItem) => (item.needsQualification ? 1 : 0);
  const aTime = itemDue(a) || a.lastInteractionAt || "";
  const bTime = itemDue(b) || b.lastInteractionAt || "";
  return (
    replyRank(b) - replyRank(a) ||
    qualificationRank(b) - qualificationRank(a) ||
    (a.needsReply && b.needsReply ? aTime.localeCompare(bTime) : 0) ||
    bTime.localeCompare(aTime) ||
    a.name.localeCompare(b.name)
  );
}

function itemDue(item: BrandListItem) {
  return item.replyDueAt || item.replyUpdatedAt || "";
}

/** Title sorts use Notion DB sorts (no full ClientDB materialization). */
export function isNotionTitleSort(sort: BrandListSort) {
  return sort === "nameAsc" || sort === "nameDesc";
}

/** Last-interaction sorts page a cached ClientDB scope (not the default hot path). */
export function isLastInteractionSort(sort: BrandListSort) {
  return sort === "lastNewest"
    || sort === "lastOldest"
    || sort === "lastInboundNewest"
    || sort === "lastOutboundNewest"
    || sort === "ownerAssignedNewest";
}

export type BrandListCursor =
  | { phase: "reply"; offset: number }
  | { phase: "rest"; notionCursor: string | null; buffer: string[] };

/** Buffered IDs with no upstream cursor are the final unread rows, not a fresh query. */
export function brandListSourceIsExhausted(
  notionCursor: string | null,
  buffer: string[],
) {
  return notionCursor === null && buffer.length > 0;
}

export function encodeBrandListCursor(cursor: BrandListCursor): string {
  if (cursor.phase === "reply") return `reply:${cursor.offset}`;
  const payload = JSON.stringify({
    n: cursor.notionCursor,
    b: cursor.buffer,
  });
  return `rest:${Buffer.from(payload, "utf8").toString("base64url")}`;
}

export function parseBrandListCursor(raw?: string | null): BrandListCursor {
  const value = raw?.trim() || "";
  if (!value) return { phase: "reply", offset: 0 };
  if (value.startsWith("reply:")) {
    return {
      phase: "reply",
      offset: Math.max(0, Number(value.slice("reply:".length)) || 0),
    };
  }
  if (value.startsWith("rest:")) {
    try {
      const parsed = JSON.parse(
        Buffer.from(value.slice("rest:".length), "base64url").toString("utf8"),
      ) as { n?: string | null; b?: string[] };
      return {
        phase: "rest",
        notionCursor: parsed.n ?? null,
        buffer: Array.isArray(parsed.b) ? parsed.b.filter(Boolean) : [],
      };
    } catch {
      return { phase: "rest", notionCursor: null, buffer: [] };
    }
  }
  // Legacy bare Notion cursor from before reply-first pagination.
  return { phase: "rest", notionCursor: value, buffer: [] };
}
