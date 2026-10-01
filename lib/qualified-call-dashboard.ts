import type { BrandTask } from "./brand-list";

export type QualifiedCallDashboardItem = {
  taskId: string;
  taskTitle: string;
  taskDate: string | null;
  brandName: string | null;
  qualifiedAt: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  callId: string | null;
};

export type QualifiedCallDashboardCaller = {
  id: string | null;
  email: string | null;
  name: string;
  total: number;
  calls: QualifiedCallDashboardItem[];
};

export type QualifiedCallDashboardDay = {
  date: string;
  total: number;
  callers: QualifiedCallDashboardCaller[];
};

function dayInTimeZone(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function latestQualifiedRound(task: BrandTask) {
  return [...(task.callReviewHistory || [])]
    .filter((round) => round.status === "Qualified")
    .sort((left, right) => (left.reviewedAt || "").localeCompare(right.reviewedAt || ""))
    .at(-1);
}

/**
 * Groups only the task's current Qualified state. A later Unqualified decision
 * clears Call Qualified At and keeps that task out of this KPI by design.
 */
export function buildQualifiedCallDashboard(
  tasks: BrandTask[],
  timeZone: string,
): QualifiedCallDashboardDay[] {
  const byDay = new Map<string, Map<string, QualifiedCallDashboardCaller>>();

  for (const task of tasks) {
    if (task.channel !== "Phone" || task.callReviewStatus !== "Qualified" || !task.callQualifiedAt) continue;
    const day = dayInTimeZone(task.callQualifiedAt, timeZone);
    if (!day) continue;
    const round = latestQualifiedRound(task);
    const callerEmail = round?.callerEmail?.trim().toLowerCase() || null;
    const callerId = callerEmail || task.ownerId || "unassigned";
    // Review history captures the person who placed this specific call. Use it
    // for the label even if the task has since been reassigned.
    const callerName = round?.callerName?.trim() || task.ownerName?.trim() || "Unassigned caller";
    const item: QualifiedCallDashboardItem = {
      taskId: task.id,
      taskTitle: task.title,
      // Keep every exported task date aligned with the Dashboard's Qualified
      // day grouping. A week report must not split one day by task schedule.
      taskDate: day,
      brandName: task.brandName,
      qualifiedAt: task.callQualifiedAt,
      reviewerName: round?.reviewerName || null,
      reviewerEmail: round?.reviewerEmail || null,
      callId: round?.callIds[0] || null,
    };
    const callers = byDay.get(day) || new Map<string, QualifiedCallDashboardCaller>();
    const caller = callers.get(callerId) || {
      id: callerId === "unassigned" ? null : callerId,
      email: callerEmail,
      name: callerName,
      total: 0,
      calls: [],
    };
    caller.total += 1;
    caller.calls.push(item);
    callers.set(callerId, caller);
    byDay.set(day, callers);
  }

  return [...byDay.entries()]
    .map(([date, callers]) => {
      const entries = [...callers.values()]
        .map((caller) => ({
          ...caller,
          calls: caller.calls.sort((left, right) => right.qualifiedAt.localeCompare(left.qualifiedAt)),
        }))
        .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
      return {
        date,
        total: entries.reduce((sum, caller) => sum + caller.total, 0),
        callers: entries,
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}
