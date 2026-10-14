const MARKER = "[FOLLOW_UP_REVIEW]";
const RESOLUTION_MARKER = "[FOLLOW_UP_REVIEW_RESOLVED]";

export type FollowUpReminder = {
  dueAt: string;
  note: string;
  ownerId: string | null;
};

export type FollowUpReminderResolution = {
  dueAt: string;
  resolvedAt: string;
  resolvedBy: string | null;
  action: "Resumed" | "Reassigned" | "Extended" | "Completed";
};

export function encodeFollowUpReminder(reminder: FollowUpReminder) {
  return `${MARKER}${JSON.stringify(reminder)}`;
}

export function encodeFollowUpReminderResolution(resolution: FollowUpReminderResolution) {
  return `${RESOLUTION_MARKER}${JSON.stringify(resolution)}`;
}

/** Reads the most recently saved structured reminder without interpreting free text. */
export function latestFollowUpReminder(notes?: string | null): FollowUpReminder | null {
  const lines = (notes || "").split("\n").reverse();
  for (const line of lines) {
    if (!line.startsWith(MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(MARKER.length)) as Partial<FollowUpReminder>;
      if (
        typeof value.dueAt === "string" &&
        Number.isFinite(Date.parse(value.dueAt)) &&
        typeof value.note === "string" &&
        (typeof value.ownerId === "string" || value.ownerId === null)
      ) return { dueAt: value.dueAt, note: value.note, ownerId: value.ownerId ?? null };
    } catch {
      // Ignore malformed historical markers rather than blocking the reminder scan.
    }
  }
  return null;
}

/** A resolution is tied to its reminder due date, so a later pause remains actionable. */
export function hasResolvedFollowUpReminder(notes: string | null | undefined, dueAt: string) {
  for (const line of (notes || "").split("\n").reverse()) {
    if (!line.startsWith(RESOLUTION_MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(RESOLUTION_MARKER.length)) as Partial<FollowUpReminderResolution>;
      if (
        value.dueAt === dueAt &&
        typeof value.resolvedAt === "string" &&
        Number.isFinite(Date.parse(value.resolvedAt)) &&
        (value.action === "Resumed" || value.action === "Reassigned" || value.action === "Extended" || value.action === "Completed")
      ) return true;
    } catch {
      // Ignore malformed historical metadata.
    }
  }
  return false;
}
