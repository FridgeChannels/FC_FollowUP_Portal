function activitySortAt(item: {
  createdAt?: string | null;
  recordedAt?: string | null;
  scheduledAt?: string | null;
}) {
  return item.recordedAt || item.createdAt || item.scheduledAt || "";
}

/**
 * Latest interaction Thread on this contact+channel (any direction).
 * Prefers a system `THR-` id when several candidates share the same timestamp.
 */
export function pickContactChannelThreadId(
  items: Array<{
    channel?: string | null;
    threadId?: string | null;
    createdAt?: string | null;
    recordedAt?: string | null;
    scheduledAt?: string | null;
  }>,
  channel: string,
) {
  const sameChannel = items
    .filter((item) => item.channel === channel && item.threadId?.trim())
    .sort((left, right) => {
      const byTime = activitySortAt(right).localeCompare(activitySortAt(left));
      if (byTime) return byTime;
      const leftSystem = left.threadId?.startsWith("THR-") ? 0 : 1;
      const rightSystem = right.threadId?.startsWith("THR-") ? 0 : 1;
      if (leftSystem !== rightSystem) return leftSystem - rightSystem;
      return (left.threadId || "").localeCompare(right.threadId || "");
    });
  return sameChannel[0]?.threadId?.trim() || null;
}

/** Decide which Thread ID to write for a new Conversation record. */
export function chooseConversationThreadId(input: {
  channel: string;
  preferredThreadId?: string | null;
  existing?: Array<{
    channel?: string | null;
    threadId?: string | null;
    createdAt?: string | null;
    recordedAt?: string | null;
    scheduledAt?: string | null;
  }>;
  forceNew?: boolean;
  allocate: (channel: string) => string;
}) {
  if (input.forceNew) return input.allocate(input.channel);
  const preferred = input.preferredThreadId?.trim();
  if (preferred) return preferred;
  return pickContactChannelThreadId(input.existing || [], input.channel) || input.allocate(input.channel);
}
