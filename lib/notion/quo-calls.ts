import type { BrandTask } from "../brand-list";
import { findQuoCallConversation } from "./conversations";
import { serializeQuoCallData } from "../quo/call-payload";
import { createOutboundConversation, updateFollowupTask } from "./followup-writes";
import { firstRelationId, retrievePage, richText, updatePage } from "./client";
import { retrieveFollowupTask } from "./tasks";
import type { QuoCall, QuoCallData } from "../quo/types";
import { mergeQuoCallData, recordingsForQuoCall } from "../quo/data";
import { findRecentQuoDialAttempt } from "../quo/dial-attempts";
import { interactionCpCode } from "../outreach-domain";

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

async function brandCheckpoint(task: BrandTask) {
  if (!task.brandId) return { cpId: null as string | null, cpAtInteraction: interactionCpCode(task.sourceBombCp) };
  const page = await retrievePage(task.brandId).catch(() => null);
  const cpId = firstRelationId(page?.properties?.["Current CP"]) || null;
  return { cpId, cpAtInteraction: interactionCpCode(task.sourceBombCp) };
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
  const extendedParameters = serializeQuoCallData(data, existing?.extendedParameters);
  const properties = {
    Content: { rich_text: richText(content) },
    "Extended Parameters": { rich_text: richText(extendedParameters) },
    "Message ID": { rich_text: richText(`QUO_CALL:${data.callId}`) },
    "Call Result": { rich_text: result ? richText(result) : [] },
    Direction: { select: { name: "Inbound" } },
    "Interaction At": { date: { start: createdAt } },
    ...(recordings[0]?.url ? { "Source URL": { url: recordings[0].url } } : {}),
  } as Record<string, unknown>;

  if (existing) {
    if (!existing.taskId && input.task.id) {
      properties["Follow-up Task"] = { relation: [{ id: input.task.id }] };
    }
    await updatePage(existing.id, properties);
  } else {
    const checkpoint = await brandCheckpoint(input.task);
    await createOutboundConversation({
      brandName: input.task.brandName || "Untitled Brand",
      contactId: input.task.contactId,
      contactName: input.task.contactName || "Contact",
      channel: "Phone",
      content,
      sender: input.task.contactName || input.task.contactPhone || "Contact",
      taskId: input.task.id,
      messageId: `QUO_CALL:${data.callId}`,
      callResult: result,
      interactionAt: createdAt,
      notes: "Quo 通话回写。",
      extendedParameters,
      titleSuffix: "Inbound",
      direction: "Inbound",
      cpId: checkpoint.cpId,
      cpAtInteraction: checkpoint.cpAtInteraction,
    });
  }

  if (result === "Connected") {
    await markPhoneTaskAwaitingReview(input.task);
  }

  return retrieveFollowupTask(input.task.id);
}

async function markPhoneTaskAwaitingReview(task: BrandTask) {
  if (task.channel !== "Phone") return;
  if (task.callReviewStatus === "Qualified") return;
  if (task.status === "Cancelled" || task.status === "Failed") return;
  if (task.callReviewStatus === "Awaiting Review" && task.status === "Completed") return;

  const now = new Date().toISOString();
  const note =
    task.callReviewStatus === "Unqualified"
      ? "召回通话已接通（Connected），任务进入待评审。"
      : "通话已接通（Connected），任务进入待评审。";
  await updateFollowupTask(task.id, {
    callReviewStatus: "Awaiting Review",
    status: "Completed",
    endedAt: now,
    notes: [task.notes?.trim() || null, note].filter(Boolean).join("\n"),
  });
}

export function quoDataFromActivity(activity: { quo?: QuoCallData | null }) {
  return activity.quo || null;
}
