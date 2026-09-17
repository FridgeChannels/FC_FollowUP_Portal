import type { QuoCallData } from "./types";

function isQuoCallData(value: unknown): value is QuoCallData {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as QuoCallData).callId === "string";
}

export function parseQuoCallData(raw?: string | null): QuoCallData | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (isQuoCallData(record.quo)) return record.quo;
    if (isQuoCallData(parsed)) return parsed;
    // Truncated Notion rich_text may still leave top-level ids intact.
    if (typeof record.quoCallId === "string" && record.quoCallId.trim()) {
      return { callId: record.quoCallId.trim() };
    }
  } catch {
    // Notion often truncates huge Extended Parameters mid-JSON.
    const fromId =
      raw.match(/"quoCallId"\s*:\s*"([^"]+)"/)?.[1]
      || raw.match(/"callId"\s*:\s*"([^"]+)"/)?.[1];
    if (fromId?.trim()) return { callId: fromId.trim() };
  }
  return null;
}

/** Fallback when Extended Parameters is empty/truncated but Message ID is `QUO_CALL:<id>`. */
export function quoFromMessageId(messageId?: string | null): QuoCallData | null {
  const id = messageId?.trim() || "";
  if (!id.startsWith("QUO_CALL:")) return null;
  const callId = id.slice("QUO_CALL:".length).trim();
  return callId ? { callId } : null;
}

export function serializeQuoCallData(data: QuoCallData, previous?: string | null) {
  let extras: Record<string, unknown> = {};
  if (previous?.trim()) {
    try {
      const parsed = JSON.parse(previous) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extras = parsed as Record<string, unknown>;
      }
    } catch {
      extras = {};
    }
  }
  const { quo: _quo, ...rest } = extras;
  return JSON.stringify({
    ...rest,
    quoCallId: data.callId,
    ...(data.call?.conversationId ? { quoConversationId: data.call.conversationId } : {}),
    quo: data,
  });
}
