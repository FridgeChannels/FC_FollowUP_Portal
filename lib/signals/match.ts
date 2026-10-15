import type { Interaction } from "../outreach-domain";
import type { SignalEvent } from "./model";

function notionId(value: string) {
  return value.trim().replace(/-/g, "").toLowerCase();
}

export function matchesEmailSignalReference(
  reference: { brandId?: string | null; messageId?: string | null; conversationId?: string | null },
  item: { id: string; channel?: string | null; direction?: string | null; messageId?: string | null; content?: string | null },
) {
  if (item.channel !== "Email" || item.direction !== "Outbound") return false;
  // The sender replaces Message ID with Gmail's ID. The original portal ID
  // remains in this email's tracking pixel, so it still identifies one email.
  const pixels = [...(item.content || "").matchAll(/<img\b[^>]*\bsrc=["'][^"']*\/api\/track\/open\/eo1\.([A-Za-z0-9_-]+)\.[a-f0-9]{32}[^"']*["'][^>]*>/gi)];
  const ownPixel = pixels.at(-1);
  const tracked = !!reference.messageId && reference.messageId !== item.messageId && !!ownPixel && (() => {
    const match = ownPixel;
    try {
      const encoded = match[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0))));
      return !!reference.messageId && payload.m === reference.messageId && typeof payload.b === "string"
        && (!reference.brandId || notionId(payload.b) === notionId(reference.brandId));
    } catch { return false; }
  })();
  if (reference.messageId && item.messageId && reference.messageId !== item.messageId && !tracked) return false;
  if (reference.conversationId) return notionId(reference.conversationId) === notionId(item.id);
  return Boolean(reference.messageId && (item.messageId === reference.messageId || tracked));
}

/** Match the exact email using its page ID, provider ID, or original tracking ID. */
export function emailSignalMatchesInteraction(event: SignalEvent, item: Interaction) {
  return event.type === "email" && notionId(event.brandId) === notionId(item.customerId)
    && matchesEmailSignalReference(event, item);
}
