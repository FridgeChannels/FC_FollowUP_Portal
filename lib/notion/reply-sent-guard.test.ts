import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrandActivity } from "../brand-list.ts";
import {
  evaluateSentOutbound,
  pickOutboundCandidate,
} from "./reply-sent-guard.ts";

const outbound = (patch: Partial<BrandActivity>): BrandActivity => ({
  id: "c1",
  contactId: "ct1",
  taskId: "t1",
  channel: "Email",
  direction: "Outbound",
  status: null,
  subject: null,
  content: "hello",
  sender: null,
  notes: null,
  callResult: null,
  sourceUrl: null,
  threadId: "thr",
  messageId: "msg",
  replyStatus: null,
  cpId: null,
  cpAtInteraction: null,
  createdAt: "2026-09-14T00:00:00.000Z",
  ...patch,
});

describe("reply sent guard", () => {
  it("accepts outbound regardless of linked task status", () => {
    const pending = outbound({ status: null });
    const result = evaluateSentOutbound({
      channel: "Email",
      activities: [pending],
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.outbound.id, pending.id);
  });

  it("rejects when no outbound message exists", () => {
    const result = evaluateSentOutbound({
      channel: "Email",
      activities: [],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 422);
    assert.match(result.error, /No outbound Email message found/);
  });

  it("prefers inReplyTo outbound over later messages", () => {
    const first = outbound({ id: "old", messageId: "msg-1", createdAt: "2026-09-13T00:00:00.000Z" });
    const later = outbound({ id: "new", messageId: "msg-2", createdAt: "2026-09-15T00:00:00.000Z" });
    const picked = pickOutboundCandidate([later, first], { channel: "Email", inReplyToMessageId: "msg-1" });
    assert.equal(picked?.id, "old");
  });

  it("prefers the outbound that matches both task and thread", () => {
    const oldBomb = outbound({ id: "old", taskId: "t-old", threadId: "thr-shared" });
    const newBomb = outbound({ id: "new", taskId: "t-new", threadId: "thr-shared" });
    const picked = pickOutboundCandidate([oldBomb, newBomb], {
      channel: "Email",
      taskId: "t-new",
      threadId: "thr-shared",
    });
    assert.equal(picked?.id, "new");
  });
});
