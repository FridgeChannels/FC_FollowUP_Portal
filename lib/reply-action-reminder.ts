const MARKER = "[REPLY_ACTION_REMINDER]";
const ACTIVATED_MARKER = "[REPLY_ACTION_REMINDER_ACTIVATED]";

export type ReplyActionReminder = {
  activityId: string;
  dueAt: string;
  note: string;
  ownerId: string;
};

export function encodeReplyActionReminder(reminder: ReplyActionReminder) {
  return `${MARKER}${JSON.stringify(reminder)}`;
}

/** Marks one scheduled reminder as returned to the normal Needs Reply queue. */
export function encodeReplyActionReminderActivated(input: { dueAt: string; activatedAt: string }) {
  return `${ACTIVATED_MARKER}${JSON.stringify(input)}`;
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

export function hasActivatedReplyActionReminder(notes: string | null | undefined, dueAt: string) {
  for (const line of (notes || "").split("\n").reverse()) {
    if (!line.startsWith(ACTIVATED_MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(ACTIVATED_MARKER.length)) as { dueAt?: unknown; activatedAt?: unknown };
      if (
        value.dueAt === dueAt &&
        typeof value.activatedAt === "string" &&
        Number.isFinite(Date.parse(value.activatedAt))
      ) return true;
    } catch {
      // Ignore malformed historical metadata.
    }
  }
  return false;
}

export { MARKER as REPLY_ACTION_REMINDER_MARKER };
