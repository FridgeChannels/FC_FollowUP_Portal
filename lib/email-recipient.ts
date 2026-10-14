import { interactionSortMs, type Interaction } from "./outreach-domain.ts";

/** Legacy replies have no recipient field; resolve the sender of their parent email. */
export function inboundEmailRecipient(item: Interaction, interactions: Interaction[]): string | undefined {
  if (item.recipient?.trim()) return item.recipient.trim();
  const candidates = interactions.filter(candidate =>
    candidate.customerId === item.customerId
    && candidate.channel === "Email"
    && candidate.direction === "Outbound"
    && !!candidate.sender?.trim()
    && interactionSortMs(candidate) <= interactionSortMs(item)
    && (item.taskId
      ? candidate.taskId === item.taskId
      : !!item.threadId && candidate.threadId === item.threadId),
  );
  return candidates.sort((a, b) => interactionSortMs(b) - interactionSortMs(a))[0]?.sender?.trim();
}
