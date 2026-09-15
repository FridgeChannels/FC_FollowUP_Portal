import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createNotionLimiter,
  createNotionRetry,
  isRetryableNotionError,
  notionRetryDelayMs,
  runWithNotionLimit,
  shouldRetryNotionStatus,
} from "./rate-limit.ts";

describe("Notion request retry", () => {
  it("retries 429 then returns the successful response", async () => {
    const sleeps: number[] = [];
    const retry = createNotionRetry({
      maxAttempts: 3,
      sleep: async (ms) => { sleeps.push(ms); },
    });
    let calls = 0;
    const response = await retry.fetchWithRetry(async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } });
      return new Response("ok", { status: 200 });
    });
    assert.equal(calls, 2);
    assert.equal(response.status, 200);
    assert.deepEqual(sleeps, [1000]);
  });

  it("stops after the max attempt count", async () => {
    const retry = createNotionRetry({
      maxAttempts: 3,
      sleep: async () => undefined,
    });
    let calls = 0;
    const response = await retry.fetchWithRetry(async () => {
      calls += 1;
      return new Response("rate limited", { status: 429 });
    });
    assert.equal(calls, 3);
    assert.equal(response.status, 429);
  });

  it("uses exponential backoff without Retry-After", () => {
    const response = new Response("", { status: 429 });
    assert.equal(notionRetryDelayMs(response, 1), 400);
    assert.equal(notionRetryDelayMs(response, 2), 800);
    assert.equal(shouldRetryNotionStatus(400), false);
    assert.equal(shouldRetryNotionStatus(429), true);
  });
});

describe("Notion request limiter", () => {
  it("keeps in-flight Notion calls at or below concurrency", async () => {
    const limiter = createNotionLimiter({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        limiter.schedule(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await Promise.resolve();
          active -= 1;
        }),
      ),
    );
    assert.equal(peak, 2);
  });

  it("does not hold a concurrency slot while backing off a 429", async () => {
    const limiter = createNotionLimiter({ concurrency: 1 });
    let releaseSleep: () => void = () => undefined;
    const sleeping = new Promise<void>((resolve) => {
      releaseSleep = resolve;
    });
    const retry = createNotionRetry({
      maxAttempts: 2,
      schedule: (task) => limiter.schedule(task),
      sleep: async () => sleeping,
    });
    let calls = 0;
    const retrying = retry.fetchWithRetry(async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response("ok", { status: 200 });
    });
    await Promise.resolve();
    await Promise.resolve();
    let extraRan = false;
    await limiter.schedule(async () => {
      extraRan = true;
    });
    assert.equal(extraRan, true);
    releaseSleep();
    const response = await retrying;
    assert.equal(response.status, 200);
  });
});

describe("Notion error classification", () => {
  it("treats 429 as retryable and 400 as not", () => {
    assert.equal(isRetryableNotionError(new Error("Notion 429: rate limited")), true);
    assert.equal(isRetryableNotionError(new Error("Notion 400: validation")), false);
  });
});

describe("request-scoped Notion limiter", () => {
  it("reuses one limiter inside the same request context", async () => {
    await runWithNotionLimit(async () => {
      const retry = createNotionRetry({
        maxAttempts: 1,
        schedule: (task) => {
          const first = runWithNotionLimit(() => "same");
          assert.equal(first, "same");
          return task();
        },
      });
      const response = await retry.fetchWithRetry(async () => new Response("ok", { status: 200 }));
      assert.equal(response.status, 200);
    });
  });
});
