import type { BrandActivity } from "../brand-list";

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
  return { ok: true as const, outbound };
}
