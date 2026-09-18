import { InboundReplyError } from "./inbound-errors.ts";

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
  taskId?: string | null;
  /** @deprecated Removed — cold inbound resolves via FollowUpClientId + sender. */
  contactId?: string | null;
};

/** Pure validation for /api/inbound. */
export function normalizeInboundColdInput(input: InboundColdInput) {
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

  const content = input.content?.trim() || "";
  if (channel !== "Phone" && !content) {
    throw new InboundReplyError("Message content is required", 400);
  }

  const brandId = input.FollowUpClientId?.trim() || input.brandId?.trim() || "";
  const sender = input.sender?.trim() || "";

  if (!sender) {
    throw new InboundReplyError("sender is required", 422);
  }

  if (channel === "Email") {
    // FollowUpClientId optional: empty → resolve contact globally by email.
    return {
      channel,
      content,
      object,
      brandId,
      sender,
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
    content: content || "Inbound call",
    object: "",
    brandId,
    sender,
  };
}
