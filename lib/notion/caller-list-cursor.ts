export type CallerListCursor = {
  notionCursor: string | null;
  /** Remaining Notion task page IDs from the last queried batch (FIFO). */
  buffer: string[];
  /** Brand keys already returned on earlier pages (one row per Follow-up Client). */
  seen: string[];
};

export function callerBrandKey(input: {
  id: string;
  brandId?: string | null;
  contactId?: string | null;
}) {
  if (input.brandId) return `brand:${input.brandId}`;
  if (input.contactId) return `contact:${input.contactId}`;
  return `task:${input.id}`;
}

export function encodeCallerListCursor(cursor: CallerListCursor): string {
  const payload = JSON.stringify({
    n: cursor.notionCursor,
    b: cursor.buffer,
    s: cursor.seen,
  });
  return `cbrand:${Buffer.from(payload, "utf8").toString("base64url")}`;
}

export function parseCallerListCursor(raw?: string | null): CallerListCursor {
  const value = raw?.trim() || "";
  if (!value) {
    return { notionCursor: null, buffer: [], seen: [] };
  }
  if (value.startsWith("cbrand:")) {
    try {
      const json = Buffer.from(value.slice("cbrand:".length), "base64url").toString(
        "utf8",
      );
      const parsed = JSON.parse(json) as {
        n?: string | null;
        b?: unknown;
        s?: unknown;
      };
      return {
        notionCursor: typeof parsed.n === "string" ? parsed.n : null,
        buffer: Array.isArray(parsed.b)
          ? parsed.b.filter((id): id is string => typeof id === "string" && !!id)
          : [],
        seen: Array.isArray(parsed.s)
          ? parsed.s.filter((id): id is string => typeof id === "string" && !!id)
          : [],
      };
    } catch {
      return { notionCursor: null, buffer: [], seen: [] };
    }
  }
  // Legacy opaque Notion cursor from pre-brand pagination.
  return { notionCursor: value, buffer: [], seen: [] };
}
