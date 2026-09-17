import { FOLLOW_UP_STATUSES, HANDLING_MODES, type BrandActivity, type BrandTask } from "../brand-list";
import { conversationCpRelation, resolveCheckpoint } from "./cps";
import { createPage, propertyText, retrievePage, richText, updatePage } from "./client";
import { getFollowupConversationDbId, getFollowupTaskDbId } from "./config";
import {
  easternDateOnly,
  easternDateTimeIso,
  easternMinuteOfDayCeil,
} from "../scheduling-engine/calendar";
import { notionScheduledAtProperty } from "./scheduled-at";
import { chooseConversationThreadId } from "./conversation-thread";
import { listFollowupConversations } from "./conversations";
import { asExtendedParameters } from "./extended-parameters";
import { retrieveOwner } from "./owners";
import {
  annotateTasksWithReplyInbox,
  groupConversationsByThread,
  isOpenTaskStatus,
  tasksNeedingReplyInboxSync,
} from "./reply-inbox";
import { pickReplyTaskForChannel } from "./reply-target";
import {
  listContactBombTasksLite,
  listFollowupTasks,
  listFollowupTasksByBomb,
  retrieveFollowupTask,
} from "./tasks";

const TASK_STATUSES = new Set(["Pending", "In Progress", "Completed", "Failed", "Cancelled"]);
const CALL_RESULTS = new Set(["Connected", "No Answer", "Voicemail", "Declined", "Invalid Number"]);

const CHANNELS = new Set(["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"]);

function uniqueRecordId(prefix: string, channel: string) {
  const token =
    globalThis.crypto?.randomUUID?.().replace(/-/g, "") ||
    `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${token}-${channel}`;
}

/** Fresh Portal Thread ID (THR-…) for a new conversation line on a channel. */
export function newConversationThreadId(channel: string) {
  return uniqueRecordId("THR", channel);
}

export async function resolveConversationThread(
  contactId: string,
  channel: string,
  preferredThreadId?: string | null,
  existing?: BrandActivity[],
  options?: { forceNew?: boolean },
) {
  // Explicit / forceNew paths skip listing: cold inbound and OmniReach run threads
  // must not collapse onto the oldest contact+channel THR-.
  const listed = options?.forceNew || preferredThreadId?.trim()
    ? []
    : existing ?? (await listFollowupConversations([contactId]));
  return {
    threadId: chooseConversationThreadId({
      channel,
      preferredThreadId,
      existing: listed,
      forceNew: options?.forceNew,
      allocate: (item) => uniqueRecordId("THR", item),
    }),
    messageId: uniqueRecordId("MSG", channel),
  };
}

function asStatus(value?: string | null) {
  return FOLLOW_UP_STATUSES.includes(value as (typeof FOLLOW_UP_STATUSES)[number])
    ? value
    : null;
}

function asHandlingMode(value?: string | null) {
  return HANDLING_MODES.includes(value as (typeof HANDLING_MODES)[number])
    ? value
    : null;
}

export async function updateFollowupClient(
  pageId: string,
  patch: {
    currentCpId?: string | null;
    ownerId?: string | null;
    status?: string | null;
    handlingMode?: string | null;
    notes?: string | null;
  },
) {
  const properties: Record<string, unknown> = {};

  if (patch.currentCpId !== undefined) {
    if (!patch.currentCpId) {
      properties["Current CP"] = { relation: [] };
    } else {
      const checkpoint = await resolveCheckpoint(patch.currentCpId);
      if (!checkpoint) throw new Error("Unknown Current CP");
      properties["Current CP"] = { relation: [{ id: checkpoint.id }] };
    }
  }

  if (patch.ownerId !== undefined) {
    if (patch.ownerId) {
      const owner = await retrieveOwner(patch.ownerId);
      if (!owner) throw new Error("Unknown Owner");
    }
    properties.Owner = {
      relation: patch.ownerId ? [{ id: patch.ownerId }] : [],
    };
  }

  if (patch.status !== undefined) {
    const status = asStatus(patch.status);
    if (!status) throw new Error("Invalid Follow-up Status");
    properties["Follow-up Status"] = { status: { name: status } };
  }

  if (patch.handlingMode !== undefined) {
    const handlingMode = asHandlingMode(patch.handlingMode);
    if (!handlingMode) throw new Error("Invalid Handling Mode");
    properties["Handling Mode"] = { select: { name: handlingMode } };
  }

  if (patch.notes !== undefined) {
    properties.Notes = { rich_text: richText(patch.notes || "") };
  }

  if (!Object.keys(properties).length) {
    throw new Error("No brand fields to update");
  }

  return updatePage(pageId, properties);
}

export async function markFollowupClientEngaged(
  pageId: string,
  options?: {
    handlingMode?: "Automated" | "Human";
    note?: string;
    knownStatus?: string | null;
    knownHandlingMode?: string | null;
  },
) {
  const knownStatus = options?.knownStatus;
  const knownMode = options?.knownHandlingMode;
  const canSkipRetrieve =
    knownStatus !== undefined &&
    (options?.handlingMode === undefined || knownMode !== undefined);

  let currentStatus = knownStatus ?? null;
  let currentMode = knownMode ?? null;
  let existingNotes: string | null = null;
  let page = null as Awaited<ReturnType<typeof retrievePage>> | null;

  if (!canSkipRetrieve) {
    page = await retrievePage(pageId);
    const properties = page.properties || {};
    currentStatus = propertyText(properties["Follow-up Status"]);
    currentMode = propertyText(properties["Handling Mode"]);
    existingNotes = propertyText(properties.Notes) || null;
  } else if (knownStatus === "In Progress" && (!options?.handlingMode || knownMode === options.handlingMode)) {
    return null;
  }

  const extras: string[] = [];
  const patch: {
    status?: string | null;
    handlingMode?: string | null;
    notes?: string | null;
  } = {};

  if (currentStatus !== "In Progress") {
    patch.status = "In Progress";
    extras.push("状态更新为 In Progress。");
  }
  if (options?.handlingMode && currentMode !== options.handlingMode) {
    patch.handlingMode = options.handlingMode;
    extras.push(`跟进方式更新为 ${options.handlingMode}。`);
  }
  if (!extras.length) return page;

  if (existingNotes === null && page === null) {
    page = await retrievePage(pageId);
    existingNotes = propertyText(page.properties?.Notes) || null;
  }

  patch.notes = [
    existingNotes,
    options?.note || null,
    ...extras,
  ]
    .filter(Boolean)
    .join("\n");
  return updateFollowupClient(pageId, patch);
}

export async function createOutboundConversation(input: {
  brandName: string;
  contactId: string;
  contactName: string;
  channel: string;
  content: string;
  subject?: string | null;
  sender?: string | null;
  taskId?: string;
  threadId?: string | null;
  messageId?: string | null;
  callResult?: string | null;
  interactionAt?: string | null;
  /** Plan send time from the scheduling engine (same format as TaskDB Scheduled At). */
  scheduledAt?: string | null;
  notes?: string;
  titleSuffix?: string;
  direction?: "Inbound" | "Outbound";
  cpId?: string | null;
  cpAtInteraction?: string | null;
  extendedParameters?: string | null;
  existingConversations?: BrandActivity[];
  /** New OmniReach / non-reply outbound opens a fresh Thread so CP timelines stay independent. */
  forceNewThread?: boolean;
}) {
  if (!CHANNELS.has(input.channel)) throw new Error("Invalid channel");
  const content = input.content.trim();
  if (!content) throw new Error("Message content is required");

  const suffix = input.titleSuffix || "Pending";
  const title = `${input.brandName} — ${input.contactName} — ${input.channel} — ${suffix}`;
  const subject =
    input.subject?.trim() ||
    (input.channel === "Email" ? content.split("\n")[0].slice(0, 120) : "");
  const thread = await resolveConversationThread(
    input.contactId,
    input.channel,
    input.threadId,
    input.existingConversations,
    { forceNew: !!input.forceNewThread },
  );
  if (input.messageId?.trim()) {
    thread.messageId = input.messageId.trim();
  }
  const properties: Record<string, unknown> = {
    "Conversation Record": { title: richText(title) },
    "Conversation Record ID": { rich_text: richText(`PORTAL-${Date.now()}`) },
    "Follow-up Contact": { relation: [{ id: input.contactId }] },
    Channel: { select: { name: input.channel } },
    Direction: { select: { name: input.direction || "Outbound" } },
    Subject: { rich_text: subject ? richText(subject) : [] },
    Content: { rich_text: richText(content) },
    Sender: { rich_text: input.sender ? richText(input.sender) : [] },
    Notes: { rich_text: richText(input.notes || "人工消息，尚未实际发送。") },
    "Thread ID": { rich_text: richText(thread.threadId) },
    "Message ID": { rich_text: richText(thread.messageId) },
  };
  if (input.taskId) {
    properties["Follow-up Task"] = { relation: [{ id: input.taskId }] };
  }
  if (input.callResult && CALL_RESULTS.has(input.callResult)) {
    properties["Call Result"] = { rich_text: richText(input.callResult) };
  }
  if (input.interactionAt) {
    properties["Interaction At"] = { date: { start: input.interactionAt } };
  }
  if (input.scheduledAt?.trim()) {
    properties["Scheduled At"] = notionScheduledAtProperty(input.scheduledAt.trim());
  }
  const cp = await conversationCpRelation(input.cpId || input.cpAtInteraction);
  if (cp) properties.CP = cp;
  const inherited = input.extendedParameters?.trim();
  if (inherited) {
    let encoded = inherited;
    try {
      encoded = asExtendedParameters(inherited) || inherited;
    } catch {
      encoded = inherited;
    }
    properties["Extended Parameters"] = { rich_text: richText(encoded) };
  }

  return createPage(getFollowupConversationDbId(), properties);
}

export async function cancelUnsentBombSiblingTasks(task: BrandTask) {
  if (!task.sourceBombId || !task.contactId) return [];
  const siblings = (await listFollowupTasks([task.contactId])).filter((item) =>
    item.id !== task.id &&
    item.sourceBombId === task.sourceBombId &&
    item.contactId === task.contactId &&
    (!task.omniReachRunId || item.omniReachRunId === task.omniReachRunId) &&
    isOpenTaskStatus(item.status),
  );
  const endedAt = new Date().toISOString();
  await Promise.all(
    siblings.map((item) =>
      updateFollowupTask(item.id, {
        status: "Cancelled",
        endedAt,
        notes: [item.notes, "客户已回复，后续未发出渠道已取消。"].filter(Boolean).join("\n"),
      }),
    ),
  );
  return siblings;
}

export async function cancelScheduledBombTasks(bombId: string) {
  const scheduled = (await listFollowupTasksByBomb(bombId)).filter(
    (task) => task.status === "Pending",
  );
  if (!scheduled.length) return [];

  const endedAt = new Date().toISOString();
  await Promise.all(
    scheduled.map((task) =>
      updateFollowupTask(task.id, {
        status: "Cancelled",
        endedAt,
        notes: [task.notes, "OmniReach 已停止，未执行的排班任务已取消。"]
          .filter(Boolean)
          .join("\n"),
      }),
    ),
  );
  return scheduled;
}

export async function cancelOpenBombTasks(input: {
  brandId: string;
  bombId: string;
  contactId: string;
  omniReachRunId?: string | null;
  knownStatus?: string | null;
  knownHandlingMode?: string | null;
}) {
  const listed = await listContactBombTasksLite(input.contactId);
  const matching = listed.filter((task) =>
    task.sourceBombId === input.bombId &&
    (!input.omniReachRunId || task.omniReachRunId === input.omniReachRunId),
  );
  if (!matching.length) {
    return { matched: false as const, cancelledTaskIds: [] as string[] };
  }

  const open = matching.filter((task) => isOpenTaskStatus(task.status));
  const endedAt = new Date().toISOString();
  if (open.length) {
    await Promise.all(
      open.map((task) =>
        updateFollowupTask(task.id, {
          status: "Cancelled",
          endedAt,
          notes: [task.notes, "OmniReach 已由用户中止，未执行任务已取消。"].filter(Boolean).join("\n"),
        }),
      ),
    );
  }

  await markFollowupClientEngaged(input.brandId, {
    handlingMode: "Human",
    note: "OmniReach 已中止，跟进方式改为 Human。",
    knownStatus: input.knownStatus,
    knownHandlingMode: input.knownHandlingMode,
  });

  return {
    matched: true as const,
    cancelledTaskIds: open.map((task) => task.id),
  };
}

export async function updateFollowupTask(
  pageId: string,
  patch: {
    status?: string;
    ownerId?: string | null;
    notes?: string | null;
    endedAt?: string | null;
    priority?: string | null;
    callReviewStatus?: "Awaiting Review" | "Qualified" | "Unqualified" | null;
  },
) {
  const properties: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!TASK_STATUSES.has(patch.status)) throw new Error("Invalid Task Status");
    properties["Task Status"] = { status: { name: patch.status } };
  }
  if (patch.ownerId !== undefined) {
    if (patch.ownerId) {
      const owner = await retrieveOwner(patch.ownerId);
      if (!owner) throw new Error("Unknown Owner");
    }
    properties.Owner = { relation: patch.ownerId ? [{ id: patch.ownerId }] : [] };
  }
  if (patch.notes !== undefined) {
    properties.Notes = { rich_text: richText(patch.notes || "") };
  }
  if (patch.endedAt !== undefined) {
    properties["Ended At"] = patch.endedAt ? { date: { start: patch.endedAt } } : { date: null };
  }
  if (patch.priority !== undefined) {
    properties.Priority = patch.priority ? { select: { name: patch.priority } } : { select: null };
  }
  if (patch.callReviewStatus !== undefined) {
    properties["Call Review Status"] = patch.callReviewStatus
      ? { select: { name: patch.callReviewStatus } }
      : { select: null };
  }
  if (!Object.keys(properties).length) throw new Error("No task fields to update");
  return updatePage(pageId, properties);
}

export async function createFollowupTask(input: {
  brandName: string;
  contactId: string;
  contactName: string;
  ownerId: string;
  channel: string;
  scheduledAt: string;
  priority: string;
  creationMethod: string;
  templateId?: string;
  sourceBombId?: string;
  omniReachRunId?: string;
  notes?: string;
}) {
  const properties: Record<string, unknown> = {
    "Follow-up Task": {
      title: richText(`${input.brandName} — ${input.contactName} — ${input.channel} — ${input.scheduledAt}`),
    },
    "Follow-up Contact": { relation: [{ id: input.contactId }] },
    Owner: { relation: [{ id: input.ownerId }] },
    "Creation Method": { select: { name: input.creationMethod } },
    "Scheduled At": notionScheduledAtProperty(input.scheduledAt),
    Priority: { select: { name: input.priority } },
    Channel: { select: { name: input.channel } },
    "Task Status": { status: { name: "Pending" } },
    Notes: { rich_text: richText(input.notes || "") },
  };
  if (input.templateId) {
    properties.Template = { relation: [{ id: input.templateId }] };
  }
  if (input.sourceBombId) {
    properties["Source Bomb"] = { relation: [{ id: input.sourceBombId }] };
  }
  if (input.omniReachRunId) {
    properties["OmniReach Run Id"] = { rich_text: richText(input.omniReachRunId) };
  }
  return createPage(getFollowupTaskDbId(), properties);
}

function scheduledAtNow() {
  const now = new Date();
  return easternDateTimeIso(easternDateOnly(now), easternMinuteOfDayCeil(now));
}

function pickThreadCp(
  activities: BrandActivity[],
  input: { channel: string; threadId?: string | null; taskId?: string | null },
) {
  const threadId = input.threadId?.trim();
  const related = activities.filter((item) => {
    if (!item.cpId && !item.cpAtInteraction) return false;
    if (item.channel && item.channel !== input.channel) return false;
    if (threadId && item.threadId) return item.threadId === threadId;
    if (input.taskId && item.taskId) return item.taskId === input.taskId;
    return false;
  }).sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || ""));
  return (
    related.find((item) => item.direction === "Inbound") ||
    related[0] ||
    null
  );
}

function pickThreadExtendedParameters(
  activities: BrandActivity[],
  input: { channel: string; threadId?: string | null; taskId?: string | null },
) {
  const threadId = input.threadId?.trim();
  const related = activities.filter((item) => {
    if (item.channel && item.channel !== input.channel) return false;
    if (threadId && item.threadId) return item.threadId === threadId;
    if (input.taskId && item.taskId) return item.taskId === input.taskId;
    return false;
  }).sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
  return (
    related.find((item) => item.direction === "Inbound" && item.extendedParameters)?.extendedParameters ||
    related.find((item) => item.extendedParameters)?.extendedParameters ||
    null
  );
}

export async function createHumanOutbound(input: {
  brandName: string;
  brandOwnerId?: string | null;
  contactId: string;
  contactName: string;
  channel: string;
  content: string;
  subject?: string | null;
  sender?: string | null;
  existingTaskId?: string;
  threadId?: string | null;
  cpId?: string | null;
  cpAtInteraction?: string | null;
}) {
  const isReply = !!(input.threadId?.trim() || input.existingTaskId);
  const threadActivities = await listFollowupConversations([input.contactId]);
  const ownerId = input.brandOwnerId;
  if (!ownerId) throw new Error("Owner is required to create a follow-up task");
  if (input.channel === "Email" && !input.subject?.trim()) {
    throw new Error("object (email subject) is required for Email");
  }
  const scheduledAt = scheduledAtNow();
  const created = await createFollowupTask({
    brandName: input.brandName,
    contactId: input.contactId,
    contactName: input.contactName,
    ownerId,
    channel: input.channel,
    scheduledAt,
    priority: "P0",
    creationMethod: "Manual",
    notes: isReply
      ? "人工追加回复，尚未实际发送。"
      : "人工发送消息，尚未实际发送。",
  });
  const taskId = created.id;
  const threadCp = isReply
    ? pickThreadCp(threadActivities, {
        channel: input.channel,
        threadId: input.threadId,
        taskId: input.existingTaskId,
      })
    : null;
  const page = await createOutboundConversation({
    brandName: input.brandName,
    contactId: input.contactId,
    contactName: input.contactName,
    channel: input.channel,
    content: input.content,
    subject: input.subject,
    sender: input.sender,
    taskId,
    threadId: input.threadId,
    cpId: threadCp?.cpId || input.cpId,
    cpAtInteraction: threadCp?.cpAtInteraction || input.cpAtInteraction,
    extendedParameters: isReply
      ? pickThreadExtendedParameters(threadActivities, {
          channel: input.channel,
          threadId: input.threadId,
          taskId: input.existingTaskId,
        })
      : null,
    existingConversations: threadActivities,
    scheduledAt,
    notes: isReply
      ? "人工追加回复，尚未实际发送。"
      : "人工消息，尚未实际发送。",
    forceNewThread: !isReply,
  });
  // New task has no Conversations yet; conversation already links Follow-up Task on create.
  await updatePage(taskId, {
    Conversations: { relation: [{ id: page.id }] },
  });
  if (isReply) {
    await markInboundsReplied(
      {
        contactId: input.contactId,
        channel: input.channel,
        taskId: input.existingTaskId,
        threadId: input.threadId,
      },
      threadActivities,
    );
  }
  return { conversationId: page.id, taskId };
}

export async function markInboundsReplied(
  input: {
    contactId: string;
    channel: string;
    taskId?: string | null;
    threadId?: string | null;
  },
  existingActivities?: BrandActivity[],
) {
  const activities = existingActivities ?? (await listFollowupConversations([input.contactId]));
  const targets = activities.filter((item) => {
    if (item.direction !== "Inbound") return false;
    if (item.replyStatus === "Replied") return false;
    if (item.channel && item.channel !== input.channel) return false;
    if (input.threadId?.trim() && item.threadId) return item.threadId === input.threadId.trim();
    if (input.taskId && item.taskId) return item.taskId === input.taskId;
    return false;
  });
  if (!targets.length) return;
  await Promise.all(
    targets.map((item) =>
      updatePage(item.id, {
        "Reply Status": { select: { name: "Replied" } },
      }),
    ),
  );
}

export async function linkConversationToTask(conversationId: string, taskId: string) {
  await updatePage(conversationId, {
    "Follow-up Task": { relation: [{ id: taskId }] },
  });
  const task = await retrieveFollowupTask(taskId);
  const ids = [...new Set([...task.conversationIds, conversationId])];
  await updatePage(taskId, {
    Conversations: { relation: ids.map((id) => ({ id })) },
  });
}

export async function resolveReplyTask(input: {
  brandName: string;
  brandOwnerId?: string | null;
  contactId: string;
  contactName: string;
  channel: string;
  existingTaskId?: string;
}) {
  if (input.existingTaskId) {
    const existing = await retrieveFollowupTask(input.existingTaskId).catch(() => null);
    if (existing && existing.channel === input.channel) return existing.id;
  }
  const tasks = await listFollowupTasks([input.contactId]);
  const picked = pickReplyTaskForChannel(tasks, input.contactId, input.channel);
  if (picked && (isOpenTaskStatus(picked.status) || picked.sourceBombId)) return picked.id;
  const ownerId = input.brandOwnerId || tasks.find((item) => item.ownerId)?.ownerId;
  if (!ownerId) throw new Error("Owner is required to create a follow-up task");
  const created = await createFollowupTask({
    brandName: input.brandName,
    contactId: input.contactId,
    contactName: input.contactName,
    ownerId,
    channel: input.channel,
    scheduledAt: scheduledAtNow(),
    priority: "P0",
    creationMethod: "Manual",
    notes: "客户回复待处理，尚未人工回复。",
  });
  return created.id;
}

async function backfillUnlinkedInbounds(tasks: BrandTask[], activities: BrandActivity[]) {
  const created: BrandTask[] = [];
  for (const thread of groupConversationsByThread(activities).values()) {
    const latest = thread.at(-1);
    if (!latest || latest.direction !== "Inbound" || latest.taskId) continue;
    const sibling = tasks.find((item) => item.contactId === latest.contactId);
    if (!sibling?.contactId || !latest.channel) continue;
    const ownerId = sibling.brandOwnerId || sibling.ownerId;
    if (!ownerId) continue;
    const taskId = await resolveReplyTask({
      brandName: sibling.brandName || "Untitled Client",
      brandOwnerId: ownerId,
      contactId: sibling.contactId,
      contactName: sibling.contactName || "KeyPerson",
      channel: latest.channel,
    });
    await linkConversationToTask(latest.id, taskId);
    if (!tasks.some((item) => item.id === taskId) && !created.some((item) => item.id === taskId)) {
      created.push(await retrieveFollowupTask(taskId));
    }
  }
  return created;
}

export async function syncReplyInbox(
  tasks: BrandTask[],
  options: { backfill?: boolean } = {},
) {
  const annotateTargets = tasksNeedingReplyInboxSync(tasks);
  const contactIds = [
    ...new Set(annotateTargets.map((item) => item.contactId).filter((id): id is string => !!id)),
  ];

  const clearInbox = (task: BrandTask): BrandTask => ({
    ...task,
    inboxStatus: null,
    preview: null,
    lastInboundAt: null,
  });

  if (!contactIds.length) {
    return tasks.map(clearInbox);
  }

  let activities = await listFollowupConversations(contactIds);
  let extras: BrandTask[] = [];
  if (options.backfill) {
    extras = await backfillUnlinkedInbounds(annotateTargets, activities);
    if (extras.length) {
      activities = await listFollowupConversations(contactIds);
    }
  }

  const annotated = annotateTasksWithReplyInbox([...annotateTargets, ...extras], activities);
  const byId = new Map(annotated.map((item) => [item.id, item]));
  const merged = tasks.map((task) => byId.get(task.id) || clearInbox(task));
  for (const extra of extras) {
    const hit = byId.get(extra.id);
    if (hit && !merged.some((item) => item.id === hit.id)) merged.push(hit);
  }
  return merged;
}
