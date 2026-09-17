import type { CPCode } from "./outreach-domain";

/** Activity fields needed to fill missing CP from thread/task neighbors. */
export type InteractionCpSource = {
  threadId?: string | null;
  taskId?: string | null;
  direction?: string | null;
  /** Already-stamped CP (Conversation / Task / Bomb). Prefer this. */
  stampedCp?: CPCode | null;
  sortAt: string;
};

export type InteractionCpFallbacks = {
  threadInboundCp: Map<string, CPCode>;
  threadCp: Map<string, CPCode>;
  taskCp: Map<string, CPCode>;
};

/**
 * Build thread/task CP fallbacks from chronologically ordered sources that already
 * have a stamped CP. Used only to fill messages that lack their own CP.
 */
export function buildInteractionCpFallbacks(sources: InteractionCpSource[]): InteractionCpFallbacks {
  const threadInboundCp = new Map<string, CPCode>();
  const threadCp = new Map<string, CPCode>();
  const taskCp = new Map<string, CPCode>();
  const chronological = [...sources].sort((left, right) =>
    left.sortAt.localeCompare(right.sortAt),
  );
  for (const entry of chronological) {
    const cp = entry.stampedCp;
    if (!cp) continue;
    if (entry.threadId) {
      // Keep overwriting so the map holds the latest inbound CP on the thread.
      if (entry.direction === "Inbound") {
        threadInboundCp.set(entry.threadId, cp);
      }
      if (!threadCp.has(entry.threadId)) threadCp.set(entry.threadId, cp);
    }
    if (entry.taskId && !taskCp.has(entry.taskId)) taskCp.set(entry.taskId, cp);
  }
  return { threadInboundCp, threadCp, taskCp };
}

/**
 * Resolve display CP for a channel message.
 * Stamped CP always wins so CP1/CP2 timelines stay independent even when Thread IDs
 * were historically reused across checkpoints.
 */
export function resolveInteractionDisplayCp(
  stampedCp: CPCode | null | undefined,
  item: { threadId?: string | null; taskId?: string | null },
  fallbacks: InteractionCpFallbacks,
): CPCode | undefined {
  if (stampedCp) return stampedCp;
  if (item.threadId) {
    const fromInbound = fallbacks.threadInboundCp.get(item.threadId);
    if (fromInbound) return fromInbound;
    const fromThread = fallbacks.threadCp.get(item.threadId);
    if (fromThread) return fromThread;
  }
  if (item.taskId) {
    const fromTask = fallbacks.taskCp.get(item.taskId);
    if (fromTask) return fromTask;
  }
  return undefined;
}
