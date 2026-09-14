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
  } catch {
    return null;
  }
  return null;
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
