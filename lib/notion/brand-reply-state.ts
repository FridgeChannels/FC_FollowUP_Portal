/** Brands list `replyState` query values (All reply states filter). */
export const BRAND_REPLY_STATES = [
  "all",
  "needsReply",
  "overdue",
  "replied",
  "never",
  "qualification",
] as const;

export type BrandReplyState = (typeof BRAND_REPLY_STATES)[number];

export function normalizeBrandReplyState(value?: string | null): BrandReplyState {
  const next = value?.trim() || "all";
  return (BRAND_REPLY_STATES as readonly string[]).includes(next)
    ? (next as BrandReplyState)
    : "all";
}

/** True when reply-state filter uses the Needs Reply signal index (ConversationDB). */
export function isNeedsReplySignalState(state: BrandReplyState) {
  return state === "needsReply" || state === "overdue";
}

/** True when list should return only the filtered set (no mixed “rest” brands). */
export function isExclusiveReplyState(state: BrandReplyState) {
  return state !== "all";
}

export function isOverdueReplyDueAt(dueAt: string | null | undefined, nowMs: number) {
  if (!dueAt) return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && due < nowMs;
}
