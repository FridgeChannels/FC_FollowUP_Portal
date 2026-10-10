import type { MediaAttachment } from "./media-attachments";

const MARKER = "\n[FC_TEMPLATE_ATTACHMENTS]";

export function splitBombTemplateContent(value?: string | null) {
  const source = value || "";
  const index = source.lastIndexOf(MARKER);
  if (index < 0) return { content: source, attachments: [] as MediaAttachment[] };
  const content = source.slice(0, index);
  try {
    const parsed = JSON.parse(source.slice(index + MARKER.length)) as unknown;
    if (!Array.isArray(parsed)) return { content: source, attachments: [] as MediaAttachment[] };
    const attachments = parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<MediaAttachment>;
      if (
        (candidate.kind !== "image" && candidate.kind !== "video" && candidate.kind !== "file")
        || !candidate.id || !candidate.name || !candidate.mimeType || !candidate.url
        || typeof candidate.size !== "number"
      ) return [];
      return [{
        id: candidate.id,
        kind: candidate.kind,
        name: candidate.name,
        mimeType: candidate.mimeType,
        size: candidate.size,
        url: candidate.url,
      }];
    });
    return { content, attachments };
  } catch {
    return { content: source, attachments: [] as MediaAttachment[] };
  }
}

export function joinBombTemplateContent(content?: string | null, attachments: MediaAttachment[] = []) {
  const body = content || "";
  if (!attachments.length) return body;
  return `${body}${MARKER}${JSON.stringify(attachments)}`;
}
