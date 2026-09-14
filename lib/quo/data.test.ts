import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeQuoCallData, recordingsForQuoCall } from "./data.ts";

describe("Quo call data", () => {
  it("keeps artifacts and event payloads received by separate webhooks", () => {
    const merged = mergeQuoCallData({
      callId: "AC1",
      call: { id: "AC1", status: "ringing", from: "+10000000001" },
      eventTypes: ["call.ringing"],
      webhookEvents: [{ id: "EV1", type: "call.ringing", apiVersion: "v4" }],
    }, {
      callId: "AC1",
      call: { id: "AC1", status: "completed", duration: 42 },
      transcript: { callId: "AC1", dialogue: [{ content: "Hello" }] },
      eventTypes: ["call.transcript.completed"],
      webhookEvents: [{ id: "EV2", type: "call.transcript.completed", apiVersion: "v4" }],
    });

    assert.equal(merged.call?.from, "+10000000001");
    assert.equal(merged.call?.status, "completed");
    assert.equal(merged.transcript?.dialogue?.[0]?.content, "Hello");
    assert.deepEqual(merged.eventTypes, ["call.ringing", "call.transcript.completed"]);
    assert.deepEqual(merged.webhookEvents?.map((event) => event.id), ["EV1", "EV2"]);
  });

  it("collects recordings from API, nested call data, and legacy media without duplicates", () => {
    const recordings = recordingsForQuoCall({
      call: {
        id: "AC1",
        recordings: [{ id: "CR1", url: "https://example.com/one.mp3" }],
        media: [
          { url: "https://example.com/one.mp3", type: "audio/mpeg" },
          { url: "https://example.com/two.mp3", type: "audio/mpeg" },
        ],
      },
      recordings: [{ id: "CR1", url: "https://example.com/one.mp3" }],
    });

    assert.equal(recordings.length, 2);
    assert.deepEqual(recordings.map((recording) => recording.url), [
      "https://example.com/one.mp3",
      "https://example.com/two.mp3",
    ]);
  });

  it("deduplicates webhook retries by event id", () => {
    const event = { id: "EV1", type: "call.completed", createdAt: "2026-09-14T00:00:00.000Z" };
    const merged = mergeQuoCallData(
      { callId: "AC1", webhookEvents: [event] },
      { callId: "AC1", webhookEvents: [event] },
    );
    assert.equal(merged.webhookEvents?.length, 1);
  });
});
