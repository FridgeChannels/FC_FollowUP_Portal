import type { Candidate, ContactFollowUpStatus, CreationMethod, Priority } from "./types.ts";

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

export function resolveTaskPriority(
  creationMethod: CreationMethod,
  followUpStatus: ContactFollowUpStatus,
): Priority {
  if (creationMethod === "Manual") return "P0";
  return followUpStatus === "In Progress" ? "P1" : "P2";
}

export function sortCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((left, right) => {
    const byTask = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (byTask !== 0) return byTask;
    const byClient = PRIORITY_RANK[left.clientPriority] - PRIORITY_RANK[right.clientPriority];
    if (byClient !== 0) return byClient;
    return left.sourceIndex - right.sourceIndex;
  });
}
