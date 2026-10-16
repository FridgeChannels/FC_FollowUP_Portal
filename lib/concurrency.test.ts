import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapWithConcurrency } from "./concurrency.ts";

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("keeps results in input order even when later items finish first", async () => {
    const results = await mapWithConcurrency([40, 10, 30, 5], 4, async (ms) => {
      await tick(ms);
      return ms * 2;
    });
    assert.deepEqual(results, [80, 20, 60, 10]);
  });

  it("never exceeds the requested concurrency", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([...Array(10).keys()], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await tick(5);
      active -= 1;
      return null;
    });
    assert.equal(peak, 3);
  });

  it("visits every item when the limit does not divide the length", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      seen.push(n);
      return n;
    });
    assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
  });

  it("passes the original index to the worker", async () => {
    const indexes = await mapWithConcurrency(["a", "b", "c"], 2, async (_item, index) => index);
    assert.deepEqual(indexes, [0, 1, 2]);
  });

  it("does not start work for an empty list", async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 3, async () => {
      calls += 1;
      return 0;
    });
    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  });

  it("treats a non-positive or invalid limit as serial", async () => {
    for (const limit of [0, -1, Number.NaN, 0.4]) {
      let active = 0;
      let peak = 0;
      const results = await mapWithConcurrency([1, 2, 3], limit, async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await tick(2);
        active -= 1;
        return n;
      });
      assert.deepEqual(results, [1, 2, 3], `limit=${limit}`);
      assert.equal(peak, 1, `limit=${limit} should run serially`);
    }
  });
});
