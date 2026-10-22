/** Domain notification event — providers must not require Slack-specific fields. */

export type NotificationEventType =
  | "reply.received"
  | "inbound.received"
  | "sample.visited"
  | "encounter.updated"
  | "followup.resume_due"
  | "reply.action_due";

export type NotificationEvent = {
  eventType: NotificationEventType;
  channel: string;
  brandId?: string | null;
  brandName?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  sender?: string | null;
  subject?: string | null;
  contentPreview?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  inboxStatus?: string | null;
  replyDueAt?: string | null;
  occurredAt?: string | null;
  portalUrl?: string | null;
  /** PostHog `$device_id` for sample taps (enables the Slack "Mark internal" action). */
  deviceId?: string | null;
};

export type NotifyProvider = {
  id: string;
  enabled: boolean;
  supports?: (event: NotificationEvent) => boolean;
  send: (event: NotificationEvent) => Promise<void>;
};
