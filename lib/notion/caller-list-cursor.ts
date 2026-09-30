/** Compact task fields kept server-side for Load more (not in the URL). */
export type CallerListBufferStub = {
  id: string;
  created_time?: string | null;
  title: string;
  brandId: string | null;
  contactId: string | null;
  ownerId: string | null;
  channel: string | null;
  status: string | null;
  priority: string | null;
  scheduledAt: string | null;
  endedAt: string | null;
  creationMethod: string | null;
  callReviewStatus: string | null;
  callReviewReason: string | null;
  callQualifiedAt: string | null;
  templateId: string | null;
  sourceBombId: string | null;
  omniReachRunId: string | null;
};

export type CallerListCursor = {
  notionCursor: string | null;
  buffer: CallerListBufferStub[];
  /** Legacy URL cursors that only stored task ids; restored via retrievePage. */
  legacyBufferIds: string[];
  /** Brand keys already returned on earlier pages (one row per Follow-up Client). */
  seen: string[];
};

const CONTINUATION_TTL_MS = 15 * 60_000;
const continuations = new Map<
  string,
  { expiresAt: number; cursor: CallerListCursor }
>();

function pruneCallerListContinuations(now = Date.now()) {
  for (const [id, entry] of continuations) {
    if (entry.expiresAt <= now) continuations.delete(id);
  }
}

export function callerBrandKey(input: {
  id: string;
  brandId?: string | null;
  contactId?: string | null;
}) {
  if (input.brandId) return `brand:${input.brandId}`;
  if (input.contactId) return `contact:${input.contactId}`;
  return `task:${input.id}`;
}

function isCallerListBufferStub(value: unknown): value is CallerListBufferStub {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CallerListBufferStub).id === "string" &&
      typeof (value as CallerListBufferStub).title === "string",
  );
}

function emptyCallerListCursor(): CallerListCursor {
  return {
    notionCursor: null,
    buffer: [],
    legacyBufferIds: [],
    seen: [],
  };
}

/** Short opaque cursor — stubs live in process memory to avoid HTTP 431. */
export function encodeCallerListCursor(cursor: CallerListCursor): string {
  pruneCallerListContinuations();
  const id = crypto.randomUUID();
  continuations.set(id, {
    expiresAt: Date.now() + CONTINUATION_TTL_MS,
    cursor: {
      notionCursor: cursor.notionCursor,
      buffer: cursor.buffer,
      legacyBufferIds: [],
      seen: [...cursor.seen],
    },
  });
  return `cbrand:t:${id}`;
}

function parseLegacyCallerListCursorPayload(raw: string): CallerListCursor {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as {
      n?: string | null;
      b?: unknown;
      s?: unknown;
    };
    const rawBuffer = Array.isArray(parsed.b) ? parsed.b : [];
    const buffer: CallerListBufferStub[] = [];
    const legacyBufferIds: string[] = [];
    for (const item of rawBuffer) {
      if (isCallerListBufferStub(item)) buffer.push(item);
      else if (typeof item === "string" && item) legacyBufferIds.push(item);
    }
    return {
      notionCursor: typeof parsed.n === "string" ? parsed.n : null,
      buffer,
      legacyBufferIds,
      seen: Array.isArray(parsed.s)
        ? parsed.s.filter((id): id is string => typeof id === "string" && !!id)
        : [],
    };
  } catch {
    return emptyCallerListCursor();
  }
}

export function parseCallerListCursor(raw?: string | null): CallerListCursor {
  const empty = emptyCallerListCursor();
  const value = raw?.trim() || "";
  if (!value) return empty;

  if (value.startsWith("cbrand:t:")) {
    pruneCallerListContinuations();
    const id = value.slice("cbrand:t:".length);
    const hit = continuations.get(id);
    if (!hit) return empty;
    hit.expiresAt = Date.now() + CONTINUATION_TTL_MS;
    return {
      notionCursor: hit.cursor.notionCursor,
      buffer: hit.cursor.buffer.map((item) => ({ ...item })),
      legacyBufferIds: [],
      seen: [...hit.cursor.seen],
    };
  }

  if (value.startsWith("cbrand:")) {
    return parseLegacyCallerListCursorPayload(value.slice("cbrand:".length));
  }

  // Legacy opaque Notion cursor from pre-brand pagination.
  return { ...empty, notionCursor: value };
}

/** Test helper — clear in-memory continuations. */
export function clearCallerListContinuations() {
  continuations.clear();
}
