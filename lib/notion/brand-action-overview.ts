import { isOverdueReplyDueAt } from "./brand-reply-state.ts";
import { matchesNeedsReplyBrandScope, type NeedsReplyBrandScope } from "./owner-filter.ts";

export type BrandActionOverview = {
  needsReplyBrandCount: number;
  overdueBrandCount: number;
  callReviewBrandCount: number;
};

/** Count existing signal indexes by visible brand, never by message or task. */
export function countBrandActionOverview(
  brands: Iterable<{ id: string; ownerId?: string | null; isTest?: boolean; status: string }>,
  replySignals: Map<string, { dueAt: string | null }>,
  qualificationSignals: Map<string, number>,
  scope: NeedsReplyBrandScope = {},
  nowMs = Date.now(),
): BrandActionOverview {
  const key = (id: string) => id.replace(/-/g, "").toLowerCase();
  const replies = new Map([...replySignals].map(([id, signal]) => [key(id), signal]));
  const reviews = new Set([...qualificationSignals.keys()].map(key));
  const seen = new Set<string>();
  const counts: BrandActionOverview = {
    needsReplyBrandCount: 0,
    overdueBrandCount: 0,
    callReviewBrandCount: 0,
  };
  for (const brand of brands) {
    const id = key(brand.id);
    if (seen.has(id) || !matchesNeedsReplyBrandScope(brand, scope)) continue;
    seen.add(id);
    const reply = replies.get(id);
    if (reply) {
      counts.needsReplyBrandCount += 1;
      if (isOverdueReplyDueAt(reply.dueAt, nowMs)) counts.overdueBrandCount += 1;
    }
    if (reviews.has(id)) counts.callReviewBrandCount += 1;
  }
  return counts;
}
