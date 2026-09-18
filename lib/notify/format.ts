import type { NotificationEvent } from "./types.ts";

const PLACEHOLDER = "—";

export function truncatePreview(text: string | null | undefined, maxChars: number) {
  const value = (text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return "…";
  return `${value.slice(0, maxChars - 1)}…`;
}

function display(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || PLACEHOLDER;
}

function eventLabel(eventType: NotificationEvent["eventType"]) {
  return eventType === "reply.received" ? "Reply" : "Cold Inbound";
}

function fieldMrkdwn(label: string, value: string) {
  return `*${label}*\n${value}`;
}

export type SlackFormatOptions = {
  contentMaxChars: number;
  formatDueAt?: (iso: string) => string;
  /** Resolve brand deep-link when event.portalUrl is empty. */
  resolvePortalUrl?: (event: NotificationEvent) => string | null;
};

function portalUrlFor(
  event: NotificationEvent,
  resolvePortalUrl?: (event: NotificationEvent) => string | null,
) {
  const explicit = (event.portalUrl || "").trim();
  if (explicit) return explicit;
  return resolvePortalUrl?.(event)?.trim() || null;
}

/** Plain-text fallback (notifications / mobile). */
export function formatSlackNotificationText(
  event: NotificationEvent,
  options: SlackFormatOptions,
) {
  const formatDue = options.formatDueAt || ((iso: string) => iso);
  const preview = truncatePreview(event.contentPreview, options.contentMaxChars);
  const portalUrl = portalUrlFor(event, options.resolvePortalUrl);
  const lines = [
    `${eventLabel(event.eventType)} · ${display(event.channel)}`,
    display(event.brandName),
    "",
    `Owner: ${display(event.ownerName)}`,
    `Contact: ${display(event.contactName)}`,
    `From: ${display(event.sender)}`,
  ];
  if (event.inboxStatus) lines.push(`Status: ${event.inboxStatus}`);
  if (event.replyDueAt) lines.push(`Due: ${formatDue(event.replyDueAt)}`);
  if (event.subject?.trim()) lines.push(`Subject: ${event.subject.trim()}`);
  lines.push("", `Preview: ${preview || PLACEHOLDER}`);
  if (portalUrl) {
    lines.push("", `Open brand: ${portalUrl}`);
  }
  return lines.join("\n");
}

type SlackBlock = Record<string, unknown>;

/** Block Kit payload for Incoming Webhooks — clearer two-column layout + button. */
export function formatSlackNotificationBlocks(
  event: NotificationEvent,
  options: SlackFormatOptions,
): SlackBlock[] {
  const formatDue = options.formatDueAt || ((iso: string) => iso);
  const preview = truncatePreview(event.contentPreview, options.contentMaxChars);
  const portalUrl = portalUrlFor(event, options.resolvePortalUrl);
  const title = `${eventLabel(event.eventType)} · ${display(event.channel)}`.slice(0, 150);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: title, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${display(event.brandName)}*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: fieldMrkdwn("Owner", display(event.ownerName)) },
        { type: "mrkdwn", text: fieldMrkdwn("Contact", display(event.contactName)) },
        { type: "mrkdwn", text: fieldMrkdwn("From", display(event.sender)) },
        {
          type: "mrkdwn",
          text: fieldMrkdwn("Status", display(event.inboxStatus)),
        },
      ],
    },
  ];

  if (event.replyDueAt || event.subject?.trim()) {
    const extra: Array<{ type: string; text: string }> = [];
    if (event.replyDueAt) {
      extra.push({
        type: "mrkdwn",
        text: fieldMrkdwn("Due", formatDue(event.replyDueAt)),
      });
    }
    if (event.subject?.trim()) {
      extra.push({
        type: "mrkdwn",
        text: fieldMrkdwn("Subject", event.subject.trim()),
      });
    }
    blocks.push({ type: "section", fields: extra });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Preview*\n>${(preview || PLACEHOLDER).replace(/\n/g, "\n>")}`,
    },
  });

  if (portalUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open brand in Portal", emoji: true },
          url: portalUrl,
          action_id: "open_brand_portal",
        },
      ],
    });
  }

  return blocks;
}

export function formatSlackWebhookBody(
  event: NotificationEvent,
  options: SlackFormatOptions,
) {
  return {
    text: formatSlackNotificationText(event, options),
    blocks: formatSlackNotificationBlocks(event, options),
  };
}
