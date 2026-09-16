import { InboundReplyError } from "./inbound-errors.ts";

const CHANNELS = new Set(["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"]);

export type InboundColdInput = {
  channel?: string;
  content?: string;
  object?: string | null;
  contactId?: string | null;
  brandId?: string | null;
  sender?: string | null;
  taskId?: string | null;
};

/** Pure validation for /api/inbound. */
export function normalizeInboundColdInput(input: InboundColdInput) {
  if (input.taskId != null && String(input.taskId).trim()) {
    throw new InboundReplyError(
      "taskId is not allowed on /api/inbound. Use POST /api/replies for replies to a sent Follow-up Task.",
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

  const contactId = input.contactId?.trim() || "";
  const brandId = input.brandId?.trim() || "";
  const sender = input.sender?.trim() || "";

  if (contactId) {
    return {
      channel,
      content: content || "Inbound call",
      object: channel === "Email" ? object : "",
      contactId,
      brandId: "",
      sender,
    };
  }

  if (brandId && sender) {
    return {
      channel,
      content: content || "Inbound call",
      object: channel === "Email" ? object : "",
      contactId: "",
      brandId,
      sender,
    };
  }

  throw new InboundReplyError("Provide contactId, or brandId + sender", 422);
}
