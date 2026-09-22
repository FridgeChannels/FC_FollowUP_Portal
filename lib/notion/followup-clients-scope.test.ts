import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesNeedsReplyBrandScope } from "./owner-filter.ts";

describe("matchesNeedsReplyBrandScope", () => {
  const brand = {
    ownerId: "owner-a",
    isTest: false,
    status: "In Progress",
  };

  it("includes all brands for Admin-like scope", () => {
    assert.equal(matchesNeedsReplyBrandScope(brand, {}), true);
    assert.equal(
      matchesNeedsReplyBrandScope({ ...brand, ownerId: "owner-b" }, {}),
      true,
    );
  });

  it("scopes AccountManager to their owner page", () => {
    assert.equal(
      matchesNeedsReplyBrandScope(brand, { ownerPageId: "owner-a" }),
      true,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(brand, { ownerPageId: "owner-b" }),
      false,
    );
  });

  it("excludes Paused/Completed for non-Admin list alignment", () => {
    assert.equal(
      matchesNeedsReplyBrandScope(
        { ...brand, status: "Paused" },
        { excludeStatuses: ["Paused", "Completed"] },
      ),
      false,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(
        { ...brand, status: "Completed" },
        { excludeStatuses: ["Paused", "Completed"] },
      ),
      false,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(brand, {
        excludeStatuses: ["Paused", "Completed"],
      }),
      true,
    );
  });

  it("respects Is Test visibility", () => {
    const testBrand = { ...brand, isTest: true };
    assert.equal(
      matchesNeedsReplyBrandScope(testBrand, { includeTest: false }),
      false,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(testBrand, { includeTest: true }),
      true,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(brand, { onlyTest: true }),
      false,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(testBrand, { onlyTest: true }),
      true,
    );
  });

  it("supports unassigned owner filter", () => {
    assert.equal(
      matchesNeedsReplyBrandScope(brand, { ownerPageId: null }),
      false,
    );
    assert.equal(
      matchesNeedsReplyBrandScope(
        { ...brand, ownerId: null },
        { ownerPageId: null },
      ),
      true,
    );
  });
});
