import type { BrandListItem } from "./brand-list";

export const WORK_REPLY_CHANNELS = ["Email", "SMS", "WhatsApp", "LinkedIn"] as const;
export type WorkReplyChannel = (typeof WORK_REPLY_CHANNELS)[number];

export type PendingWorkReply = {
  id: string;
  brandId: string;
  contactId: string | null;
  taskId: string | null;
  channel: WorkReplyChannel;
  threadId: string | null;
  preview: string;
  receivedAt: string | null;
  dueAt: string | null;
};

export type PendingWorkCall = {
  callId: string;
  taskId: string;
  brandId: string;
  submittedAt: string;
  preview: string;
  priority: string | null;
};

export type PendingWorkAssignment = {
  brandId: string;
  assignedAt: string;
};

export type WorkTarget = { id: string; at: string | null; dueAt?: string | null };
export type WorkBrand = {
  brand: BrandListItem;
  newAssignment: { target: WorkTarget } | null;
  channels: Partial<Record<WorkReplyChannel, { count: number; target: WorkTarget }>>;
  callReview: { count: number; target: WorkTarget } | null;
  preview: string;
  waitingSince: string | null;
  overdue: boolean;
  priority: number;
  priorityAt: string | null;
};
export type BrandWorkPayload = {
  brands: WorkBrand[];
  counts: { myWork: number; newAssignments: number; replies: number; callReview: number };
};

const key = (id: string) => id.replace(/-/g, "").toLowerCase();
const time = (value: string | null) => value ? Date.parse(value) || 0 : 0;

export function isAutomaticReply(subject: string, sender: string) {
  return /^(?:\s*(?:re|fw):\s*)*(?:auto(?:matic)?[ -]?(?:reply|response)|out of office|ooo\b|absence notification|vacation reply)\b/i.test(subject)
    || /^(?:no-?reply|auto-?reply)@/i.test(sender);
}

/** One pending thread is one AM action, however many inbound messages it contains. */
export function buildBrandWork(
  brands: BrandListItem[],
  replies: PendingWorkReply[],
  calls: PendingWorkCall[],
  nowMs = Date.now(),
  assignments: PendingWorkAssignment[] = [],
): BrandWorkPayload {
  const visible = new Map(brands.map((brand) => [key(brand.id), brand]));
  const grouped = new Map<string, { replies: PendingWorkReply[]; calls: PendingWorkCall[]; assignments: PendingWorkAssignment[] }>();
  for (const reply of replies) {
    const id = key(reply.brandId);
    if (!visible.has(id)) continue;
    const group = grouped.get(id) || { replies: [], calls: [], assignments: [] };
    group.replies.push(reply);
    grouped.set(id, group);
  }
  for (const call of calls) {
    const id = key(call.brandId);
    if (!visible.has(id)) continue;
    const group = grouped.get(id) || { replies: [], calls: [], assignments: [] };
    group.calls.push(call);
    grouped.set(id, group);
  }
  for (const assignment of assignments) {
    const id = key(assignment.brandId);
    if (!visible.has(id)) continue;
    const group = grouped.get(id) || { replies: [], calls: [], assignments: [] };
    group.assignments.push(assignment);
    grouped.set(id, group);
  }
  const rows: WorkBrand[] = [];
  for (const [id, group] of grouped) {
    const brand = visible.get(id)!;
    const channels: WorkBrand["channels"] = {};
    const uniqueIds = new Set<string>();
    const threads = new Map<string, { latest: PendingWorkReply; oldestAt: string | null; dueAt: string | null }>();
    for (const reply of group.replies) {
      if (uniqueIds.has(key(reply.id))) continue;
      uniqueIds.add(key(reply.id));
      const threadKey = `${reply.channel}:${reply.threadId || `${reply.contactId || ""}:${reply.taskId || reply.id}`}`;
      const existing = threads.get(threadKey);
      if (!existing) {
        threads.set(threadKey, { latest: reply, oldestAt: reply.receivedAt, dueAt: reply.dueAt });
      } else {
        if (time(reply.receivedAt) > time(existing.latest.receivedAt)) existing.latest = reply;
        if (reply.receivedAt && (!existing.oldestAt || reply.receivedAt < existing.oldestAt)) existing.oldestAt = reply.receivedAt;
        if (reply.dueAt && (!existing.dueAt || reply.dueAt < existing.dueAt)) existing.dueAt = reply.dueAt;
      }
    }
    const pendingThreads = [...threads.values()];
    const overdue = pendingThreads.some((thread) => !!thread.dueAt && time(thread.dueAt) < nowMs);
    for (const channel of WORK_REPLY_CHANNELS) {
      const matches = pendingThreads.filter((thread) => thread.latest.channel === channel);
      if (!matches.length) continue;
      matches.sort((a, b) => (a.oldestAt || "").localeCompare(b.oldestAt || ""));
      channels[channel] = {
        count: matches.length,
        target: { id: matches[0].latest.id, at: matches[0].oldestAt, dueAt: matches[0].dueAt },
      };
    }
    const callsById = new Map<string, PendingWorkCall>();
    for (const call of group.calls) {
      const id = key(call.callId);
      const existing = callsById.get(id);
      if (!existing || call.submittedAt < existing.submittedAt) callsById.set(id, call);
    }
    const uniqueCalls = [...callsById.values()]
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const assignment = group.assignments
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0];
    const latestReply = pendingThreads.map((thread) => thread.latest).sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
    const latestCall = [...uniqueCalls].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    const preview = latestReply && (!latestCall || (latestReply.receivedAt || "") >= latestCall.submittedAt)
      ? latestReply.preview : latestCall?.preview || (assignment ? "New assignment" : "");
    const priority = overdue ? 0 : assignment ? 1 : pendingThreads.length ? 2 : 3;
    const priorityAt = priority === 1
      ? assignment!.assignedAt
      : priority === 3
      ? group.calls.map((call) => call.submittedAt).sort()[0] || null
      : pendingThreads.filter((thread) => priority !== 0 || !!thread.dueAt && time(thread.dueAt) < nowMs)
        .map((thread) => thread.oldestAt).filter((value): value is string => !!value).sort()[0] || null;
    rows.push({
      brand,
      newAssignment: assignment ? { target: { id: assignment.brandId, at: assignment.assignedAt } } : null,
      channels,
      callReview: uniqueCalls.length ? { count: uniqueCalls.length, target: { id: uniqueCalls[0].taskId, at: uniqueCalls[0].submittedAt } } : null,
      preview,
      waitingSince: priorityAt,
      overdue,
      priority,
      priorityAt,
    });
  }
  rows.sort((a, b) => a.priority - b.priority || (a.priorityAt || "").localeCompare(b.priorityAt || "") || a.brand.name.localeCompare(b.brand.name));
  return {
    brands: rows,
    counts: {
      myWork: rows.length,
      newAssignments: rows.filter((row) => !!row.newAssignment).length,
      replies: rows.filter((row) => WORK_REPLY_CHANNELS.some((channel) => !!row.channels[channel])).length,
      callReview: rows.filter((row) => !!row.callReview).length,
    },
  };
}
