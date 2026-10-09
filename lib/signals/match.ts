import type { Interaction } from "../outreach-domain";
import type { SignalEvent } from "./model";

function notionId(value: string) {
  return value.replace(/-/g, "").toLowerCase();
}

/** Only a provider message ID or ConversationDB page ID can attach an open to an email. */
export function emailSignalMatchesInteraction(event: SignalEvent, item: Interaction) {
  if (event.type !== "email" || event.brandId !== item.customerId || item.channel !== "Email" || item.direction !== "Outbound") return false;
  return Boolean(
    (event.conversationId && notionId(event.conversationId) === notionId(item.id)) ||
    (event.messageId && item.messageId && event.messageId === item.messageId),
  );
}
