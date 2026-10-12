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

function parseBrandAssignment(line: string): BrandAssignment | null {
  if (!line.startsWith(OWNER_ASSIGNMENT_MARKER)) return null;
  try {
    const value = JSON.parse(line.slice(OWNER_ASSIGNMENT_MARKER.length)) as Partial<BrandAssignment>;
    if (
      typeof value.assignedAt !== "string"
      || !Number.isFinite(Date.parse(value.assignedAt))
      || (typeof value.ownerId !== "string" && value.ownerId !== null)
    ) {
      return null;
    }
    const handledAt = typeof value.handledAt === "string" && Number.isFinite(Date.parse(value.handledAt))
      ? value.handledAt
      : null;
    return {
      ownerId: value.ownerId ?? null,
      assignedAt: value.assignedAt,
      ...(handledAt ? { handledAt } : {}),
    };
  } catch {
    // Ignore malformed historical records.
    return null;
  }
}

/** Returns valid assignment events newest first, including unassignments. */
export function brandAssignmentHistory(notes?: string | null): BrandAssignment[] {
  return (notes || "")
    .split("\n")
    .reverse()
    .flatMap((line) => {
      const assignment = parseBrandAssignment(line);
      return assignment ? [assignment] : [];
    });
}

/** Returns the latest valid assignment event, including a later unassignment. */
export function latestBrandAssignment(notes?: string | null): BrandAssignment | null {
  return brandAssignmentHistory(notes)[0] || null;
}

export function withoutBrandAssignmentRecords(notes?: string | null) {
  return (notes || "")
    .split("\n")
    .filter((line) => !line.startsWith(OWNER_ASSIGNMENT_MARKER))
    .join("\n")
    .trim();
}
