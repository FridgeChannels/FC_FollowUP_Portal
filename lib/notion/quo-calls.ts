import type { BrandTask } from "../brand-list";
import { findQuoCallConversation } from "./conversations";
import { serializeQuoCallData } from "../quo/call-payload";
import { createOutboundConversation } from "./followup-writes";
import { firstRelationId, retrievePage, richText, updatePage } from "./client";
import { resolveCheckpoint } from "./cps";
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
  const fromBomb = interactionCpCode(task.sourceBombCp);
  if (!task.brandId) return { cpId: null as string | null, cpAtInteraction: fromBomb };
  const page = await retrievePage(task.brandId).catch(() => null);
  const cpId = firstRelationId(page?.properties?.["Current CP"]) || null;
  const fromBrand = cpId
    ? interactionCpCode((await resolveCheckpoint(cpId))?.name)
    : null;
  // Prefer bomb CP when present; otherwise stamp brand Current CP so the call
  // is visible on the matching CP tab (unstamped Phone rows are filtered out).
  return { cpId, cpAtInteraction: fromBomb || fromBrand };
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
  const phones = callPhones(input.call);
  console.info("Quo webhook resolve step: find conversation by callId", {
    callId: input.callId,
    messageId: `QUO_CALL:${input.callId}`,
  });
  const existing = (await findQuoCallConversation(input.callId))[0];
  if (existing?.taskId) {
    const task = await retrieveFollowupTask(existing.taskId).catch((error) => {
      console.warn("Quo webhook resolve: conversation found but task retrieve failed", {
        callId: input.callId,
        conversationId: existing.id,
        taskId: existing.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (task) {
      console.info("Quo webhook resolve step: matched by callId", {
        callId: input.callId,
        conversationId: existing.id,
        taskId: task.id,
      });
      return { task, existing, matchedBy: "callId" as const };
    }
  } else {
    console.info("Quo webhook resolve step: no conversation for callId", {
      callId: input.callId,
      orphanConversationId: existing?.id || null,
    });
  }

  console.info("Quo webhook resolve step: find dial attempt", {
    callId: input.callId,
    phones,
    eventAt: input.call?.createdAt || input.call?.completedAt || input.eventAt || null,
  });
  const attempt = await findRecentQuoDialAttempt(
    phones,
    input.call?.createdAt || input.call?.completedAt || input.eventAt,
  );
  if (attempt?.taskId) {
    const task = await retrieveFollowupTask(attempt.taskId).catch((error) => {
      console.warn("Quo webhook resolve: dial attempt found but task retrieve failed", {
        callId: input.callId,
        taskId: attempt.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (task) {
      console.info("Quo webhook resolve step: matched by dial-attempt", {
        callId: input.callId,
        taskId: task.id,
        dialedAt: attempt.dialedAt,
        phone: attempt.phone,
      });
      return {
        task,
        existing: existing || null,
        matchedBy: "dial-attempt" as const,
        attempt,
      };
    }
  } else {
    console.info("Quo webhook resolve step: no dial attempt matched", {
      callId: input.callId,
      phones,
    });
  }

  console.info("Quo webhook resolve step: unmatched", { callId: input.callId, phones });
  return { task: null, existing: existing || null, matchedBy: null };
}

export async function upsertQuoCallActivity(input: {
  task: BrandTask;
  data: QuoCallData;
  eventType: string;
}) {
  if (!input.task.contactId) throw new Error("Quo call cannot be linked without a contact");
  if (!input.task.brandId) throw new Error("Quo call cannot be linked without a brand");
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
    if (!existing.brandId) {
      properties["Follow-up Client"] = { relation: [{ id: input.task.brandId }] };
    }
    if (!existing.taskId && input.task.id) {
      properties["Follow-up Task"] = { relation: [{ id: input.task.id }] };
    }
    console.info("Quo webhook Notion update", {
      eventType: input.eventType,
      callId: data.callId,
      conversationId: existing.id,
      taskId: input.task.id,
      callResult: result,
      contentPreview: content.slice(0, 120),
      recordingCount: recordings.length,
      hasTranscript: !!(data.transcript?.dialogue?.length),
      hasSummary: !!(data.summary?.summary?.length),
      extendedParametersChars: extendedParameters.length,
    });
    await updatePage(existing.id, properties);
  } else {
    const checkpoint = await brandCheckpoint(input.task);
    console.info("Quo webhook Notion create", {
      eventType: input.eventType,
      callId: data.callId,
      taskId: input.task.id,
      contactId: input.task.contactId,
      callResult: result,
      contentPreview: content.slice(0, 120),
      recordingCount: recordings.length,
      hasTranscript: !!(data.transcript?.dialogue?.length),
      hasSummary: !!(data.summary?.summary?.length),
      extendedParametersChars: extendedParameters.length,
      cpAtInteraction: checkpoint.cpAtInteraction,
    });
    await createOutboundConversation({
      brandId: input.task.brandId,
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
    console.info("Quo webhook recorded connected call; Caller decides when to submit review", {
      callId: data.callId,
      taskId: input.task.id,
      previousStatus: input.task.status,
      previousCallReviewStatus: input.task.callReviewStatus,
    });
  }

  return retrieveFollowupTask(input.task.id);
}

export function quoDataFromActivity(activity: { quo?: QuoCallData | null }) {
  return activity.quo || null;
}
