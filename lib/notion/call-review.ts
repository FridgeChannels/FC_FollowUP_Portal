import { CALL_REVIEW_CALLER_EMAIL, type CallReviewStatus } from "../call-review-metadata";
import { findOwnerByAccount } from "./owners";
import { retrieveFollowupTask } from "./tasks";
import { markInboundsReplied, updateFollowupTask } from "./followup-writes";

export type { CallReviewStatus };

export class CallReviewError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CallReviewError";
    this.status = status;
  }
}

function appendNote(existing: string | null | undefined, line: string) {
  return [existing?.trim() || null, line].filter(Boolean).join("\n");
}

export async function applyCallReview(input: {
  taskId: string;
  status: CallReviewStatus;
  reviewerEmail?: string | null;
  reviewerName?: string | null;
}) {
  const task = await retrieveFollowupTask(input.taskId);
  if (task.channel !== "Phone") {
    throw new CallReviewError("Call review is only valid for Phone tasks", 400);
  }
  if (task.callReviewStatus === "Qualified" || task.callReviewStatus === "Unqualified") {
    throw new CallReviewError(`This Phone task is already marked ${task.callReviewStatus}`, 409);
  }

  const reviewer = input.reviewerName?.trim() || input.reviewerEmail?.trim() || "Account Manager";
  const now = new Date().toISOString();

  if (input.status === "Qualified") {
    await updateFollowupTask(task.id, {
      callReviewStatus: "Qualified",
      status: "Completed",
      endedAt: now,
      notes: appendNote(task.notes, `通话已评审为 Qualified（${reviewer}）。`),
    });
  } else {
    const caller = await findOwnerByAccount(CALL_REVIEW_CALLER_EMAIL);
    if (!caller) {
      throw new CallReviewError(
        `Caller Owner not found for ${CALL_REVIEW_CALLER_EMAIL}; cannot recall`,
        422,
      );
    }
    await updateFollowupTask(task.id, {
      callReviewStatus: "Unqualified",
      status: "Pending",
      endedAt: null,
      ownerId: caller.id,
      priority: "P0",
      notes: appendNote(
        task.notes,
        `通话评审 Unqualified，已召回改派给 ${caller.name}（${reviewer}）。`,
      ),
    });
  }

  // A reviewed call has been handled by the Account Manager. Clear the
  // notification on the inbound Phone conversation without affecting any
  // other unresolved replies for this contact.
  if (task.contactId) {
    await markInboundsReplied({
      contactId: task.contactId,
      channel: "Phone",
      taskId: task.id,
    });
  }

  return retrieveFollowupTask(task.id);
}
