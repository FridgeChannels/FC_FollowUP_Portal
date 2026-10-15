import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  cacheBrandListCount,
  clearBrandListCountCache,
  clearBrandListPageCache,
  getCachedBrandListCount,
} from "./brand-list-cache.ts";

describe("brand list count cache", () => {
  beforeEach(() => {
    clearBrandListCountCache();
  });

  it("returns the cached total for the same filter key", () => {
    cacheBrandListCount({
      key: "user-1:Admin:status=all",
      totalCount: 208,
      cachedAt: Date.now(),
    });

    assert.equal(getCachedBrandListCount("user-1:Admin:status=all")?.totalCount, 208);
  });

  it("ignores a total cached under a different filter key", () => {
    cacheBrandListCount({
      key: "user-1:Admin:status=all",
      totalCount: 208,
      cachedAt: Date.now(),
    });

    assert.equal(getCachedBrandListCount("user-1:Admin:status=Paused"), null);
  });

  it("drops the cached total when the list cache is cleared", () => {
    cacheBrandListCount({
      key: "user-1:Admin:status=all",
      totalCount: 12,
      cachedAt: Date.now(),
    });

    clearBrandListPageCache();

    assert.equal(getCachedBrandListCount("user-1:Admin:status=all"), null);
  });

  it("rejects a cached total that is not a finite number", () => {
    cacheBrandListCount({
      key: "user-1:Admin:status=all",
      totalCount: Number.NaN,
      cachedAt: Date.now(),
    });

    assert.equal(getCachedBrandListCount("user-1:Admin:status=all"), null);
  });
});
