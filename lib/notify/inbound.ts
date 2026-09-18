import { getNotifyContentMaxChars } from "./config.ts";
import { emitNotificationSafe } from "./engine.ts";
import { truncatePreview } from "./format.ts";
import type { NotificationEvent } from "./types.ts";

/** Shared fields gathered at Reply / Inbound success (no Slack-specific data). */
export type IngestNotifyContext = {
  channel: string;
  brandId: string;
  brandName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  contactId: string;
  contactName?: string | null;
  sender?: string | null;
  subject?: string | null;
  content?: string | null;
  conversationId: string;
  taskId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  inboxStatus?: string | null;
  replyDueAt?: string | null;
  occurredAt?: string | null;
  portalUrl?: string | null;
};

function previewOf(content: string | null | undefined) {
  return truncatePreview(content, getNotifyContentMaxChars()) || null;
}

export function buildReplyNotificationEvent(
  ctx: IngestNotifyContext,
): NotificationEvent {
  return {
    eventType: "reply.received",
    channel: ctx.channel,
    brandId: ctx.brandId,
    brandName: ctx.brandName ?? null,
    ownerId: ctx.ownerId ?? null,
    ownerName: ctx.ownerName ?? null,
    contactId: ctx.contactId,
    contactName: ctx.contactName ?? null,
    sender: ctx.sender ?? null,
    subject: ctx.subject ?? null,
    contentPreview: previewOf(ctx.content),
    conversationId: ctx.conversationId,
    taskId: ctx.taskId ?? null,
    threadId: ctx.threadId ?? null,
    messageId: ctx.messageId ?? null,
    inboxStatus: ctx.channel === "Phone" ? null : ctx.inboxStatus ?? null,
    replyDueAt: ctx.replyDueAt ?? null,
    occurredAt: ctx.occurredAt ?? null,
    portalUrl: ctx.portalUrl ?? null,
  };
}

export function buildInboundNotificationEvent(
  ctx: IngestNotifyContext,
): NotificationEvent {
  return {
    eventType: "inbound.received",
    channel: ctx.channel,
    brandId: ctx.brandId,
    brandName: ctx.brandName ?? null,
    ownerId: ctx.ownerId ?? null,
    ownerName: ctx.ownerName ?? null,
    contactId: ctx.contactId,
    contactName: ctx.contactName ?? null,
    sender: ctx.sender ?? null,
    subject: ctx.subject ?? null,
    contentPreview: previewOf(ctx.content),
    conversationId: ctx.conversationId,
    taskId: ctx.taskId ?? null,
    threadId: ctx.threadId ?? null,
    messageId: ctx.messageId ?? null,
    inboxStatus: ctx.inboxStatus ?? null,
    replyDueAt: ctx.replyDueAt ?? null,
    occurredAt: ctx.occurredAt ?? null,
    portalUrl: ctx.portalUrl ?? null,
  };
}

export function notifyReplyReceived(ctx: IngestNotifyContext): void {
  emitNotificationSafe(buildReplyNotificationEvent(ctx));
}

export function notifyInboundReceived(ctx: IngestNotifyContext): void {
  emitNotificationSafe(buildInboundNotificationEvent(ctx));
}
