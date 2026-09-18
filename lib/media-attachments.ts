export type MediaKind = "image" | "video";

export type MediaAttachment = {
  id: string;
  kind: MediaKind;
  name: string;
  mimeType: string;
  size: number;
  url: string;
};

export const MEDIA_CHANNELS = new Set(["WhatsApp"]);
export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/3gpp"]);
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
export const MAX_MEDIA_ATTACHMENTS = 5;

export function channelSupportsMedia(channel?: string | null) {
  return MEDIA_CHANNELS.has((channel || "").trim());
}

export function mediaKindFromMime(mimeType?: string | null): MediaKind | null {
  const mime = (mimeType || "").trim().toLowerCase();
  if (IMAGE_MIME_TYPES.has(mime)) return "image";
  if (VIDEO_MIME_TYPES.has(mime)) return "video";
  return null;
}

export function validateMediaFile(
  file: { type?: string | null; size?: number | null; name?: string | null },
  kind: MediaKind,
) {
  const mime = (file.type || "").trim().toLowerCase();
  const actual = mediaKindFromMime(mime);
  if (actual !== kind) {
    return kind === "image"
      ? "Use a JPG, PNG, WEBP, or GIF image."
      : "Use an MP4, MOV, or 3GP video.";
  }
  const size = typeof file.size === "number" ? file.size : 0;
  const max = kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (size <= 0) return "This file is empty.";
  if (size > max) {
    return kind === "image"
      ? "Images must be 5 MB or smaller."
      : "Videos must be 16 MB or smaller.";
  }
  return null;
}

export function captionForAttachments(attachments: MediaAttachment[]) {
  if (!attachments.length) return "";
  if (attachments.length === 1) return attachments[0].kind === "video" ? "Video" : "Image";
  const images = attachments.filter((item) => item.kind === "image").length;
  const videos = attachments.length - images;
  if (images && !videos) return `${images} images`;
  if (videos && !images) return `${videos} videos`;
  return `${attachments.length} media files`;
}

function parseJsonObject(value?: string | null): Record<string, unknown> | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asAttachment(value: unknown): MediaAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<MediaAttachment>;
  const kind = row.kind === "video" ? "video" : row.kind === "image" ? "image" : null;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const mimeType = typeof row.mimeType === "string" ? row.mimeType.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const size = typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0;
  if (!kind || !id || !name || !mimeType || !url) return null;
  return { id, kind, name, mimeType, size, url };
}

export function attachmentsFromExtendedParameters(value?: string | null): MediaAttachment[] {
  const parsed = parseJsonObject(value);
  const raw = parsed?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const attachment = asAttachment(item);
    return attachment ? [attachment] : [];
  });
}

export function sanitizeMediaAttachments(value: unknown): MediaAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const attachment = asAttachment(item);
    return attachment ? [attachment] : [];
  }).slice(0, MAX_MEDIA_ATTACHMENTS);
}
