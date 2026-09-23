import type { MediaAttachment, MediaKind } from "./media-attachments.ts";

export const DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/3gpp",
] as const;

export const DEFAULT_EMAIL_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_EMAIL_ATTACHMENT_MAX_COUNT = 5;

const EMAIL_CHANNELS = new Set(["Email"]);

function envValue(name: string) {
  return (typeof process !== "undefined" ? process.env[name] : undefined)?.trim() || "";
}

function parsePositiveInt(raw: string, fallback: number) {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function emailAttachmentMimeTypes() {
  const raw = envValue("EMAIL_ATTACHMENT_MIME_TYPES");
  if (!raw) return [...DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES];
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : [...DEFAULT_EMAIL_ATTACHMENT_MIME_TYPES];
}

export function emailAttachmentMaxBytes() {
  return parsePositiveInt(envValue("EMAIL_ATTACHMENT_MAX_BYTES"), DEFAULT_EMAIL_ATTACHMENT_MAX_BYTES);
}

export function emailAttachmentMaxCount() {
  return parsePositiveInt(envValue("EMAIL_ATTACHMENT_MAX_COUNT"), DEFAULT_EMAIL_ATTACHMENT_MAX_COUNT);
}

export function emailAttachmentAccept() {
  return emailAttachmentMimeTypes().join(",");
}

export function channelSupportsEmailAttachments(channel?: string | null) {
  return EMAIL_CHANNELS.has((channel || "").trim());
}

export function emailAttachmentKindFromMime(mimeType?: string | null): MediaKind | null {
  const mime = (mimeType || "").trim().toLowerCase();
  if (!mime || !emailAttachmentMimeTypes().includes(mime)) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export function validateEmailAttachmentFile(file: {
  type?: string | null;
  size?: number | null;
  name?: string | null;
}) {
  const mime = (file.type || "").trim().toLowerCase();
  const kind = emailAttachmentKindFromMime(mime);
  if (!kind) {
    return `Unsupported file type. Allowed: ${emailAttachmentMimeTypes().join(", ")}.`;
  }
  const size = typeof file.size === "number" ? file.size : 0;
  const max = emailAttachmentMaxBytes();
  if (size <= 0) return "This file is empty.";
  if (size > max) {
    const mb = Math.round((max / (1024 * 1024)) * 10) / 10;
    return `Files must be ${mb} MB or smaller.`;
  }
  return null;
}

function asEmailAttachment(value: unknown): MediaAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MediaAttachment>;
  const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim() : "";
  const kindFromMime = emailAttachmentKindFromMime(mimeType);
  const kind =
    row.kind === "image" || row.kind === "video" || row.kind === "file"
      ? row.kind
      : kindFromMime;
  if (!kind || !kindFromMime) return null;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const size = typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0;
  if (!id || !name || !mimeType || !url) return null;
  if (size <= 0 || size > emailAttachmentMaxBytes()) return null;
  return { id, kind, name, mimeType, size, url };
}

function asStoredAttachment(value: unknown): MediaAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MediaAttachment>;
  const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim() : "";
  const kind =
    row.kind === "image" || row.kind === "video" || row.kind === "file"
      ? row.kind
      : mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("video/")
          ? "video"
          : mimeType
            ? "file"
            : null;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const size = typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0;
  if (!kind || !id || !name || !mimeType || !url) return null;
  return { id, kind, name, mimeType, size, url };
}

export function sanitizeEmailAttachments(value: unknown): MediaAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      const attachment = asEmailAttachment(item);
      return attachment ? [attachment] : [];
    })
    .slice(0, emailAttachmentMaxCount());
}

export function encodeAttachmentsProperty(attachments: MediaAttachment[]) {
  if (!attachments.length) return null;
  return JSON.stringify(
    attachments.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      url: item.url,
    })),
  );
}

/** Read Attachments property for display; do not re-apply current env allowlists. */
export function attachmentsFromProperty(value?: string | null): MediaAttachment[] {
  const text = value?.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const attachment = asStoredAttachment(item);
      return attachment ? [attachment] : [];
    });
  } catch {
    return [];
  }
}

export function emailAttachmentConfig() {
  return {
    mimeTypes: emailAttachmentMimeTypes(),
    maxBytes: emailAttachmentMaxBytes(),
    maxCount: emailAttachmentMaxCount(),
    accept: emailAttachmentAccept(),
  };
}
