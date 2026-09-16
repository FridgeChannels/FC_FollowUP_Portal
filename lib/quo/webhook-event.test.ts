import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callDataFromQuoWebhook } from "./webhook-event.ts";

describe("Quo webhook event payloads", () => {
  it("reads call id and phones from the current resource/context envelope", () => {
    const data = callDataFromQuoWebhook({
      type: "call.completed",
      createdAt: "2026-09-14T09:00:00.000Z",
      data: {
        resource: {
          id: "ACcall1",
          direction: "outgoing",
          status: "answered",
          answeredAt: "2026-09-14T09:00:10.000Z",
          completedAt: "2026-09-14T09:01:00.000Z",
        },
        context: {
          conversationId: "CN123",
          participants: {
            workspace: ["+13853310718"],
            external: ["+18207863604"],
            resolution: "available",
          },
        },
      },
    });

    assert.equal(data?.callId, "ACcall1");
    assert.equal(data?.call?.from, "+13853310718");
    assert.equal(data?.call?.to, "+18207863604");
    assert.equal(data?.call?.conversationId, "CN123");
    assert.ok(data?.call?.participants?.includes("+18207863604"));
  });

  it("prefers resource.callId for transcript events", () => {
    const data = callDataFromQuoWebhook({
      type: "call.transcript.completed",
      data: {
        resource: {
          callId: "ACcall1",
          dialogue: [{ content: "Hello", start: 0, end: 1 }],
        },
        context: {
          participants: {
            workspace: ["+13853310718"],
            external: ["+18207863604"],
          },
        },
      },
    });
    assert.equal(data?.callId, "ACcall1");
    assert.equal(data?.transcript?.dialogue?.[0]?.content, "Hello");
  });

  it("does not put null timestamps on transcript-only payloads", () => {
    const data = callDataFromQuoWebhook({
      type: "call.transcript.completed",
      data: {
        resource: {
          callId: "ACcall1",
          dialogue: [{ content: "Hello", start: 0, end: 1 }],
        },
      },
    });
    assert.equal(data?.call?.status, undefined);
    assert.equal(data?.call?.answeredAt, undefined);
    assert.equal(data?.call?.completedAt, undefined);
  });

  it("reads legacy object envelopes", () => {
    const data = callDataFromQuoWebhook({
      type: "call.completed",
      data: {
        object: {
          object: "call",
          id: "AClegacy",
          from: "+13853310718",
          to: "+18207863604",
          status: "completed",
        },
      },
    });
    assert.equal(data?.callId, "AClegacy");
    assert.equal(data?.call?.to, "+18207863604");
  });

  it("maps recording media urls from legacy recording payloads", () => {
    const data = callDataFromQuoWebhook({
      type: "call.recording.completed",
      data: {
        object: {
          id: "ACcall1",
          callId: "ACcall1",
          media: [{ type: "audio", url: "https://example.com/rec.mp3", duration: 12 }],
        },
      },
    });
    assert.equal(data?.recordings?.[0]?.url, "https://example.com/rec.mp3");
    assert.equal(data?.call?.media?.[0]?.url, "https://example.com/rec.mp3");
  });

  it("accepts string summaries from webhook payloads", () => {
    const data = callDataFromQuoWebhook({
      type: "call.summary.completed",
      data: {
        resource: {
          callId: "ACcall1",
          summary: "Customer confirmed interest.",
        },
      },
    });
    assert.deepEqual(data?.summary?.summary, ["Customer confirmed interest."]);
  });
});
