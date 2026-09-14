import type { BrandActivity, BrandTask } from "../brand-list";

export const SENT_TASK_STATUSES = new Set(["Completed"]);
export const SENT_MESSAGE_STATUSES = new Set(["Sent"]);

export function outboundMessageIsSent(item: Pick<BrandActivity, "direction" | "status" | "callResult" | "channel">) {
  if (item.direction !== "Outbound") return false;
  if ((item.channel || "") === "Phone") {
    return SENT_MESSAGE_STATUSES.has(item.status || "") || !!item.callResult;
  }
  return SENT_MESSAGE_STATUSES.has(item.status || "");
}

export function taskIsSent(status?: string | null) {
  return SENT_TASK_STATUSES.has(status || "");
}

export function pickOutboundCandidate(
  activities: BrandActivity[],
  input: {
    channel: string;
    taskId?: string | null;
    threadId?: string | null;
    inReplyToMessageId?: string | null;
  },
) {
  const sameChannel = activities.filter(
    (item) => item.direction === "Outbound" && (!item.channel || item.channel === input.channel),
  );
  const byMessage = input.inReplyToMessageId
    ? sameChannel.find((item) => item.messageId === input.inReplyToMessageId)
    : undefined;
  if (byMessage) return byMessage;
  const byThreadAndTask =
    input.threadId && input.taskId
      ? sameChannel.find((item) => item.threadId === input.threadId && item.taskId === input.taskId)
      : undefined;
  if (byThreadAndTask) return byThreadAndTask;
  const byThread = input.threadId
    ? sameChannel.find((item) => item.threadId === input.threadId)
    : undefined;
  if (byThread) return byThread;
  const byTask = input.taskId
    ? sameChannel.find((item) => item.taskId === input.taskId)
    : undefined;
  if (byTask) return byTask;
  return sameChannel.sort((left, right) => {
    const leftTime = left.createdAt || "";
    const rightTime = right.createdAt || "";
    return rightTime.localeCompare(leftTime) || left.id.localeCompare(right.id);
  })[0];
}

export function evaluateSentOutbound(input: {
  channel: string;
  activities: BrandActivity[];
  task?: BrandTask | null;
  taskId?: string | null;
  threadId?: string | null;
  inReplyToMessageId?: string | null;
}) {
  const outbound = pickOutboundCandidate(input.activities, input);
  if (!outbound) {
    return {
      ok: false as const,
      status: 422,
      error: `No outbound ${input.channel} message found. A reply can only be written after a message has been sent.`,
    };
  }
  const taskStatus = input.task?.status || null;
  if (!taskIsSent(taskStatus)) {
    return {
      ok: false as const,
      status: 409,
      error: `Task Status must be Completed before writing a reply. Current Task Status: ${taskStatus || "empty"}.`,
      outbound,
    };
  }
  return { ok: true as const, outbound };
}
