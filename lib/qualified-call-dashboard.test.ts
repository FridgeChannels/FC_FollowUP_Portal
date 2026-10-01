import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrandTask } from "./brand-list.ts";
import { buildQualifiedCallDashboard } from "./qualified-call-dashboard.ts";

function task(input: Partial<BrandTask>): BrandTask {
  return {
    id: "task-1",
    title: "Acme — Jamie — Phone",
    contactId: null,
    contactName: null,
    brandId: "brand-1",
    brandName: "Acme",
    brandOwnerId: null,
    ownerId: "caller-1",
    ownerName: "Jamie",
    channel: "Phone",
    status: "Completed",
    priority: null,
    creationMethod: null,
    scheduledAt: null,
    endedAt: null,
    notes: null,
    conversationIds: [],
    templateId: null,
    sourceBombId: null,
    callReviewStatus: "Qualified",
    callQualifiedAt: "2026-10-02T14:03:05.000Z",
    callReviewHistory: [{
      id: "round-1",
      round: 1,
      status: "Qualified",
      reviewedAt: "2026-10-02T14:03:05.000Z",
      reviewerName: "Taylor",
      reviewerEmail: "taylor@example.com",
      callerName: "Jamie at call time",
      callerEmail: "jamie@example.com",
      callIds: ["call-123"],
    }],
    ...input,
  };
}

describe("buildQualifiedCallDashboard", () => {
  it("groups current Qualified calls by day and Caller with review detail", () => {
    const result = buildQualifiedCallDashboard([
      task({ id: "task-1" }),
      task({ id: "task-2", ownerId: "caller-2", ownerName: "Morgan", callQualifiedAt: "2026-10-02T15:03:05.000Z" }),
    ], "UTC");

    assert.equal(result.length, 1);
    assert.equal(result[0].date, "2026-10-02");
    assert.equal(result[0].total, 2);
    assert.equal(result[0].callers[0].calls[0].reviewerName, "Taylor");
    assert.equal(result[0].callers[0].calls[0].callId, "call-123");
    assert.equal(result[0].callers[0].name, "Jamie at call time");
    assert.equal(result[0].callers[0].email, "jamie@example.com");
  });

  it("excludes a task that is no longer Qualified", () => {
    const result = buildQualifiedCallDashboard([
      task({ callReviewStatus: "Unqualified", callQualifiedAt: null }),
    ], "UTC");

    assert.deepEqual(result, []);
  });
});
