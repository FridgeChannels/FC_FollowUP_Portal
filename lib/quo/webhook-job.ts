import { notifyInboundReceived } from "../notify";
import { ingestQuoColdInbound } from "../notion/quo-cold-inbound";
import { resolveOpenPhoneTaskForQuoCall } from "../notion/quo-phone-line";
import {
  callPhones,
  resolveFollowupTaskForQuoWebhook,
  upsertQuoCallActivity,
} from "../notion/quo-calls";
import { removeQuoDialAttempt } from "./dial-attempts";
import { shouldResolveOpenPhoneTask } from "./webhook-order";
import type { HandledQuoWebhookType } from "./webhook-event";
import type { QuoCallData } from "./types";
import {
  runWithLimitedRetries,
  WEBHOOK_JOB_MAX_ATTEMPTS,
} from "./webhook-retry";

export type QuoWebhookJobResult = {
  status: number;
  body: Record<string, unknown>;
};

export {
  isRetryableQuoWebhookError,
  runWithLimitedRetries,
  WEBHOOK_JOB_MAX_ATTEMPTS,
  webhookJobRetryDelayMs,
} from "./webhook-retry";

const chains = new Map<string, Promise<unknown>>();

async function resolveQuoWebhookTarget(data: QuoCallData) {
  const resolved = await resolveFollowupTaskForQuoWebhook({
    callId: data.callId,
    call: data.call,
    eventAt: data.lastEventAt,
  });
  if (!shouldResolveOpenPhoneTask({
    hasTask: !!resolved.task,
    existingTaskId: resolved.existing?.taskId,
  })) {
    return resolved;
  }
  const task = await resolveOpenPhoneTaskForQuoCall(data.call);
  if (!task) return resolved;
  console.info("Quo webhook resolve step: matched by open phone task", {
    callId: data.callId,
    taskId: task.id,
    phone: task.contactPhone || null,
  });
  return {
    ...resolved,
    task,
    matchedBy: "phone" as const,
  };
}

async function finishWithoutTask(
  type: HandledQuoWebhookType,
  data: QuoCallData,
): Promise<QuoWebhookJobResult> {
  const cold = await ingestQuoColdInbound({ data, eventType: type });
  if (cold.kind === "created") {
    await notifyInboundReceived({
      channel: "Phone",
      brandId: cold.brandId,
      brandName: cold.brandName,
      ownerId: cold.ownerId,
      ownerName: cold.ownerName,
      contactId: cold.contactId,
      contactName: cold.contactName,
      sender: cold.sender,
      content: cold.content,
      conversationId: cold.conversationId,
      taskId: cold.taskId,
      threadId: cold.threadId,
      messageId: cold.messageId,
      inboxStatus: null,
      occurredAt: cold.occurredAt,
    });
  }
  const recorded = cold.kind === "created" || cold.kind === "updated";
  const taskId = recorded ? cold.taskId : null;
  const ringing = type === "call.ringing";
  const body: Record<string, unknown> = {
    ok: true,
    linked: Boolean(taskId),
    taskId,
    callId: data.callId,
    matchedBy: null,
    coldInbound: recorded,
  };
  if (ringing) body.pending = true;
  if (cold.kind === "created" || cold.kind === "updated") {
    body.conversationId = cold.conversationId;
    body.contactId = cold.contactId;
    body.brandId = cold.brandId;
  } else {
    body.coldInboundReason = cold.reason;
  }
  console.info(recorded ? "Quo webhook cold inbound recorded" : "Quo webhook cold inbound skipped", {
    type,
    ...body,
  });
  return { status: recorded || ringing ? 200 : 202, body };
}

export async function processQuoWebhookEvent(
  type: HandledQuoWebhookType,
  data: QuoCallData,
): Promise<QuoWebhookJobResult> {
  const phones = callPhones(data.call);
  console.info("Quo webhook process start", {
    type,
    callId: data.callId,
    phones,
    hasTranscript: !!(data.transcript?.dialogue?.length),
    hasSummary: !!(data.summary?.summary?.length),
    recordingCount: data.recordings?.length || 0,
  });

  if (type === "call.ringing") {
    console.info("Quo webhook resolve: dial-attempt lookup (ringing)", {
      callId: data.callId,
      phones,
      eventAt: data.call?.createdAt || data.lastEventAt || null,
    });
    // Persist the call as soon as ringing is linked. The Call ID then becomes
    // the durable association key for completed, recording, transcript, and
    // summary callbacks, even when several calls share one task.
    const resolved = await resolveQuoWebhookTarget(data);
    if (!resolved.task) return finishWithoutTask(type, data);

    const created = !resolved.existing;
    await upsertQuoCallActivity({ task: resolved.task, data, eventType: type });
    if (resolved.attempt) {
      await removeQuoDialAttempt({
        taskId: resolved.task.id,
        dialedAt: resolved.attempt.dialedAt,
      });
    }
    const body = {
      ok: true,
      pending: true,
      linked: true,
      taskId: resolved.task.id,
      callId: data.callId,
      matchedBy: resolved.matchedBy,
      created,
    };
    console.info("Quo webhook ringing resolved", body);
    return { status: 200, body };
  }

  console.info("Quo webhook resolve: task lookup", {
    callId: data.callId,
    phones,
    eventAt: data.lastEventAt || null,
  });
  const resolved = await resolveQuoWebhookTarget(data);
  console.info("Quo webhook resolve result", {
    callId: data.callId,
    type,
    matchedBy: resolved.matchedBy,
    taskId: resolved.task?.id || null,
    existingConversationId: resolved.existing?.id || null,
    existingHasQuo: !!resolved.existing?.quo,
  });
  if (!resolved.task) return finishWithoutTask(type, data);

  const created = !resolved.existing;
  console.info("Quo webhook upsert start", {
    type,
    callId: data.callId,
    taskId: resolved.task.id,
    matchedBy: resolved.matchedBy,
    mode: created ? "create" : "update",
    hasTranscript: !!(data.transcript?.dialogue?.length),
    hasSummary: !!(data.summary?.summary?.length),
    recordingCount: data.recordings?.length || 0,
  });
  await upsertQuoCallActivity({ task: resolved.task, data, eventType: type });
  if (resolved.attempt) {
    await removeQuoDialAttempt({
      taskId: resolved.task.id,
      dialedAt: resolved.attempt.dialedAt,
    });
  }
  const body = {
    ok: true,
    linked: true,
    taskId: resolved.task.id,
    callId: data.callId,
    matchedBy: resolved.matchedBy,
    created,
  };
  console.info("Quo webhook upsert done", body);
  return { status: 200, body };
}

export function enqueueQuoWebhookJob(type: HandledQuoWebhookType, data: QuoCallData) {
  const queued = chains.has(data.callId);
  console.info("Quo webhook job enqueued", {
    type,
    callId: data.callId,
    chainedBehindPriorJob: queued,
  });
  const previous = chains.get(data.callId) || Promise.resolve();
  const job = previous.then(
    () => runWebhookJob(type, data),
    () => runWebhookJob(type, data),
  );
  chains.set(data.callId, job.then(() => undefined, () => undefined));
  return job;
}

function runWebhookJob(type: HandledQuoWebhookType, data: QuoCallData) {
  return runWithLimitedRetries(async () => {
    const result = await processQuoWebhookEvent(type, data);
    console.info("Quo webhook job finished", {
      type,
      callId: data.callId,
      status: result.status,
      ...result.body,
    });
    return result;
  }, {
    onRetry: (error, attempt) => {
      console.warn("Quo webhook job retrying", {
        callId: data.callId,
        type,
        attempt,
        maxAttempts: WEBHOOK_JOB_MAX_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });
}
