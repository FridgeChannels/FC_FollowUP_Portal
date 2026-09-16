export const CALL_REVIEW_CALLER_EMAIL = "beril@fridgechannels.com";

export type CallReviewStatus = "Awaiting Review" | "Qualified" | "Unqualified";

export type CallReviewMetadata = {
  interactionId?: string;
  taskId: string | null;
  status: CallReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  assignedCaller?: string;
  recallRequested: boolean;
};

export function taskStatusForCallReview(status: string, review?: Pick<CallReviewMetadata, "status">) {
  if (review?.status === "Qualified") return "Completed";
  if (review?.status === "Unqualified") return "Pending";
  return status;
}

export function callReviewsFromTasks(
  tasks: Array<{ id: string; callReviewStatus?: CallReviewStatus | null }>,
) {
  const reviews: Record<string, Pick<CallReviewMetadata, "status" | "recallRequested" | "taskId">> = {};
  for (const task of tasks) {
    if (!task.callReviewStatus) continue;
    reviews[task.id] = {
      taskId: task.id,
      status: task.callReviewStatus,
      recallRequested: task.callReviewStatus === "Unqualified",
    };
  }
  return reviews;
}
