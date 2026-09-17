export function pickContactChannelThreadId(
  items: Array<{ channel?: string | null; threadId?: string | null; createdAt?: string | null }>,
  channel: string,
) {
  const sameChannel = items
    .filter((item) => item.channel === channel && item.threadId?.trim())
    .sort(
      (left, right) =>
        (left.createdAt || "").localeCompare(right.createdAt || "") ||
        (left.threadId || "").localeCompare(right.threadId || ""),
    );
  const system = sameChannel.find((item) => item.threadId?.startsWith("THR-"));
  return (system || sameChannel[0])?.threadId?.trim() || null;
}

/** Decide which Thread ID to write for a new Conversation record. */
export function chooseConversationThreadId(input: {
  channel: string;
  preferredThreadId?: string | null;
  existing?: Array<{ channel?: string | null; threadId?: string | null; createdAt?: string | null }>;
  forceNew?: boolean;
  allocate: (channel: string) => string;
}) {
  if (input.forceNew) return input.allocate(input.channel);
  const preferred = input.preferredThreadId?.trim();
  if (preferred) return preferred;
  return pickContactChannelThreadId(input.existing || [], input.channel) || input.allocate(input.channel);
}
