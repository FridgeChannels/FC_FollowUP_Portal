import { captionForAttachments, type MediaAttachment } from "../media-attachments.ts";
import {
  channelSupportsEmailAttachments,
  emailAttachmentKindFromMime,
  emailAttachmentMaxBytes,
  emailAttachmentMaxCount,
  emailAttachmentMimeTypes,
} from "../email-attachments.ts";
import { isAllowedS3MediaUrl } from "../s3-media.ts";
import { InboundReplyError } from "./inbound-errors.ts";

function parseStrictEmailAttachment(value: unknown): MediaAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MediaAttachment>;
  const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim().toLowerCase() : "";
  const kindFromMime = emailAttachmentKindFromMime(mimeType);
  if (!kindFromMime) return null;
  const kind =
    row.kind === "image" || row.kind === "video" || row.kind === "file"
      ? row.kind
      : kindFromMime;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const size = typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0;
  if (!id || !name || !mimeType || !url) return null;
  if (size <= 0 || size > emailAttachmentMaxBytes()) return null;
  return { id, kind, name, mimeType, size, url };
}

/**
 * Strict inbound Email attachments: reject the whole request on any invalid item.
 * Empty / omitted → []. Non-Email with any attachments → 400.
 */
export function resolveInboundEmailAttachments(
  channel: string,
  raw: unknown,
): MediaAttachment[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new InboundReplyError("attachments must be an array", 400);
  }
  if (!raw.length) return [];
  if (!channelSupportsEmailAttachments(channel)) {
    throw new InboundReplyError("attachments are only supported on Email", 400);
  }
  const maxCount = emailAttachmentMaxCount();
  if (raw.length > maxCount) {
    throw new InboundReplyError(`Email allows up to ${maxCount} attachments`, 400);
  }

  const allowed = emailAttachmentMimeTypes();
  const attachments: MediaAttachment[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = parseStrictEmailAttachment(item);
    if (!parsed) {
      throw new InboundReplyError(
        `attachments[${index}] is invalid. Required: id, name, mimeType (${allowed.join(", ")}), size, url`,
        400,
      );
    }
    if (!isAllowedS3MediaUrl(parsed.url)) {
      throw new InboundReplyError(
        `attachments[${index}].url must be an allowed S3 object URL`,
        400,
      );
    }
    attachments.push(parsed);
  }
  return attachments;
}

export function resolveInboundContent(
  channel: string,
  content: string | undefined,
  attachments: MediaAttachment[],
  callResult?: string | null,
) {
  const text = content?.trim() || "";
  if (channel === "Phone") return text || callResult?.trim() || "Inbound call";
  if (text) return text;
  if (attachments.length) return captionForAttachments(attachments);
  throw new InboundReplyError("Message content is required", 400);
}
