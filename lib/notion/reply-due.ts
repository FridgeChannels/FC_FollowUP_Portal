import { propertyDate, propertyText, queryDatabasePages } from "./client";
import { getFollowupConversationDbId } from "./config";
import { listChannelDailyMax } from "./capacity";
import { listExistingTasksForSchedule } from "./tasks";
import {
  REPLY_DUE_PROPERTY,
  resolveReplyDueAt,
  shanghaiDateOnly,
  type ReplyDueReservation,
} from "../scheduling-engine/reply-due";
import { CHANNELS, type Channel } from "../scheduling-engine/types";

export { REPLY_DUE_PROPERTY };

export async function listOpenReplyDueReservations(
  channel?: string,
): Promise<ReplyDueReservation[]> {
  const filter: Record<string, unknown> = {
    and: [
      { property: "Reply Status", select: { equals: "Needs Reply" } },
      { property: "Direction", select: { equals: "Inbound" } },
      ...(channel
        ? [{ property: "Channel", select: { equals: channel } }]
        : []),
    ],
  };
  const pages = await queryDatabasePages(getFollowupConversationDbId(), filter);
  const reservations: ReplyDueReservation[] = [];
  for (const page of pages) {
    const properties = page.properties || {};
    const pageChannel = propertyText(properties.Channel);
    const due =
      propertyDate(properties[REPLY_DUE_PROPERTY]) ||
      propertyDate(properties["Interaction At"]) ||
      page.created_time ||
      null;
    if (!pageChannel || !CHANNELS.includes(pageChannel as Channel) || !due) continue;
    reservations.push({
      channel: pageChannel as Channel,
      date: shanghaiDateOnly(due),
    });
  }
  return reservations;
}

/** Compute Reply Due At using Channel Daily Max + existing tasks + open Needs Reply. */
export async function allocateReplyDueAt(input: {
  occurredAt: string;
  channel: string;
}): Promise<string> {
  const [dailyMax, existingTasks, openReplyReservations] = await Promise.all([
    listChannelDailyMax(),
    listExistingTasksForSchedule(),
    listOpenReplyDueReservations(input.channel),
  ]);
  return resolveReplyDueAt({
    occurredAt: input.occurredAt,
    channel: input.channel,
    dailyMax,
    existingTasks,
    openReplyReservations,
  });
}

export function replyDueAtProperty(iso: string) {
  return { date: { start: iso } };
}
