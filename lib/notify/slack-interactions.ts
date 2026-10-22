import {
  SLACK_INTERNAL_STATUS_BLOCK_ID,
  SLACK_MARK_INTERNAL_ACTION_ID,
  SLACK_SAMPLE_ACTIONS_BLOCK_ID,
  SLACK_UNMARK_INTERNAL_ACTION_ID,
  decodeMarkInternalValue,
  markInternalButton,
  undoInternalButton,
  type SlackMarkInternalValue,
} from "./format.ts";

type SlackBlock = Record<string, unknown> & { type?: string; block_id?: string; elements?: unknown[] };

export type SlackBlockActionsPayload = {
  type?: string;
  user?: { id?: string; username?: string; name?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
  message?: { text?: string; blocks?: SlackBlock[] };
  response_url?: string;
};

export type InternalDeviceAction = {
  kind: "mark" | "unmark";
  value: SlackMarkInternalValue;
};

const INTERNAL_ACTION_IDS = new Set([SLACK_MARK_INTERNAL_ACTION_ID, SLACK_UNMARK_INTERNAL_ACTION_ID]);

export function parseSlackInteractionBody(body: string): SlackBlockActionsPayload | null {
  const raw = new URLSearchParams(body).get("payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlackBlockActionsPayload;
  } catch {
    return null;
  }
}

export function findInternalDeviceAction(payload: SlackBlockActionsPayload): InternalDeviceAction | null {
  if (payload.type !== "block_actions") return null;
  const action = payload.actions?.find((item) => INTERNAL_ACTION_IDS.has(item.action_id || ""));
  const value = action ? decodeMarkInternalValue(action.value) : null;
  if (!action || !value) return null;
  return { kind: action.action_id === SLACK_UNMARK_INTERNAL_ACTION_ID ? "unmark" : "mark", value };
}

export function slackUserLabel(user: SlackBlockActionsPayload["user"]) {
  const name = (user?.username || user?.name || user?.id || "").trim();
  return name ? `slack:${name}` : "slack";
}

function statusText(action: InternalDeviceAction, userId: string | null | undefined, clearedUnread: number) {
  const who = userId ? `<@${userId}>` : "Slack user";
  const device = `\`${action.value.deviceId}\``;
  if (action.kind === "unmark") {
    return `:leftwards_arrow_with_hook: Device ${device} removed from internal list by ${who}`;
  }
  const cleared = clearedUnread
    ? ` · cleared ${clearedUnread} unread notification${clearedUnread === 1 ? "" : "s"}`
    : "";
  return `:white_check_mark: Device ${device} marked internal by ${who}${cleared}`;
}

/** Swap Mark internal ⇄ Undo and replace the status line after an action. */
export function internalDeviceStatusBlocks(
  blocks: SlackBlock[] | undefined,
  input: { action: InternalDeviceAction; userId?: string | null; clearedUnread?: number },
): SlackBlock[] {
  const nextButton = input.action.kind === "mark"
    ? undoInternalButton(input.action.value)
    : markInternalButton(input.action.value);
  let placed = false;
  const next: SlackBlock[] = [];
  for (const block of blocks || []) {
    if (block.block_id === SLACK_INTERNAL_STATUS_BLOCK_ID) continue;
    if (block.type !== "actions") {
      next.push(block);
      continue;
    }
    const elements = (block.elements || []).filter(
      (element) => !INTERNAL_ACTION_IDS.has((element as { action_id?: string }).action_id || ""),
    );
    if (block.block_id === SLACK_SAMPLE_ACTIONS_BLOCK_ID) {
      elements.push(nextButton);
      placed = true;
    }
    if (elements.length) next.push({ ...block, elements });
  }
  if (!placed) {
    next.push({ type: "actions", block_id: SLACK_SAMPLE_ACTIONS_BLOCK_ID, elements: [nextButton] });
  }
  next.push({
    type: "context",
    block_id: SLACK_INTERNAL_STATUS_BLOCK_ID,
    elements: [{ type: "mrkdwn", text: statusText(input.action, input.userId, input.clearedUnread || 0) }],
  });
  return next;
}
