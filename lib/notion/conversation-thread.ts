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
