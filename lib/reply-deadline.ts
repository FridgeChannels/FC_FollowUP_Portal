import { easternDayBounds } from "./scheduling-engine/calendar.ts";

export type ReplyDeadlineActivity = {
  brandId?: string | null;
  channel?: string | null;
  direction?: string | null;
  recordedAt?: string | null;
};

const REPLY_DEADLINE_CHANNELS = new Set(["Email", "SMS", "WhatsApp", "LinkedIn", "Phone"]);

/** Returns the expired deadline when no inbound reply followed the latest outbound. */
export function expiredUnansweredReplyDeadline(input: {
  deadline?: string | null;
  status?: string | null;
  activities: ReplyDeadlineActivity[];
  lastSuccessfulOutboundAt?: string | null;
  lastReplyAt?: string | null;
  nowMs?: number;
}): string | null {
  const date = input.deadline?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || input.status === "Paused" || input.status === "Completed") return null;
  let dueTimestamp: number;
  try { dueTimestamp = easternDayBounds(date).end; } catch { return null; }
  const dueAt = new Date(dueTimestamp).toISOString();
  if (!Number.isFinite(dueTimestamp) || dueTimestamp > (input.nowMs ?? Date.now())) return null;

  const interactions = input.activities.filter(activity =>
    REPLY_DEADLINE_CHANNELS.has(activity.channel || "") &&
    activity.recordedAt && Number.isFinite(Date.parse(activity.recordedAt)),
  );
  const latestOutboundAt = interactions
    .filter(activity => activity.direction === "Outbound" && Date.parse(activity.recordedAt!) <= (input.nowMs ?? Date.now()))
    .map(activity => activity.recordedAt!)
    .concat(input.lastSuccessfulOutboundAt && Date.parse(input.lastSuccessfulOutboundAt) <= (input.nowMs ?? Date.now()) ? [input.lastSuccessfulOutboundAt] : [])
    .sort()
    .at(-1);
  if (!latestOutboundAt) return null;

  const inboundTimes = interactions
    .filter(activity => activity.direction === "Inbound")
    .map(activity => activity.recordedAt!);
  if (input.lastReplyAt && Number.isFinite(Date.parse(input.lastReplyAt))) inboundTimes.push(input.lastReplyAt);
  const answered = inboundTimes.some(recordedAt => recordedAt > latestOutboundAt);
  return answered ? null : dueAt;
}
