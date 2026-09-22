import type { BrandListItem } from "../brand-list";

/** Page-local / mixed-page order: Needs Reply first, then qualification, then recency. */
export function sortBrandListItems(brands: BrandListItem[]) {
  return [...brands].sort((a, b) => {
    const replyRank = (item: BrandListItem) => (item.needsReply ? 1 : 0);
    const qualificationRank = (item: BrandListItem) => (item.needsQualification ? 1 : 0);
    const aTime = a.replyDueAt || a.replyUpdatedAt || a.lastInteractionAt || "";
    const bTime = b.replyDueAt || b.replyUpdatedAt || b.lastInteractionAt || "";
    return (
      replyRank(b) - replyRank(a) ||
      qualificationRank(b) - qualificationRank(a) ||
      (a.needsReply && b.needsReply ? aTime.localeCompare(bTime) : 0) ||
      bTime.localeCompare(aTime) ||
      a.name.localeCompare(b.name)
    );
  });
}

export type BrandListCursor =
  | { phase: "reply"; offset: number }
  | { phase: "rest"; notionCursor: string | null; buffer: string[] };

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
