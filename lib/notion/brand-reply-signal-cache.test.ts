import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCachedBrandReplyMetadata,
  getCachedBrandReplySignals,
  invalidateBrandReplySignalCache,
} from "./brand-reply-signal-cache.ts";

describe("brand reply signal cache", () => {
  it("reuses a cached full signal set and returns defensive Map copies", async () => {
    invalidateBrandReplySignalCache();
    let loads = 0;
    const load = async () => {
      loads += 1;
      return new Map([["brand-1", { preview: "Reply", dueAt: null }]]);
    };

    const first = await getCachedBrandReplySignals(load);
    first.clear();
    const second = await getCachedBrandReplySignals(load);

    assert.equal(loads, 1);
    assert.equal(second.size, 1);
  });

  it("loads again after explicit invalidation", async () => {
    invalidateBrandReplySignalCache();
    let loads = 0;
    const load = async () => {
      loads += 1;
      return new Map();
    };

    await getCachedBrandReplySignals(load);
    invalidateBrandReplySignalCache();
    await getCachedBrandReplySignals(load);

    assert.equal(loads, 2);
  });

  it("reuses reply metadata only for the same complete brand-id set", async () => {
    invalidateBrandReplySignalCache();
    let loads = 0;
    const load = async () => {
      loads += 1;
      return [];
    };

    await getCachedBrandReplyMetadata("brand-1", load);
    await getCachedBrandReplyMetadata("brand-1", load);
    await getCachedBrandReplyMetadata("brand-1,brand-2", load);

    assert.equal(loads, 2);
  });
});
