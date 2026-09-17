import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeQuoCallData,
  mergeQuoRecordings,
  recordingsForQuoCall,
  syncQuoCallDataFromLive,
} from "./data.ts";

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

    // Dedicated recordings win; media mirrors are not listed as extra players.
    assert.equal(recordings.length, 1);
    assert.equal(recordings[0]?.url, "https://example.com/one.mp3");
  });

  it("falls back to call.media when no dedicated recordings exist", () => {
    const recordings = recordingsForQuoCall({
      call: {
        id: "AC1",
        media: [{ url: "https://example.com/media-only.mp3", type: "audio/mpeg" }],
      },
      recordings: [],
    });
    assert.equal(recordings.length, 1);
    assert.equal(recordings[0]?.url, "https://example.com/media-only.mp3");
  });

  it("dedupes signed URL variants of the same recording path", () => {
    const merged = mergeQuoRecordings(
      [{ id: "CR1", url: "https://cdn.example.com/file.mp3?token=aaa" }],
      [{ url: "https://cdn.example.com/file.mp3?token=bbb" }],
    );
    assert.equal(merged.length, 1);
  });

  it("dedupes Quo mono media against the dedicated recording file", () => {
    const merged = mergeQuoRecordings(
      [{
        id: "media-1",
        url: "https://share.quo.com/v1/resource/call-recording/0067f42e_mono.mp3?sig=a",
        duration: 51,
      }],
      [{
        id: "CR1CgYzWPL",
        url: "https://share.quo.com/v1/resource/call-recording/0067f42e.mp3?sig=b",
        duration: 51,
      }],
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "CR1CgYzWPL");
    assert.match(merged[0]?.url || "", /0067f42e\.mp3/);
  });

  it("does not let later transcript events wipe call timestamps", () => {
    const merged = mergeQuoCallData({
      callId: "AC1",
      call: {
        id: "AC1",
        status: "answered",
        createdAt: "2026-09-14T09:00:00.000Z",
        answeredAt: "2026-09-14T09:00:10.000Z",
        completedAt: "2026-09-14T09:01:00.000Z",
      },
    }, {
      callId: "AC1",
      call: { id: "AC1" },
      transcript: { callId: "AC1", dialogue: [{ content: "Hello" }] },
    }, "call.transcript.completed");

    assert.equal(merged.call?.status, "answered");
    assert.equal(merged.call?.createdAt, "2026-09-14T09:00:00.000Z");
    assert.equal(merged.call?.answeredAt, "2026-09-14T09:00:10.000Z");
    assert.equal(merged.call?.completedAt, "2026-09-14T09:01:00.000Z");
  });

  it("deduplicates webhook retries by event id", () => {
    const event = { id: "EV1", type: "call.completed", createdAt: "2026-09-14T00:00:00.000Z" };
    const merged = mergeQuoCallData(
      { callId: "AC1", webhookEvents: [event] },
      { callId: "AC1", webhookEvents: [event] },
    );
    assert.equal(merged.webhookEvents?.length, 1);
  });

  it("does not merge different URLs that share synthetic media-N ids", () => {
    const merged = mergeQuoRecordings(
      [{ id: "media-1", url: "https://example.com/old.mp3" }],
      [{ id: "media-1", url: "https://example.com/new.mp3" }],
    );
    assert.equal(merged.length, 2);
    assert.deepEqual(merged.map((item) => item.url).sort(), [
      "https://example.com/new.mp3",
      "https://example.com/old.mp3",
    ]);
  });

  it("live sync takes recording+transcript together when both are ready", () => {
    const synced = syncQuoCallDataFromLive({
      callId: "AC1",
      recordings: [{ id: "CR-old", url: "https://example.com/old.mp3" }],
      transcript: { callId: "AC1", dialogue: [{ content: "old transcript" }] },
      call: { id: "AC1", media: [{ url: "https://example.com/old.mp3" }] },
    }, {
      call: { id: "AC1", status: "completed", media: [{ url: "https://example.com/new.mp3" }] },
      recordings: [{ id: "CR-new", url: "https://example.com/new.mp3" }],
      transcript: { callId: "AC1", dialogue: [{ content: "new transcript" }] },
      summary: { callId: "AC1", summary: ["done"] },
      voicemail: null,
    });

    assert.equal(synced.recordings?.[0]?.url, "https://example.com/new.mp3");
    assert.equal(synced.transcript?.dialogue?.[0]?.content, "new transcript");
    assert.deepEqual(synced.call?.media, [{ url: "https://example.com/new.mp3" }]);
  });

  it("live sync does not pair a new recording with a stale transcript", () => {
    const synced = syncQuoCallDataFromLive({
      callId: "AC1",
      recordings: [{ id: "CR-old", url: "https://example.com/old.mp3" }],
      transcript: { callId: "AC1", dialogue: [{ content: "webhook transcript" }] },
      call: {
        id: "AC1",
        media: [{ url: "https://example.com/old.mp3" }],
        recordings: [{ id: "CR-old", url: "https://example.com/old.mp3" }],
      },
    }, {
      call: {
        id: "AC1",
        status: "completed",
        media: [{ url: "https://example.com/live-only.mp3" }],
      },
      recordings: [{ id: "CR-live", url: "https://example.com/live-only.mp3" }],
      transcript: null,
      summary: null,
      voicemail: null,
    });

    assert.equal(synced.recordings?.[0]?.url, "https://example.com/old.mp3");
    assert.equal(synced.transcript?.dialogue?.[0]?.content, "webhook transcript");
    assert.equal(recordingsForQuoCall(synced)[0]?.url, "https://example.com/old.mp3");
    assert.equal(recordingsForQuoCall(synced).some((item) => item.url?.includes("live-only")), false);
  });

  it("live sync can update transcript alone after webhook recording", () => {
    const synced = syncQuoCallDataFromLive({
      callId: "AC1",
      recordings: [{ id: "CR1", url: "https://example.com/call.mp3" }],
      transcript: null,
      call: { id: "AC1", media: [{ url: "https://example.com/call.mp3" }] },
    }, {
      call: { id: "AC1", media: [{ url: "https://example.com/other.mp3" }] },
      recordings: [],
      transcript: { callId: "AC1", dialogue: [{ content: "final asr" }] },
      summary: null,
      voicemail: null,
    });

    assert.equal(synced.transcript?.dialogue?.[0]?.content, "final asr");
    assert.equal(synced.recordings?.[0]?.url, "https://example.com/call.mp3");
    assert.equal(recordingsForQuoCall(synced).some((item) => item.url?.includes("other.mp3")), false);
  });
});
