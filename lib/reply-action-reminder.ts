const MARKER = "[REPLY_ACTION_REMINDER]";

export type ReplyActionReminder = {
  activityId: string;
  dueAt: string;
  note: string;
  ownerId: string;
};

export function encodeReplyActionReminder(reminder: ReplyActionReminder) {
  return `${MARKER}${JSON.stringify(reminder)}`;
}

/** Reads the latest scheduled AM reminder for one inbound conversation. */
export function latestReplyActionReminder(notes?: string | null): ReplyActionReminder | null {
  for (const line of (notes || "").split("\n").reverse()) {
    if (!line.startsWith(MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(MARKER.length)) as Partial<ReplyActionReminder>;
      if (
        typeof value.activityId === "string"
        && typeof value.dueAt === "string"
        && Number.isFinite(Date.parse(value.dueAt))
        && typeof value.note === "string"
        && typeof value.ownerId === "string"
        && value.ownerId.trim()
      ) return value as ReplyActionReminder;
    } catch {
      // Ignore malformed historical records.
    }
  }
  return null;
}

export { MARKER as REPLY_ACTION_REMINDER_MARKER };
