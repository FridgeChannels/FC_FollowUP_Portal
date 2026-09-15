import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { taskStatusForCallReview, type CallReviewMetadata } from "./call-review-metadata.ts";

const review = (status: CallReviewMetadata["status"]): CallReviewMetadata => ({
  interactionId: "interaction-1",
  taskId: "task-1",
  status,
  reviewedAt: "2026-09-15T00:00:00.000Z",
  reviewedBy: "peter@fridgeteam.com",
  assignedCaller: "beril@fridgechannels.com",
  recallRequested: status === "Unqualified",
});

describe("Call review task status", () => {
  it("closes a qualified task", () => {
    assert.equal(taskStatusForCallReview("Pending", review("Qualified")), "Completed");
  });

  it("reopens an unqualified task", () => {
    assert.equal(taskStatusForCallReview("Completed", review("Unqualified")), "Pending");
  });
});
