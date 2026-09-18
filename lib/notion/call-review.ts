import { CALL_REVIEW_CALLER_EMAIL, type CallReviewStatus } from "../call-review-metadata";
import { findOwnerByAccount } from "./owners";
import { retrieveFollowupTask } from "./tasks";
import { markInboundsReplied, updateFollowupTask } from "./followup-writes";
import { listConversationsByIds } from "./conversations";
import {
  encodeCallReviewHistory,
  historyFromTask,
  mergeUnselectedCallsIntoHistory,
  nextReviewRound,
  reviewRoundId,
  stripCallReviewHistoryFromNotes,
  unusedCallIds,
  withInheritedCallIds,
  type CallReviewRound,
} from "../call-review-history";

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

function humanNotes(existing: string | null | undefined, line: string) {
  return stripCallReviewHistoryFromNotes(appendNote(existing, line));
}

async function callIdsForTask(task: { conversationIds: string[] }) {
  if (!task.conversationIds.length) return [];
  const activities = await listConversationsByIds(task.conversationIds).catch(() => []);
  return [...new Set(activities.map((item) => item.quo?.callId).filter((id): id is string => !!id))];
}

export async function submitCallReview(input: {
  taskId: string;
  callerEmail?: string | null;
  callerName?: string | null;
  note?: string | null;
  /** Skip re-fetching conversations when the caller already loaded callIds. */
  callIds?: string[];
  selectedCallId?: string;
}) {
  const task = await retrieveFollowupTask(input.taskId);
  if (task.channel !== "Phone") {
    throw new CallReviewError("Review submission is only valid for Phone tasks", 400);
  }
  if (task.callReviewStatus === "Awaiting Review") {
    throw new CallReviewError("This Phone task is already waiting for review", 409);
  }
  if (task.callReviewStatus === "Qualified") {
    throw new CallReviewError("This Phone task is already marked Qualified", 409);
  }
  if (task.status === "Cancelled" || task.status === "Failed") {
    throw new CallReviewError("Cancelled or failed Phone tasks cannot be submitted for review", 409);
  }

  const caller = input.callerName?.trim() || input.callerEmail?.trim() || "Caller";
  const note = input.note?.trim();
  const now = new Date().toISOString();
  const allCallIds = input.callIds ?? await callIdsForTask(task);
  const history = withInheritedCallIds(historyFromTask(task), allCallIds);
  const selectedCallId = input.selectedCallId?.trim();
  if (!selectedCallId) {
    throw new CallReviewError("Select one call to submit for review", 400);
  }
  if (!allCallIds.includes(selectedCallId)) {
    throw new CallReviewError("The selected call is not part of this Phone task", 400);
  }
  if (history.some((round) => round.callIds.includes(selectedCallId))) {
    throw new CallReviewError("This call was already submitted in a previous round", 409);
  }
  const leftoverCallIds = unusedCallIds(history, allCallIds).filter((id) => id !== selectedCallId);
  const closedHistory = mergeUnselectedCallsIntoHistory(history, leftoverCallIds);
  const round = nextReviewRound(closedHistory);
  const reviewRound: CallReviewRound = {
    id: reviewRoundId(round),
    round,
    status: "Awaiting Review",
    submittedAt: now,
    callerName: input.callerName?.trim() || undefined,
    callerEmail: input.callerEmail?.trim() || undefined,
    callerNote: note || undefined,
    callIds: [selectedCallId],
  };
  const submissionNote = `Caller ${caller} submitted round ${round} for AccountManager review.`;

  await updateFollowupTask(task.id, {
    callReviewStatus: "Awaiting Review",
    status: "Completed",
    endedAt: now,
    notes: humanNotes(task.notes, submissionNote),
    callReviewHistory: encodeCallReviewHistory([...closedHistory, reviewRound]),
  });

  return retrieveFollowupTask(task.id);
}

export async function applyCallReview(input: {
  taskId: string;
  status: CallReviewStatus;
  reviewerEmail?: string | null;
  reviewerName?: string | null;
  reviewReason?: string | null;
  reviewNote?: string | null;
}) {
  const task = await retrieveFollowupTask(input.taskId);
  if (task.channel !== "Phone") {
    throw new CallReviewError("Call review is only valid for Phone tasks", 400);
  }
  if (task.callReviewStatus !== "Awaiting Review") {
    throw new CallReviewError(
      task.callReviewStatus
        ? `This Phone task is already marked ${task.callReviewStatus}`
        : "This Phone task is not waiting for review",
      409,
    );
  }

  const reviewer = input.reviewerName?.trim() || input.reviewerEmail?.trim() || "Account Manager";
  const now = new Date().toISOString();
  const reviewReason = input.reviewReason?.trim() || "";
  const reviewNote = input.reviewNote?.trim() || "";
  const allCallIds = await callIdsForTask(task);
  const history = withInheritedCallIds(historyFromTask(task), allCallIds);
  const currentRound = history.at(-1)?.status === "Awaiting Review"
    ? history.at(-1)!
    : {
        id: reviewRoundId(nextReviewRound(history)),
        round: nextReviewRound(history),
        status: "Awaiting Review" as const,
        callIds: unusedCallIds(history, allCallIds),
      };
  const reviewedRound: CallReviewRound = {
    ...currentRound,
    status: input.status,
    reviewedAt: now,
    reviewerName: input.reviewerName?.trim() || undefined,
    reviewerEmail: input.reviewerEmail?.trim() || undefined,
    reason: reviewReason || undefined,
    note: reviewNote || undefined,
    callIds: currentRound.callIds.length
      ? currentRound.callIds
      : unusedCallIds(
          history.filter((item) => item.id !== currentRound.id),
          allCallIds,
        ),
  };
  const nextHistory = [
    ...history.filter((item) => item.id !== currentRound.id),
    reviewedRound,
  ];
  const historyText = encodeCallReviewHistory(nextHistory);

  if (input.status === "Unqualified" && !reviewReason) {
    throw new CallReviewError("An unqualified reason is required before recalling the task", 400);
  }

  if (input.status === "Qualified") {
    await updateFollowupTask(task.id, {
      callReviewStatus: "Qualified",
      status: "Completed",
      endedAt: now,
      callReviewReason: null,
      callQualifiedAt: now,
      callReviewHistory: historyText,
      notes: humanNotes(task.notes, `AccountManager ${reviewer} marked round ${reviewedRound.round} Qualified.`),
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
      callReviewReason: reviewReason,
      callQualifiedAt: null,
      callReviewHistory: historyText,
      notes: humanNotes(
        task.notes,
        `AccountManager ${reviewer} marked round ${reviewedRound.round} Unqualified and recalled the task to ${caller.name}.`,
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
