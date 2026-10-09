import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countBrandActionOverview } from "./brand-action-overview.ts";

const now = Date.parse("2026-10-08T12:00:00Z");
const brands = [
  { id: "aa-bb", ownerId: "manager-a", status: "Ready", isTest: false },
  { id: "cc-dd", ownerId: "manager-a", status: "Ready", isTest: false },
  { id: "ee-ff", ownerId: "manager-b", status: "Ready", isTest: false },
  { id: "paused", ownerId: "manager-a", status: "Paused", isTest: false },
  { id: "completed", ownerId: "manager-a", status: "Completed", isTest: false },
  { id: "test", ownerId: "manager-a", status: "Ready", isTest: true },
];
const replies = new Map(brands.map((brand) => [brand.id, { dueAt: "2026-10-08T11:00:00Z" }]));
replies.set("cc-dd", { dueAt: "2026-10-08T13:00:00Z" });
const reviews = new Map(brands.map((brand) => [brand.id, 4]));

describe("Brand action overview", () => {
  it("deduplicates brands and counts multiple review tasks as one brand", () => {
    assert.deepEqual(countBrandActionOverview([...brands, { ...brands[0], id: "AABB" }], replies, reviews, {}, now), {
      needsReplyBrandCount: 6, overdueBrandCount: 5, callReviewBrandCount: 6,
    });
  });
  it("keeps manager scope and excludes Paused, Completed and hidden test brands", () => {
    assert.deepEqual(countBrandActionOverview(brands, replies, reviews, {
      ownerPageId: "manager-a", includeTest: false, excludeStatuses: ["Paused", "Completed"],
    }, now), { needsReplyBrandCount: 2, overdueBrandCount: 1, callReviewBrandCount: 2 });
  });
  it("preserves test access and test-only scope", () => {
    assert.deepEqual(countBrandActionOverview(brands, replies, reviews, {
      ownerPageId: "manager-a", onlyTest: true,
    }, now), { needsReplyBrandCount: 1, overdueBrandCount: 1, callReviewBrandCount: 1 });
  });
  it("allows overlap, ignores inaccessible signal IDs and uses the existing overdue boundary", () => {
    const signals = new Map([
      ["AABB", { dueAt: "2026-10-08T12:00:00Z" }],
      ["cc-dd", { dueAt: null }],
      ["inaccessible", { dueAt: "2026-10-01T00:00:00Z" }],
    ]);
    assert.deepEqual(countBrandActionOverview(brands.slice(0, 2), signals, new Map([["aabb", 9]]), {}, now), {
      needsReplyBrandCount: 2, overdueBrandCount: 0, callReviewBrandCount: 1,
    });
  });
  it("returns zeros when there are no matching brands", () => {
    assert.deepEqual(countBrandActionOverview(brands, replies, reviews, { ownerPageId: "no-match" }, now), {
      needsReplyBrandCount: 0, overdueBrandCount: 0, callReviewBrandCount: 0,
    });
  });
});
