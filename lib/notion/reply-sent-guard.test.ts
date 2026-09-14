import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrandActivity, BrandTask } from "../brand-list.ts";
import {
  evaluateSentOutbound,
  outboundMessageIsSent,
  pickOutboundCandidate,
  taskIsSent,
} from "./reply-sent-guard.ts";

const outbound = (patch: Partial<BrandActivity>): BrandActivity => ({
  id: "c1",
  contactId: "ct1",
  taskId: "t1",
  channel: "Email",
  direction: "Outbound",
  status: "Pending",
  subject: null,
  content: "hello",
  sender: null,
  notes: null,
  callResult: null,
  sourceUrl: null,
  threadId: "thr",
  messageId: "msg",
  replyStatus: null,
  createdAt: "2026-09-14T00:00:00.000Z",
  ...patch,
});

const task = (status: string): BrandTask => ({
  id: "t1",
  title: "Email task",
  contactId: "ct1",
  contactName: "Melissa",
  brandId: "b1",
  brandName: "Oxyfresh",
  brandOwnerId: null,
  ownerId: null,
  ownerName: null,
  channel: "Email",
  status,
  priority: "P0",
  creationMethod: "Automated",
  scheduledAt: "2026-09-14",
  endedAt: null,
  notes: null,
  conversationIds: [],
  templateId: null,
  sourceBombId: null,
  sourceBombName: null,
  sourceBombCp: null,
});

describe("reply sent guard", () => {
  it("requires Message Status Sent and Task Status Completed", () => {
    assert.equal(outboundMessageIsSent(outbound({ status: "Pending" })), false);
    assert.equal(outboundMessageIsSent(outbound({ status: "Sent" })), true);
    assert.equal(taskIsSent("In Progress"), false);
    assert.equal(taskIsSent("Completed"), true);
  });

  it("treats Phone outbound as sent when Call Result exists", () => {
    assert.equal(
      outboundMessageIsSent(outbound({ channel: "Phone", status: null, callResult: "Connected" })),
      true,
    );
  });

  it("rejects pending outbound even when a task exists", () => {
    const result = evaluateSentOutbound({
      channel: "Email",
      activities: [outbound({ status: "Pending" })],
      task: task("Completed"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.match(result.error, /Message Status must be Sent/);
  });

  it("rejects sent outbound when the task is still In Progress", () => {
    const result = evaluateSentOutbound({
      channel: "Email",
      activities: [outbound({ status: "Sent" })],
      task: task("In Progress"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.match(result.error, /Task Status must be Completed/);
  });

  it("accepts sent outbound on a completed task", () => {
    const message = outbound({ status: "Sent" });
    const result = evaluateSentOutbound({
      channel: "Email",
      activities: [message],
      task: task("Completed"),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.outbound.id, message.id);
  });

  it("prefers inReplyTo outbound over later messages", () => {
    const first = outbound({ id: "old", messageId: "msg-1", status: "Sent", createdAt: "2026-09-13T00:00:00.000Z" });
    const later = outbound({ id: "new", messageId: "msg-2", status: "Pending", createdAt: "2026-09-15T00:00:00.000Z" });
    const picked = pickOutboundCandidate([later, first], { channel: "Email", inReplyToMessageId: "msg-1" });
    assert.equal(picked?.id, "old");
  });

  it("prefers the outbound that matches both task and thread", () => {
    const oldBomb = outbound({ id: "old", taskId: "t-old", threadId: "thr-shared", status: "Sent" });
    const newBomb = outbound({ id: "new", taskId: "t-new", threadId: "thr-shared", status: "Pending" });
    const picked = pickOutboundCandidate([oldBomb, newBomb], {
      channel: "Email",
      taskId: "t-new",
      threadId: "thr-shared",
    });
    assert.equal(picked?.id, "new");
  });
});
