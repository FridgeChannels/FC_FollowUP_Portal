import type { CallReviewStatus } from "./call-review-metadata";

export type CallReviewRound = {
  id: string;
  round: number;
  status: CallReviewStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  callerName?: string;
  callerEmail?: string;
  callerNote?: string;
  reason?: string;
  note?: string;
  callIds: string[];
};

const HISTORY_START = "[CALL_REVIEW_HISTORY_V1]";
const HISTORY_END = "[/CALL_REVIEW_HISTORY_V1]";

/** Escape so `[…]` markers are matched literally (not as character classes). */
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HISTORY_BLOCK = new RegExp(
  `\\n?${escapeRegExp(HISTORY_START)}\\n([\\s\\S]*?)\\n${escapeRegExp(HISTORY_END)}\\n?`,
  "g",
);

function normalizeRound(value: unknown): CallReviewRound | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CallReviewRound>;
  if (
    typeof item.id !== "string" ||
    typeof item.round !== "number" ||
    (item.status !== "Awaiting Review" && item.status !== "Qualified" && item.status !== "Unqualified")
  ) return null;
  return {
    id: item.id,
    round: item.round,
    status: item.status,
    submittedAt: item.submittedAt || undefined,
    reviewedAt: item.reviewedAt || undefined,
    reviewerName: item.reviewerName || undefined,
    reviewerEmail: item.reviewerEmail || undefined,
    callerName: item.callerName || undefined,
    callerEmail: item.callerEmail || undefined,
    callerNote: item.callerNote || undefined,
    reason: item.reason || undefined,
    note: item.note || undefined,
    callIds: Array.isArray(item.callIds)
      ? item.callIds.filter((callId): callId is string => typeof callId === "string" && !!callId.trim())
      : [],
  };
}

export function parseCallReviewHistory(notes?: string | null) {
  if (!notes) return [];
  // Prefer the first valid block — later duplicates may have wrongly inherited
  // every callId into an Unqualified round (see withInheritedCallIds + hydrate).
  HISTORY_BLOCK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HISTORY_BLOCK.exec(notes)) !== null) {
    try {
      const parsed = JSON.parse(match[1] || "[]");
      if (!Array.isArray(parsed)) continue;
      const rounds = parsed.map(normalizeRound).filter((item): item is CallReviewRound => !!item);
      if (rounds.length) return rounds;
    } catch {
      // try next block
    }
  }
  return [];
}

/** True when Notes contain more than one history marker (corrupt / raced writes). */
export function hasDuplicateCallReviewHistory(notes?: string | null) {
  if (!notes) return false;
  let count = 0;
  let index = 0;
  while ((index = notes.indexOf(HISTORY_START, index)) !== -1) {
    count += 1;
    index += HISTORY_START.length;
    if (count > 1) return true;
  }
  return false;
}

export function writeCallReviewHistory(notes: string | null | undefined, history: CallReviewRound[]) {
  HISTORY_BLOCK.lastIndex = 0;
  const cleanNotes = (notes || "").replace(HISTORY_BLOCK, "").trim();
  if (!history.length) return cleanNotes;
  const payload = JSON.stringify(history);
  return [cleanNotes, HISTORY_START, payload, HISTORY_END].filter(Boolean).join("\n");
}

function noteLine(notes: string | null | undefined, prefix: string) {
  return notes
    ?.split("\n")
    .find((line) => line.startsWith(prefix))
    ?.replace(prefix, "")
    .trim() || undefined;
}

function reviewerFromNotes(notes?: string | null) {
  if (!notes) return undefined;
  return notes.match(/AccountManager (.+?) marked round /)?.[1]?.trim()
    || notes.match(/已召回改派给[^（\n]+（([^）]+)）/)?.[1]?.trim()
    || undefined;
}

function notesIndicateUnqualifiedRecall(notes?: string | null) {
  if (!notes) return false;
  return /\bUnqualified\b/.test(notes) && /(召回|recalled)/i.test(notes);
}

function legacyRoundFromNotes(input: {
  id: string;
  notes?: string | null;
  endedAt?: string | null;
}, status: CallReviewStatus): CallReviewRound {
  return {
    id: `legacy-${input.id}`,
    round: 1,
    status,
    reviewedAt: input.endedAt || undefined,
    reviewerName: reviewerFromNotes(input.notes),
    reason: noteLine(input.notes, "Unqualified reason:"),
    note: noteLine(input.notes, "AccountManager note:"),
    callIds: [],
  };
}

export function historyFromTask(input: {
  id: string;
  notes?: string | null;
  endedAt?: string | null;
  callReviewStatus?: CallReviewStatus | null;
}) {
  const parsed = parseCallReviewHistory(input.notes);
  if (parsed.length) return parsed;
  if (input.callReviewStatus) return [legacyRoundFromNotes(input, input.callReviewStatus)];
  if (notesIndicateUnqualifiedRecall(input.notes)) {
    return [legacyRoundFromNotes(input, "Unqualified")];
  }
  return [];
}

export function nextReviewRound(history: CallReviewRound[]) {
  const last = history.at(-1);
  return last ? last.round + (last.status === "Unqualified" ? 1 : 0) : 1;
}

export function reviewRoundId(round: number) {
  return `review-${round}-${Date.now()}`;
}

export function unusedCallIds(history: CallReviewRound[], callIds: string[]) {
  const used = new Set(history.flatMap((round) => round.callIds));
  return callIds.filter((id) => !used.has(id));
}

export function withInheritedCallIds(history: CallReviewRound[], allCallIds: string[]) {
  const last = history.at(-1);
  // Only backfill Awaiting Review / Qualified rounds that were stored without callIds.
  // Never fill an Unqualified round — that would swallow post-recall Connected calls
  // and hide "Submit for review" for the next attempt.
  if (!last || last.callIds.length || !allCallIds.length) return history;
  if (last.status === "Unqualified") return history;
  const inherited = unusedCallIds(history.slice(0, -1), allCallIds);
  if (!inherited.length) return history;
  return history.map((round, index) => (
    index === history.length - 1 ? { ...round, callIds: inherited } : round
  ));
}

export type ReviewRoundDisplay = {
  round: number;
  status: CallReviewStatus | "In Progress";
  isCurrent: boolean;
  recalled: boolean;
  submittedAt?: string;
  reviewedAt?: string;
  reviewerName?: string;
  callerNote?: string;
  reason?: string;
  note?: string;
  callIds: string[];
};

function toDisplay(item: CallReviewRound, isCurrent: boolean, recalled = false): ReviewRoundDisplay {
  return {
    round: item.round,
    status: item.status,
    isCurrent,
    recalled,
    submittedAt: item.submittedAt,
    reviewedAt: item.reviewedAt,
    reviewerName: item.reviewerName,
    callerNote: item.callerNote,
    reason: item.reason,
    note: item.note,
    callIds: item.callIds,
  };
}

export function reviewRoundsForTask(history: CallReviewRound[]): {
  current: ReviewRoundDisplay;
  history: ReviewRoundDisplay[];
} {
  const last = history.at(-1);
  if (!last) {
    return {
      current: {
        round: 1,
        status: "In Progress",
        isCurrent: true,
        recalled: false,
        callIds: [],
      },
      history: [],
    };
  }

  if (last.status === "Unqualified") {
    return {
      current: {
        round: last.round + 1,
        status: "In Progress",
        isCurrent: true,
        recalled: true,
        callIds: [],
      },
      history: [...history].reverse().map((item) => toDisplay(item, false)),
    };
  }

  return {
    current: toDisplay(last, true),
    history: history
      .filter((item) => item.id !== last.id)
      .reverse()
      .map((item) => toDisplay(item, false)),
  };
}

export function isCallInCurrentRound(callId: string | undefined, history: CallReviewRound[]) {
  const last = history.at(-1);
  if (!last || last.status === "Unqualified") {
    if (!callId) return true;
    return !history.some((round) => round.callIds.includes(callId));
  }
  if (last.callIds.length) return !!callId && last.callIds.includes(callId);
  if (!callId) return true;
  return !history.some((round) => round.id !== last.id && round.callIds.includes(callId));
}

const CALL_CLUSTER_GAP_MS = 12 * 60 * 60 * 1000;

function clusterCallsByGap<T>(items: T[], getCreatedAt: (item: T) => string) {
  if (!items.length) return [];
  const sorted = [...items].sort((left, right) => getCreatedAt(left).localeCompare(getCreatedAt(right)));
  const clusters: T[][] = [[sorted[0]]];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = Date.parse(getCreatedAt(sorted[index - 1]));
    const next = Date.parse(getCreatedAt(sorted[index]));
    if (Number.isFinite(previous) && Number.isFinite(next) && next - previous > CALL_CLUSTER_GAP_MS) {
      clusters.push([sorted[index]]);
    } else {
      clusters.at(-1)!.push(sorted[index]);
    }
  }
  return clusters;
}

export function partitionRoundCalls<T>(
  items: T[],
  view: { current: ReviewRoundDisplay; history: ReviewRoundDisplay[] },
  getCallId: (item: T) => string | undefined,
  getCreatedAt: (item: T) => string,
) {
  const claimed = new Set<string>();
  const byRound = new Map<number, T[]>();
  const assign = (roundNumber: number, item: T) => {
    const id = getCallId(item);
    if (id) claimed.add(id);
    const current = byRound.get(roundNumber) || [];
    current.push(item);
    byRound.set(roundNumber, current);
  };
  const historyOldestFirst = [...view.history].sort((left, right) => left.round - right.round);
  const allRounds = [...historyOldestFirst, view.current];

  for (const round of allRounds) {
    if (!round.callIds.length) continue;
    for (const item of items) {
      const id = getCallId(item);
      if (id && round.callIds.includes(id) && !claimed.has(id)) assign(round.round, item);
    }
  }

  let leftover = items.filter((item) => {
    const id = getCallId(item);
    return !id || !claimed.has(id);
  }).sort((left, right) => getCreatedAt(left).localeCompare(getCreatedAt(right)));

  for (const round of historyOldestFirst) {
    if (round.callIds.length) continue;
    const end = round.reviewedAt || round.submittedAt;
    if (!end) continue;
    const matched = leftover.filter((item) => getCreatedAt(item) <= end);
    leftover = leftover.filter((item) => getCreatedAt(item) > end);
    for (const item of matched) assign(round.round, item);
  }

  const emptyHistory = historyOldestFirst.filter((round) => !round.callIds.length);
  if (view.current.recalled && leftover.length && emptyHistory.length) {
    const clusters = clusterCallsByGap(leftover, getCreatedAt);
    const target = emptyHistory.at(-1)!;
    if (clusters.length === 1) {
      for (const item of clusters[0]) assign(target.round, item);
      leftover = [];
    } else {
      for (const item of clusters.slice(0, -1).flat()) assign(target.round, item);
      leftover = clusters.at(-1) || [];
    }
  }

  for (const item of leftover) {
    // A submitted/reviewed round should only show the call the Caller picked.
    if (view.current.status !== "In Progress" && view.current.callIds.length) break;
    assign(view.current.round, item);
  }

  return {
    current: byRound.get(view.current.round) || [],
    history: view.history.map((round) => ({ round, calls: byRound.get(round.round) || [] })),
  };
}
