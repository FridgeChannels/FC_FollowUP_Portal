import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createNotionRetry,
  notionRetryDelayMs,
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
