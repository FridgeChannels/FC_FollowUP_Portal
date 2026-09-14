import type { BrandActivity, BrandTask } from "../brand-list";

export function conversationThreadKey(
  item: Pick<BrandActivity, "threadId" | "contactId" | "channel">,
) {
  return item.threadId || `${item.contactId || ""}:${item.channel || ""}`;
}

export function isOpenTaskStatus(status?: string | null) {
  return status === "Pending" || status === "In Progress";
}

function activityTime(item: BrandActivity) {
  return item.recordedAt || item.createdAt || "";
}

function sortByTime(left: BrandActivity, right: BrandActivity) {
  return activityTime(left).localeCompare(activityTime(right)) || left.id.localeCompare(right.id);
}

export function groupConversationsByThread(activities: BrandActivity[]) {
  const groups = new Map<string, BrandActivity[]>();
  for (const item of activities) {
    if (!item.contactId || !item.channel) continue;
    const key = conversationThreadKey(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  for (const list of groups.values()) list.sort(sortByTime);
  return groups;
}

export function pickReplyTaskId(thread: BrandActivity[], tasks: BrandTask[]) {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const threadTasks = thread
    .map((item) => item.taskId)
    .filter((id): id is string => !!id)
    .map((id) => byId.get(id))
    .filter((item): item is BrandTask => !!item);
  const openOnThread = threadTasks.find((item) => isOpenTaskStatus(item.status));
  if (openOnThread) return openOnThread.id;
  for (let index = thread.length - 1; index >= 0; index -= 1) {
    const taskId = thread[index]?.taskId;
    if (taskId && byId.has(taskId)) return taskId;
  }
  return null;
}

function groupConversationsByContact(activities: BrandActivity[]) {
  const groups = new Map<string, BrandActivity[]>();
  for (const item of activities) {
    if (!item.contactId) continue;
    const list = groups.get(item.contactId) || [];
    list.push(item);
    groups.set(item.contactId, list);
  }
  for (const list of groups.values()) list.sort(sortByTime);
  return groups;
}

export function annotateTasksWithReplyInbox(tasks: BrandTask[], activities: BrandActivity[]) {
  const replyByTask = new Map<string, { preview: string; lastInboundAt: string | null }>();
  for (const items of groupConversationsByContact(activities).values()) {
    const pending = items.filter((item) => item.direction === "Inbound" && item.replyStatus !== "Replied");
    const latest =
      pending.filter((item) => item.replyStatus === "Needs Reply").at(-1) ||
      pending.at(-1);
    if (!latest) continue;
    const thread = items.filter((item) => conversationThreadKey(item) === conversationThreadKey(latest));
    const taskId = pickReplyTaskId(thread.length ? thread : items, tasks);
    if (!taskId) continue;
    replyByTask.set(taskId, {
      preview: latest.content || latest.subject || "Inbound reply",
      lastInboundAt: latest.createdAt,
    });
  }
  return tasks.map((task) => {
    const reply = replyByTask.get(task.id);
    if (!reply) {
      return { ...task, inboxStatus: null, preview: null, lastInboundAt: null };
    }
    return {
      ...task,
      inboxStatus: "Needs Reply" as const,
      preview: reply.preview,
      lastInboundAt: reply.lastInboundAt,
    };
  });
}
