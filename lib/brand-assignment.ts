export const OWNER_ASSIGNMENT_MARKER = "[OWNER_ASSIGNMENT]";

export type BrandAssignment = {
  ownerId: string | null;
  assignedAt: string;
  handledAt?: string | null;
};

/** Stores assignment moments as structured Notes metadata without guessing from edits. */
export function encodeBrandAssignment(assignment: BrandAssignment) {
  return `${OWNER_ASSIGNMENT_MARKER}${JSON.stringify(assignment)}`;
}

/** Returns the latest valid assignment event, including a later unassignment. */
export function latestBrandAssignment(notes?: string | null): BrandAssignment | null {
  const lines = (notes || "").split("\n").reverse();
  for (const line of lines) {
    if (!line.startsWith(OWNER_ASSIGNMENT_MARKER)) continue;
    try {
      const value = JSON.parse(line.slice(OWNER_ASSIGNMENT_MARKER.length)) as Partial<BrandAssignment>;
      if (
        typeof value.assignedAt === "string"
        && Number.isFinite(Date.parse(value.assignedAt))
        && (typeof value.ownerId === "string" || value.ownerId === null)
      ) {
        const handledAt = typeof value.handledAt === "string" && Number.isFinite(Date.parse(value.handledAt))
          ? value.handledAt
          : null;
        return {
          ownerId: value.ownerId ?? null,
          assignedAt: value.assignedAt,
          ...(handledAt ? { handledAt } : {}),
        };
      }
    } catch {
      // Ignore malformed historical records.
    }
  }
  return null;
}

export function withoutBrandAssignmentRecords(notes?: string | null) {
  return (notes || "")
    .split("\n")
    .filter((line) => !line.startsWith(OWNER_ASSIGNMENT_MARKER))
    .join("\n")
    .trim();
}
