const MARKER = "[FOLLOW_UP_REVIEW]";

export type FollowUpReminder = {
  dueAt: string;
  note: string;
  ownerId: string | null;
};

export function encodeFollowUpReminder(reminder: FollowUpReminder) {
  return `${MARKER}${JSON.stringify(reminder)}`;
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
