import type { MediaAttachment } from "../media-attachments.ts";
import { EmailCcError, normalizeEmailCc, normalizeEmailRecipient } from "../email-cc.ts";
import { InboundReplyError } from "./inbound-errors.ts";
import {
  resolveInboundContent,
  resolveInboundEmailAttachments,
} from "./inbound-attachments.ts";

const CHANNELS = new Set(["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"]);

export type InboundColdInput = {
  channel?: string;
  content?: string;
  object?: string | null;
  /** Preferred brand id for adapters. */
  FollowUpClientId?: string | null;
  /** Legacy alias for FollowUpClientId. */
  brandId?: string | null;
  /** Counterparty identity: email / phone / LinkedIn URL depending on channel. */
  sender?: string | null;
  /** Email To header (comma- or semicolon-separated). */
  recipient?: string | null;
  /** Email Cc header (comma- or semicolon-separated). */
  cc?: string | null;
  taskId?: string | null;
  /** @deprecated Removed — cold inbound resolves via FollowUpClientId + sender. */
  contactId?: string | null;
  attachments?: unknown;
  extendedParameters?: Record<string, unknown> | string | null;
  "Extended Parameters"?: Record<string, unknown> | string | null;
};

export type NormalizedInboundColdInput = {
  channel: string;
  content: string;
  object: string;
  brandId: string;
  sender: string;
  recipient: string | null;
  cc: string | null;
  attachments: MediaAttachment[];
  extendedParameters: Record<string, unknown> | string | null;
};

/** Pure validation for /api/inbound. */
export function normalizeInboundColdInput(input: InboundColdInput): NormalizedInboundColdInput {
  if (input.taskId != null && String(input.taskId).trim()) {
    throw new InboundReplyError(
      "taskId is not allowed on /api/inbound. Use POST /api/replies for replies to a sent Follow-up Task.",
      400,
    );
  }

  if (input.contactId != null && String(input.contactId).trim()) {
    throw new InboundReplyError(
      "contactId is not supported on /api/inbound. Provide FollowUpClientId (or brandId) + sender, or sender alone for Email.",
      400,
    );
  }

  const channel = input.channel?.trim() || "";
  if (!CHANNELS.has(channel)) {
    throw new InboundReplyError("Invalid channel", 400);
  }

  const object = input.object?.trim() || "";
  if (channel === "Email") {
    if (!object) throw new InboundReplyError("object (email subject) is required for Email", 400);
  } else if (object) {
    throw new InboundReplyError("object is only valid for Email", 400);
  }

  const attachments = resolveInboundEmailAttachments(channel, input.attachments);
  const content = resolveInboundContent(channel, input.content, attachments);

  const brandId = input.FollowUpClientId?.trim() || input.brandId?.trim() || "";
  const sender = input.sender?.trim() || "";

  if (!sender) {
    throw new InboundReplyError("sender is required", 422);
  }

  const hasRecipient = input.recipient != null && String(input.recipient).trim() !== "";
  const hasCc = input.cc != null && String(input.cc).trim() !== "";
  if (channel !== "Email" && (hasRecipient || hasCc)) {
    throw new InboundReplyError("recipient and cc are only valid for Email", 400);
  }

  let recipient: string | null = null;
  let cc: string | null = null;
  if (channel === "Email") {
    try {
      recipient = normalizeEmailRecipient(input.recipient);
      cc = normalizeEmailCc(input.cc);
    } catch (error) {
      const message = error instanceof EmailCcError ? error.message : "Invalid recipient/cc";
      throw new InboundReplyError(message, 400);
    }
  }

  const extendedParameters =
    input.extendedParameters ?? input["Extended Parameters"] ?? null;

  if (channel === "Email") {
    // FollowUpClientId optional: empty → resolve contact globally by email.
    return {
      channel,
      content,
      object,
      brandId,
      sender,
      recipient,
      cc,
      attachments,
      extendedParameters,
    };
  }

  if (!brandId) {
    throw new InboundReplyError(
      "FollowUpClientId (or brandId) is required for non-Email cold inbound",
      422,
    );
  }

  return {
    channel,
    content,
    object: "",
    brandId,
    sender,
    recipient: null,
    cc: null,
    attachments,
    extendedParameters,
  };
}
