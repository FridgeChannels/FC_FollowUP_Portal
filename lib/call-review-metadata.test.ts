import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callerSubmittedPhoneCallIds,
  shouldStopOmniReachOnReviewSubmit,
  taskStatusForCallReview,
  type CallReviewMetadata,
} from "./call-review-metadata.ts";

const review = (status: CallReviewMetadata["status"], resolution?: CallReviewMetadata["resolution"]): CallReviewMetadata => ({
  interactionId: "interaction-1",
  taskId: "task-1",
  status,
  reviewedAt: "2026-09-15T00:00:00.000Z",
  reviewedBy: "peter@fridgeteam.com",
  assignedCaller: "beril@fridgechannels.com",
  recallRequested: status === "Unqualified",
  resolution,
});

describe("Call review task status", () => {
  it("closes a qualified task", () => {
    assert.equal(taskStatusForCallReview("Pending", review("Qualified")), "Completed");
  });

  it("reopens an unqualified task", () => {
    assert.equal(taskStatusForCallReview("Completed", review("Unqualified")), "Pending");
  });

  it("keeps a stopped unqualified task closed", () => {
    assert.equal(taskStatusForCallReview("Cancelled", review("Unqualified", "Stop task")), "Cancelled");
  });
});

describe("OmniReach stop on call review submit", () => {
  it("stops remaining OmniReach steps when the Phone task belongs to a run", () => {
    assert.equal(shouldStopOmniReachOnReviewSubmit({ sourceBombId: "bomb-1" }), true);
  });

  it("does not stop a manual Phone task", () => {
    assert.equal(shouldStopOmniReachOnReviewSubmit({ sourceBombId: null }), false);
  });
});

describe("callerSubmittedPhoneCallIds", () => {
  it("keeps only call IDs selected by a Caller for Phone review", () => {
    const callIds = callerSubmittedPhoneCallIds([
      {
        channel: "Phone",
        callReviewHistory: [
          { status: "Archived", callIds: ["earlier-attempt"] },
          { status: "Unqualified", callIds: ["submitted-then-recalled"] },
          { status: "Awaiting Review", callIds: ["awaiting-review"] },
        ],
      },
      { channel: "Email", callReviewHistory: [{ status: "Qualified", callIds: ["not-a-phone-call"] }] },
    ]);

    assert.deepEqual([...callIds].sort(), ["awaiting-review", "submitted-then-recalled"]);
  });
});
