import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRetryableQuoWebhookError,
  runWithLimitedRetries,
  WEBHOOK_JOB_MAX_ATTEMPTS,
  webhookJobRetryDelayMs,
} from "./webhook-retry.ts";

describe("Quo webhook job retries", () => {
  it("retries retryable errors then succeeds", async () => {
    let calls = 0;
    const result = await runWithLimitedRetries(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Notion 429: rate_limited");
      return "ok";
    }, { sleep: async () => undefined });
    assert.equal(result, "ok");
    assert.equal(calls, 3);
  });

  it("stops after the max attempt count", async () => {
    let calls = 0;
    await assert.rejects(
      () => runWithLimitedRetries(async () => {
        calls += 1;
        throw new Error("Notion 429: rate_limited");
      }, { sleep: async () => undefined }),
      /Notion 429/,
    );
    assert.equal(calls, WEBHOOK_JOB_MAX_ATTEMPTS);
  });

  it("does not retry permanent Notion errors", async () => {
    let calls = 0;
    await assert.rejects(
      () => runWithLimitedRetries(async () => {
        calls += 1;
        throw new Error("Notion 400: invalid property");
      }, { sleep: async () => undefined }),
      /Notion 400/,
    );
    assert.equal(calls, 1);
    assert.equal(isRetryableQuoWebhookError(new Error("Notion 400: invalid property")), false);
    assert.equal(isRetryableQuoWebhookError(new Error("Notion 429: rate_limited")), true);
    assert.equal(webhookJobRetryDelayMs(1), 500);
    assert.equal(webhookJobRetryDelayMs(2), 1000);
  });
});
