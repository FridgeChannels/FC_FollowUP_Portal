import type { BrandContact } from "../brand-list";
import {
  createPage,
  firstRelationId,
  retrievePage,
  richText,
  titleFromProperties,
} from "./client";
import { getFollowupConversationDbId } from "./config";
import { listFollowupContacts } from "./contacts";
import {
  findConversationsByMessageId,
  findConversationsByThreadId,
  listFollowupConversations,
} from "./conversations";
import { mapFollowupClientPage } from "./followup-clients";
import {
  cancelUnsentBombSiblingTasks,
  linkConversationToTask,
  markFollowupClientEngaged,
  resolveConversationThread,
  resolveReplyTask,
} from "./followup-writes";
import { annotateTasksWithReplyInbox } from "./reply-inbox";
import { outboundMessageIsSent, pickOutboundCandidate, taskIsSent } from "./reply-sent-guard";
import { resolveCurrentContactForBrand, resolveReplyTargetByBrandName, resolveReplyTargetByThreadId } from "./reply-target";
import { retrieveFollowupTask } from "./tasks";

const CHANNELS = new Set(["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"]);
const CALL_RESULTS = new Set(["Connected", "No Answer", "Voicemail", "Declined", "Invalid Number"]);

export class InboundReplyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type InboundReplyInput = {
  channel?: string;
  content?: string;
  occurredAt?: string;
  sender?: string | null;
  subject?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  sourceUrl?: string | null;
  inReplyToMessageId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  callResult?: string | null;
  notes?: string | null;
};

export type InboundReplyResult = {
  duplicate: boolean;
  conversationId: string;
  threadId: string | null;
  messageId: string | null;
  contactId: string;
  taskId: string;
  brandId: string;
  inboxStatus: "Needs Reply";
};

type ResolvedTarget = {
  brandId: string;
  brandName: string;
  brandOwnerId: string | null;
  contactId: string;
  contactName: string;
  taskId?: string;
  existingThreadId?: string | null;
};

export function contactMatchesReplySender(
  contact: Pick<BrandContact, "email" | "phone" | "linkedin">,
  channel: string,
  sender: string,
) {
  const value = sender.trim();
  if (!value) return false;
  if (channel === "Email") {
    return (contact.email || "").trim().toLowerCase() === value.toLowerCase();
  }
  if (channel === "LinkedIn") {
    return !!contact.linkedin && normalizeLinkedin(contact.linkedin) === normalizeLinkedin(value);
  }
  const left = normalizePhone(contact.phone || "");
  const right = normalizePhone(value);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeLinkedin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const match = trimmed.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return (match?.[1] || trimmed).toLowerCase();
}

function asChannel(value?: string) {
  if (!value || !CHANNELS.has(value)) {
    throw new InboundReplyError("Invalid channel", 400);
  }
  return value;
}

function asOccurredAt(value?: string) {
  if (!value?.trim()) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InboundReplyError("Invalid occurredAt", 400);
  return date.toISOString();
}

function asContent(channel: string, content?: string, callResult?: string | null) {
  const text = content?.trim() || "";
  if (channel === "Phone") return text || callResult?.trim() || "Inbound call";
  if (!text) throw new InboundReplyError("Message content is required", 400);
  return text;
}

function asCallResult(channel: string, value?: string | null) {
  const result = value?.trim() || "";
  if (!result) return null;
  if (!CALL_RESULTS.has(result)) throw new InboundReplyError("Invalid callResult", 400);
  if (channel !== "Phone") throw new InboundReplyError("callResult is only valid for Phone", 400);
  return result;
}

function asSourceUrl(value?: string | null) {
  const url = value?.trim() || "";
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
    return url;
  } catch {
    throw new InboundReplyError("Invalid sourceUrl", 400);
  }
}

async function loadContactContext(contactId: string): Promise<ResolvedTarget> {
  const contactPage = await retrievePage(contactId).catch(() => null);
  if (!contactPage) throw new InboundReplyError("Contact not found", 404);
  const brandId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
  if (!brandId) throw new InboundReplyError("Contact has no Follow-up Client", 422);
  const brand = await mapFollowupClientPage(await retrievePage(brandId));
  const contacts = await listFollowupContacts(brandId, [contactId]);
  const contact = contacts.find((item) => item.id === contactId);
  return {
    brandId: brand.id,
    brandName: brand.name,
    brandOwnerId: brand.ownerId,
    contactId,
    contactName: contact?.name || titleFromProperties(contactPage.properties) || "KeyPerson",
  };
}

async function resolveBySender(brandId: string, channel: string, sender: string) {
  const contacts = await listFollowupContacts(brandId);
  const matches = contacts.filter((item) => contactMatchesReplySender(item, channel, sender));
  if (matches.length > 1) {
    throw new InboundReplyError("Multiple contacts match this sender", 409);
  }
  if (!matches[0]) {
    throw new InboundReplyError("No Follow-up Contact matches this sender", 422);
  }
  return loadContactContext(matches[0].id);
}

async function resolveInboundReplyTarget(input: InboundReplyInput, channel: string) {
  if (input.taskId && input.threadId?.trim()) {
    const resolved = await resolveReplyTargetByThreadId(input.threadId, input.taskId);
    if (!resolved.ok) throw new InboundReplyError(resolved.error, resolved.status);
    if (input.contactId && resolved.target.contact.id !== input.contactId) {
      throw new InboundReplyError("contactId does not match Follow-up Task / Thread ID", 400);
    }
    if (resolved.target.outbound?.channel && resolved.target.outbound.channel !== channel) {
      throw new InboundReplyError(
        `Thread ID belongs to ${resolved.target.outbound.channel}, not ${channel}`,
        400,
      );
    }
    return {
      brandId: resolved.target.brand.id,
      brandName: resolved.target.brand.name,
      brandOwnerId: resolved.target.brand.ownerId,
      contactId: resolved.target.contact.id,
      contactName: resolved.target.contact.name,
      taskId: resolved.target.task?.id || resolved.target.outbound?.taskId || undefined,
      existingThreadId: resolved.target.outbound?.threadId || input.threadId.trim(),
    };
  }

  if (input.taskId) {
    const task = await retrieveFollowupTask(input.taskId).catch(() => null);
    if (!task) throw new InboundReplyError("Task not found", 404);
    if (input.contactId && task.contactId && input.contactId !== task.contactId) {
      throw new InboundReplyError("contactId does not match task", 400);
    }
    if (!task.contactId) throw new InboundReplyError("Task has no Follow-up Contact", 422);
    if (!task.brandId) throw new InboundReplyError("Task has no Follow-up Client", 422);
    return {
      brandId: task.brandId,
      brandName: task.brandName || "Untitled Client",
      brandOwnerId: task.brandOwnerId || task.ownerId,
      contactId: task.contactId,
      contactName: task.contactName || "KeyPerson",
      taskId: task.channel === channel ? task.id : undefined,
    };
  }

  if (input.inReplyToMessageId) {
    const [parent] = await findConversationsByMessageId(input.inReplyToMessageId);
    if (parent?.contactId) {
      return {
        ...(await loadContactContext(parent.contactId)),
        taskId: parent.taskId || undefined,
        existingThreadId: parent.threadId,
      };
    }
  }

  if (input.threadId?.trim()) {
    const items = await findConversationsByThreadId(input.threadId);
    const parent =
      items.find((item) => item.direction === "Outbound" && (!item.channel || item.channel === channel)) ||
      items.find((item) => item.direction === "Outbound") ||
      items[0];
    if (!parent?.contactId) {
      throw new InboundReplyError(`No conversation matches Thread ID "${input.threadId.trim()}"`, 404);
    }
    if (parent.channel && parent.channel !== channel) {
      throw new InboundReplyError(
        `Thread ID belongs to ${parent.channel}, not ${channel}`,
        400,
      );
    }
    return {
      ...(await loadContactContext(parent.contactId)),
      taskId: parent.taskId || undefined,
      existingThreadId: parent.threadId,
    };
  }

  if (input.contactId) {
    const target = await loadContactContext(input.contactId);
    if (input.brandId && input.brandId !== target.brandId) {
      throw new InboundReplyError("contactId does not belong to brandId", 400);
    }
    return target;
  }

  if (input.brandId && input.sender?.trim()) {
    return resolveBySender(input.brandId, channel, input.sender);
  }

  if (input.brandName || input.brandId) {
    const resolved = input.brandName
      ? await resolveReplyTargetByBrandName(input.brandName, channel)
      : await resolveCurrentContactForBrand(input.brandId || "", channel);
    if (!resolved.ok) throw new InboundReplyError(resolved.error, resolved.status);
    if (input.brandId && input.brandId !== resolved.target.brand.id) {
      throw new InboundReplyError("brandId does not match brandName", 400);
    }
    if (input.sender?.trim()) {
      return resolveBySender(resolved.target.brand.id, channel, input.sender);
    }
    return {
      brandId: resolved.target.brand.id,
      brandName: resolved.target.brand.name,
      brandOwnerId: resolved.target.brand.ownerId,
      contactId: resolved.target.contact.id,
      contactName: resolved.target.contact.name,
      taskId: resolved.target.task?.id,
    };
  }

  throw new InboundReplyError(
    "Unable to resolve Follow-up Contact. Provide brandName, taskId, threadId, contactId, or brandId + sender.",
    422,
  );
}

async function toResult(
  conversation: {
    id: string;
    threadId?: string | null;
    messageId?: string | null;
    contactId?: string | null;
    taskId?: string | null;
  },
  target: ResolvedTarget,
  taskId: string,
  duplicate: boolean,
): Promise<InboundReplyResult> {
  const task = await retrieveFollowupTask(taskId);
  const activities = target.contactId
    ? await listFollowupConversations([target.contactId])
    : [];
  const [annotated] = annotateTasksWithReplyInbox([task], activities);
  return {
    duplicate,
    conversationId: conversation.id,
    threadId: conversation.threadId || null,
    messageId: conversation.messageId || null,
    contactId: target.contactId,
    taskId,
    brandId: target.brandId,
    inboxStatus: annotated?.inboxStatus || "Needs Reply",
  };
}

export async function ingestInboundReply(
  input: InboundReplyInput,
  assertAccess?: (target: ResolvedTarget) => Promise<void>,
): Promise<InboundReplyResult> {
  const channel = asChannel(input.channel);
  const content = asContent(channel, input.content, input.callResult);
  const occurredAt = asOccurredAt(input.occurredAt);
  const callResult = asCallResult(channel, input.callResult);
  const sourceUrl = asSourceUrl(input.sourceUrl);
  const messageId = input.messageId?.trim() || `IN-${channel}-${Date.now()}`;

  const [duplicate] = await findConversationsByMessageId(messageId);
  if (duplicate?.contactId) {
    const target = await loadContactContext(duplicate.contactId);
    const taskId =
      duplicate.taskId ||
      (await resolveReplyTask({
        brandName: target.brandName,
        brandOwnerId: target.brandOwnerId,
        contactId: target.contactId,
        contactName: target.contactName,
        channel,
        existingTaskId: input.taskId || undefined,
      }));
    return toResult(duplicate, target, taskId, true);
  }

  const target = await resolveInboundReplyTarget(input, channel);
  if (assertAccess) await assertAccess(target);

  const activities = await listFollowupConversations([target.contactId]);
  const outbound = pickOutboundCandidate(activities, {
    channel,
    taskId: target.taskId || input.taskId,
    threadId: input.threadId || target.existingThreadId,
    inReplyToMessageId: input.inReplyToMessageId,
  });
  if (!outbound) {
    throw new InboundReplyError(
      `No outbound ${channel} message found. A reply can only be written after a message has been sent.`,
      422,
    );
  }
  if (!outboundMessageIsSent({ ...outbound, channel: outbound.channel || channel })) {
    throw new InboundReplyError(
      `Message Status must be Sent before writing a reply. Current Message Status: ${outbound.status || "empty"}.`,
      409,
    );
  }
  const outboundTask = outbound.taskId
    ? await retrieveFollowupTask(outbound.taskId).catch(() => null)
    : (target.taskId || input.taskId)
      ? await retrieveFollowupTask(target.taskId || input.taskId || "").catch(() => null)
      : null;
  if (!outboundTask?.id) {
    throw new InboundReplyError("Sent outbound message is not linked to a Follow-up Task", 422);
  }
  if (!taskIsSent(outboundTask.status)) {
    throw new InboundReplyError(
      `Task Status must be Completed before writing a reply. Current Task Status: ${outboundTask.status || "empty"}.`,
      409,
    );
  }

  const threadId =
    input.threadId?.trim() ||
    outbound.threadId ||
    target.existingThreadId ||
    (await resolveConversationThread(target.contactId, channel, outboundTask.id)).threadId;
  const taskId = outboundTask.id;
  const subject =
    input.subject?.trim() ||
    (channel === "Email" ? `Re: ${content.split("\n")[0].slice(0, 116)}` : "");
  const properties: Record<string, unknown> = {
    "Conversation Record": {
      title: richText(`${target.brandName} — ${target.contactName} — ${channel} — Inbound`),
    },
    "Conversation Record ID": { rich_text: richText(`PORTAL-IN-${messageId}`) },
    "Follow-up Contact": { relation: [{ id: target.contactId }] },
    "Follow-up Task": { relation: [{ id: taskId }] },
    Channel: { select: { name: channel } },
    Direction: { select: { name: "Inbound" } },
    Subject: { rich_text: subject ? richText(subject) : [] },
    Content: { rich_text: richText(content) },
    Sender: { rich_text: input.sender?.trim() ? richText(input.sender.trim()) : [] },
    Notes: { rich_text: richText(input.notes?.trim() || "渠道回复已入库，待人工处理。") },
    "Thread ID": { rich_text: richText(threadId) },
    "Message ID": { rich_text: richText(messageId) },
    "Interaction At": { date: { start: occurredAt } },
    "Reply Status": { select: { name: "Needs Reply" } },
  };
  if (channel !== "Phone") {
    properties["Message Status"] = { select: { name: "Received" } };
  }
  if (callResult) {
    properties["Call Result"] = { select: { name: callResult } };
  }
  if (sourceUrl) {
    properties["Source URL"] = { url: sourceUrl };
  }

  const page = await createPage(getFollowupConversationDbId(), properties);
  await linkConversationToTask(page.id, taskId);
  await cancelUnsentBombSiblingTasks(outboundTask);
  await markFollowupClientEngaged(target.brandId, {
    handlingMode: "Human",
    note: "客户已回复，待人工处理。",
  });
  return toResult(
    { id: page.id, threadId, messageId, contactId: target.contactId, taskId },
    target,
    taskId,
    false,
  );
}

export async function createInboundReply(input: {
  brandName: string;
  brandOwnerId?: string | null;
  contactId: string;
  contactName: string;
  channel: string;
  content: string;
  sender?: string | null;
  existingTaskId?: string;
}) {
  const result = await ingestInboundReply({
    channel: input.channel,
    content: input.content,
    sender: input.sender,
    contactId: input.contactId,
    taskId: input.existingTaskId,
    occurredAt: new Date().toISOString(),
    notes: "客户回复已入库，尚未人工处理。",
  });
  return retrieveFollowupTask(result.taskId);
}
