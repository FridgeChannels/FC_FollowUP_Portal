export const CALL_REVIEW_CALLER_EMAIL = "beril@fridgechannels.com";

export type CallReviewStatus = "Awaiting Review" | "Qualified" | "Unqualified";
export type CallReviewResolution = "Recall" | "Stop task";

export type CallReviewMetadata = {
  interactionId?: string;
  taskId: string | null;
  status: CallReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  assignedCaller?: string;
  recallRequested: boolean;
  resolution?: CallReviewResolution;
};

export function taskStatusForCallReview(status: string, review?: Pick<CallReviewMetadata, "status">) {
  if (review?.status === "Qualified") return "Completed";
  // A stopped Unqualified task is already closed in Notion. Keep that state
  // instead of deriving Pending from the review label alone.
  if (review?.status === "Unqualified") return status === "Cancelled" || status === "Canceled" ? status : "Pending";
  return status;
}

/** Caller submit-for-review stops remaining OmniReach steps on that Phone task's run. */
export function shouldStopOmniReachOnReviewSubmit(task: { sourceBombId?: string | null }) {
  return Boolean(task.sourceBombId);
}

export function callReviewsFromTasks(
  tasks: Array<{ id: string; callReviewStatus?: CallReviewStatus | null; callReviewHistory?: Array<{ status: CallReviewStatus | "Archived"; resolution?: CallReviewResolution }> }>,
) {
  const reviews: Record<string, Pick<CallReviewMetadata, "status" | "recallRequested" | "taskId" | "resolution">> = {};
  for (const task of tasks) {
    if (!task.callReviewStatus) continue;
    const lastRound = [...(task.callReviewHistory || [])].reverse().find((round) => round.status !== "Archived");
    const resolution = lastRound?.resolution;
    reviews[task.id] = {
      taskId: task.id,
      status: task.callReviewStatus,
      recallRequested: task.callReviewStatus === "Unqualified" && resolution !== "Stop task",
      resolution,
    };
  }
  return reviews;
}

/**
 * Call IDs explicitly selected by a Caller when submitting a Phone task for
 * Account Manager review. Archived IDs are earlier, unsubmitted attempts.
 */
export function callerSubmittedPhoneCallIds(
  tasks: Array<{
    channel?: string | null;
    callReviewHistory?: Array<{ status: CallReviewStatus | "Archived"; callIds?: string[] }>;
  }>,
) {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.channel !== "Phone") continue;
    for (const round of task.callReviewHistory || []) {
      if (round.status === "Archived") continue;
      for (const callId of round.callIds || []) {
        if (callId.trim()) ids.add(callId);
      }
    }
  }
  return ids;
}
