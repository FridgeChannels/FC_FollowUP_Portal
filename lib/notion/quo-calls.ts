import type { BrandTask } from "../brand-list";
import { findQuoCallConversation, serializeQuoCallData } from "./conversations";
import { createOutboundConversation } from "./followup-writes";
import { richText, updatePage } from "./client";
import { retrieveFollowupTask } from "./tasks";
import type { QuoCall, QuoCallData } from "../quo/types";
import { mergeQuoCallData, recordingsForQuoCall } from "../quo/data";
import { findRecentQuoDialAttempt } from "../quo/dial-attempts";

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function callPhones(call?: QuoCall | null) {
  return [call?.from, call?.to, ...(call?.participants || [])]
    .map(normalizePhone)
    .filter(Boolean);
}

function callResult(call?: QuoCall | null) {
  if (!call) return null;
  if (call.voicemail || call.hasVoicemail) return "Voicemail";
  if (call.status === "answered" || call.answeredAt) return "Connected";
  if (
    call.status === "unanswered"
    || call.status === "abandoned"
    || call.status === "failed"
    || (call.status === "completed" && !call.answeredAt)
  ) {
    return "No Answer";
  }
  return null;
}

function eventTime(data: QuoCallData) {
  return data.call?.completedAt || data.call?.createdAt || data.transcript?.createdAt || data.lastEventAt || new Date().toISOString();
}

function readableContent(data: QuoCallData) {
  const summary = data.summary?.summary?.filter(Boolean) || [];
  const voicemail = data.voicemail?.transcript || data.call?.voicemail?.transcript;
  if (summary.length) return summary.join("\n");
  if (voicemail) return `Voicemail transcript:\n${voicemail}`;
  if (data.transcript?.dialogue?.length) {
    return data.transcript.dialogue
      .map((line) => `${line.identifier || line.userId || "Speaker"}: ${line.content || ""}`)
      .join("\n");
  }
  const result = callResult(data.call);
  return result ? `Quo call ${result}` : "Quo call activity received";
}

export async function resolveFollowupTaskForQuoWebhook(input: {
  callId: string;
  call?: QuoCall | null;
  eventAt?: string | null;
}) {
  const existing = (await findQuoCallConversation(input.callId))[0];
  if (existing?.taskId) {
    const task = await retrieveFollowupTask(existing.taskId).catch(() => null);
    if (task) return { task, existing, matchedBy: "callId" as const };
  }

  const attempt = await findRecentQuoDialAttempt(
    callPhones(input.call),
    input.call?.createdAt || input.call?.completedAt || input.eventAt,
  );
  if (attempt?.taskId) {
    const task = await retrieveFollowupTask(attempt.taskId).catch(() => null);
    if (task) return { task, existing: existing || null, matchedBy: "dial-attempt" as const };
  }

  return { task: null, existing: existing || null, matchedBy: null };
}

export async function upsertQuoCallActivity(input: {
  task: BrandTask;
  data: QuoCallData;
  eventType: string;
}) {
  if (!input.task.contactId) throw new Error("Quo call cannot be linked without a contact");
  const existing = (await findQuoCallConversation(input.data.callId))[0];
  const data = mergeQuoCallData(existing?.quo, {
    ...input.data,
    eventTypes: [input.eventType],
    lastEventAt: input.data.lastEventAt || new Date().toISOString(),
  }, input.eventType);
  const recordings = recordingsForQuoCall(data);
  const content = readableContent(data);
  const result = callResult(data.call);
  const createdAt = eventTime(data);
  const properties = {
    Content: { rich_text: richText(content) },
    Notes: { rich_text: richText(serializeQuoCallData(data)) },
    "Message ID": { rich_text: richText(`QUO_CALL:${data.callId}`) },
    "Call Result": { rich_text: result ? richText(result) : [] },
    Direction: { select: { name: "Inbound" } },
    "Interaction At": { date: { start: createdAt } },
    ...(recordings[0]?.url ? { "Source URL": { url: recordings[0].url } } : {}),
  } as Record<string, unknown>;

  if (existing) {
    await updatePage(existing.id, properties);
  } else {
    await createOutboundConversation({
      brandName: input.task.brandName || "Untitled Brand",
      contactId: input.task.contactId,
      contactName: input.task.contactName || "Contact",
      channel: "Phone",
      content,
      sender: input.task.contactName || input.task.contactPhone || "Contact",
      taskId: input.task.id,
      threadId: data.call?.conversationId ? `QUO_CONVERSATION:${data.call.conversationId}` : undefined,
      messageId: `QUO_CALL:${data.callId}`,
      messageStatus: null,
      callResult: result,
      interactionAt: createdAt,
      notes: serializeQuoCallData(data),
      titleSuffix: "Inbound",
      direction: "Inbound",
    });
  }

  return retrieveFollowupTask(input.task.id);
}

export function quoDataFromActivity(activity: { quo?: QuoCallData | null }) {
  return activity.quo || null;
}
