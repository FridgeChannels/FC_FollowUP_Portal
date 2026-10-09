import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBrandWork, isAutomaticReply, type PendingWorkReply } from "./brand-work.ts";
import type { BrandListItem } from "./brand-list.ts";

const brand = (id: string): BrandListItem => ({
  id, name: id, initials: id.slice(0, 2), currentCp: "CP2", status: "In Progress",
  handlingMode: "Human", lastInteractionAt: null, lastInteractionChannel: null,
  lastInteractionDirection: null, lastInteractionStatus: null, lastInteractionCallResult: null,
  lastReplyAt: null, ownerId: "am", ownerName: null, ownerEmail: null,
});
const reply = (id: string, brandId: string, channel: PendingWorkReply["channel"], threadId: string, receivedAt: string): PendingWorkReply => ({
  id, brandId, contactId: "contact", taskId: "task", channel, threadId,
  preview: `Message ${id}`, receivedAt, dueAt: null,
});

describe("brand AM work", () => {
  it("excludes ordinary auto replies and out of office notices", () => {
    assert.equal(isAutomaticReply("Re: Out of Office", "client@example.com"), true);
    assert.equal(isAutomaticReply("Auto-reply: away", "client@example.com"), true);
    assert.equal(isAutomaticReply("Project update", "no-reply@example.com"), true);
    assert.equal(isAutomaticReply("Re: Project update", "client@example.com"), false);
  });
  it("counts brands once and pending conversations by channel and thread", () => {
    const result = buildBrandWork(
      [brand("alpha"), brand("beta")],
      [reply("one", "alpha", "Email", "thread-1", "2026-10-01T08:00:00Z"),
        reply("two", "alpha", "Email", "thread-1", "2026-10-01T09:00:00Z"),
        reply("two", "alpha", "Email", "thread-1", "2026-10-01T09:00:00Z"),
        reply("three", "alpha", "WhatsApp", "thread-2", "2026-10-01T10:00:00Z"),
        reply("hidden", "other", "SMS", "thread-3", "2026-10-01T10:00:00Z")],
      [{ callId: "phone-1", taskId: "call-1", brandId: "alpha", submittedAt: "2026-10-01T07:00:00Z", preview: "Caller note", priority: null },
        { callId: "phone-1", taskId: "call-1", brandId: "alpha", submittedAt: "2026-10-01T07:00:00Z", preview: "Caller note", priority: null },
        { callId: "phone-2", taskId: "call-1", brandId: "alpha", submittedAt: "2026-10-01T07:00:00Z", preview: "Caller note", priority: null },
        { callId: "phone-3", taskId: "call-2", brandId: "beta", submittedAt: "2026-10-01T06:00:00Z", preview: "Call", priority: null }],
      Date.parse("2026-10-01T12:00:00Z"),
    );
    assert.deepEqual(result.counts, { myWork: 2, newAssignments: 0, replies: 1, callReview: 2 });
    assert.equal(result.brands[0].brand.id, "alpha");
    assert.equal(result.brands[0].channels.Email?.count, 1);
    assert.equal(result.brands[0].channels.Email?.target.id, "two");
    assert.equal(result.brands[0].channels.WhatsApp?.count, 1);
    assert.equal(result.brands[0].callReview?.count, 2);
    assert.equal(result.brands[0].preview, "Message three");
  });

  it("orders overdue replies, normal replies, then submitted calls", () => {
    const overdue = { ...reply("late", "late-brand", "Email", "t1", "2026-10-01T11:00:00Z"), dueAt: "2026-10-01T11:30:00Z" };
    const normal = reply("normal", "normal-brand", "SMS", "t2", "2026-10-01T08:00:00Z");
    const result = buildBrandWork(
      [brand("call-brand"), brand("normal-brand"), brand("late-brand")],
      [normal, overdue],
      [{ callId: "phone", taskId: "call", brandId: "call-brand", submittedAt: "2026-09-30T00:00:00Z", preview: "Submitted", priority: null }],
      Date.parse("2026-10-01T12:00:00Z"),
    );
    assert.deepEqual(result.brands.map((row) => row.brand.id), ["late-brand", "normal-brand", "call-brand"]);
    assert.equal(result.brands[0].overdue, true);
  });

  it("opens the longest-waiting conversation and call within each action", () => {
    const result = buildBrandWork(
      [brand("alpha")],
      [
        { ...reply("new", "alpha", "Email", "new-thread", "2026-10-02T09:00:00Z"), dueAt: "2026-10-03T09:00:00Z" },
        { ...reply("old", "alpha", "Email", "old-thread", "2026-10-01T09:00:00Z"), dueAt: "2026-10-10T09:00:00Z" },
      ],
      [
        { callId: "recent-call", taskId: "recent-task", brandId: "alpha", submittedAt: "2026-10-02T09:00:00Z", preview: "Recent", priority: "High" },
        { callId: "old-call", taskId: "old-task", brandId: "alpha", submittedAt: "2026-10-01T09:00:00Z", preview: "Old", priority: null },
      ],
    );
    assert.equal(result.brands[0].channels.Email?.target.id, "old");
    assert.equal(result.brands[0].callReview?.target.id, "old-task");
    assert.equal(buildBrandWork([brand("alpha")], [], []).counts.myWork, 0);
  });

  it("keeps one new assignment beside existing action types", () => {
    const result = buildBrandWork(
      [brand("alpha")],
      [reply("reply", "alpha", "Email", "thread", "2026-10-02T09:00:00Z")],
      [{ callId: "call", taskId: "task", brandId: "alpha", submittedAt: "2026-10-02T08:00:00Z", preview: "Call", priority: null }],
      Date.parse("2026-10-02T12:00:00Z"),
      [ { brandId: "alpha", assignedAt: "2026-10-02T10:00:00Z" }, { brandId: "alpha", assignedAt: "2026-10-02T09:00:00Z" } ],
    );
    assert.equal(result.counts.newAssignments, 1);
    assert.equal(result.brands[0].newAssignment?.target.at, "2026-10-02T10:00:00Z");
    assert.equal(result.brands[0].channels.Email?.count, 1);
    assert.equal(result.brands[0].callReview?.count, 1);
  });
});
