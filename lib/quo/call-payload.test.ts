import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseQuoCallData, quoFromMessageId, serializeQuoCallData } from "./call-payload.ts";

const call = {
  callId: "AC1",
  call: {
    id: "AC1",
    status: "answered",
    conversationId: "CN1",
    createdAt: "2026-09-14T09:00:00.000Z",
  },
};

describe("Quo conversation payload", () => {
  it("writes Quo JSON into Extended Parameters shape", () => {
    const encoded = serializeQuoCallData(call);
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    assert.equal(parsed.quoCallId, "AC1");
    assert.equal(parsed.quoConversationId, "CN1");
    assert.equal((parsed.quo as { callId: string }).callId, "AC1");
    assert.equal(parseQuoCallData(encoded)?.call?.status, "answered");
  });

  it("keeps other Extended Parameters keys when merging", () => {
    const encoded = serializeQuoCallData(call, JSON.stringify({ custom: "keep" }));
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    assert.equal(parsed.custom, "keep");
    assert.equal(parsed.quoCallId, "AC1");
  });

  it("recovers callId from truncated Extended Parameters JSON", () => {
    const truncated = '{"quoCallId":"AC99","quo":{"callId":"AC99","transcript":{"dialogue":[{"t":"';
    assert.equal(parseQuoCallData(truncated)?.callId, "AC99");
  });

  it("builds a stub Quo payload from Message ID", () => {
    assert.equal(quoFromMessageId("QUO_CALL:AC42")?.callId, "AC42");
    assert.equal(quoFromMessageId("other"), null);
  });
});
