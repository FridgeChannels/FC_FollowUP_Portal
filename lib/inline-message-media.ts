export type InlineMediaKind = "audio" | "image";

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "media"; kind: InlineMediaKind; url: string; label: string };

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/i;

function classifyMediaUrl(url: string): InlineMediaKind | null {
  let path = url;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    path = url;
  }
  const lower = path.toLowerCase();
  if (/\.(opus|ogg|oga|mp3|m4a|aac|wav|amr)$/.test(lower)) return "audio";
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/.test(lower)) return "image";
  if (/\/(?:wa-inbound|wa-outbound)\/audio\//.test(lower)) return "audio";
  if (/\/(?:wa-inbound|wa-outbound)\/(?:image|images|photo|photos)\//.test(lower)) return "image";
  return null;
}

function captionKind(line: string): InlineMediaKind | null {
  const text = line.trim();
  if (!text) return null;
  if (/voice message|ptt|🎤|🔊|🎵/i.test(text)) return "audio";
  if (/^(?:image|photo|picture|sticker)\b|🖼|📷|📸/i.test(text)) return "image";
  return null;
}

function cleanCaption(line: string, fallback: string) {
  const text = line.trim().replace(/^(?:🎤|🔊|🎵|🖼|📷|📸)\s*/u, "").trim();
  return text || fallback;
}

function defaultLabel(kind: InlineMediaKind) {
  return kind === "audio" ? "Voice message" : "Image";
}

function mediaOnLine(line: string): { url: string; kind: InlineMediaKind; rest: string } | null {
  const match = line.match(URL_PATTERN);
  if (!match || match.index == null) return null;
  const url = match[0].replace(/[.,;:!?]+$/g, "");
  const kind = classifyMediaUrl(url);
  if (!kind) return null;
  const rest = `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
  if (rest && captionKind(rest) !== kind && captionKind(rest) !== null) return null;
  if (rest && !captionKind(rest)) return null;
  return { url, kind, rest };
}

/** Split WhatsApp body text so audio/image URLs can render instead of showing as raw links. */
export function splitInlineMessageMedia(content: string): MessageSegment[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments: MessageSegment[] = [];
  const textLines: string[] = [];

  const flushText = () => {
    const text = textLines.join("\n").trim();
    textLines.length = 0;
    if (text) segments.push({ type: "text", text });
  };

  for (const line of lines) {
    const media = mediaOnLine(line);
    if (!media) {
      textLines.push(line);
      continue;
    }
    let label = defaultLabel(media.kind);
    if (media.rest && captionKind(media.rest) === media.kind) {
      label = cleanCaption(media.rest, label);
    } else if (textLines.length && captionKind(textLines[textLines.length - 1] || "") === media.kind) {
      label = cleanCaption(textLines.pop() || label, label);
    }
    flushText();
    segments.push({ type: "media", kind: media.kind, url: media.url, label });
  }
  flushText();
  return segments;
}

export function inlineMessagePreview(content: string) {
  return splitInlineMessageMedia(content)
    .map((segment) => (segment.type === "text" ? segment.text : segment.label))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
