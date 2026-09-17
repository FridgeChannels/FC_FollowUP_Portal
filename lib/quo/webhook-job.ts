import {
  callPhones,
  resolveFollowupTaskForQuoWebhook,
  upsertQuoCallActivity,
} from "../notion/quo-calls";
import { findRecentQuoDialAttempt, removeQuoDialAttempt } from "./dial-attempts";
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
    const attempt = await findRecentQuoDialAttempt(
      phones,
      data.call?.createdAt || data.lastEventAt,
    );
    const body = {
      ok: true,
      pending: true,
      linked: !!attempt,
      taskId: attempt?.taskId || null,
      callId: data.callId,
      matchedBy: attempt ? "dial-attempt" as const : null,
    };
    console.info("Quo webhook ringing resolved", body);
    return { status: 200, body };
  }

  console.info("Quo webhook resolve: task lookup", {
    callId: data.callId,
    phones,
    eventAt: data.lastEventAt || null,
  });
  const resolved = await resolveFollowupTaskForQuoWebhook({
    callId: data.callId,
    call: data.call,
    eventAt: data.lastEventAt,
  });
  console.info("Quo webhook resolve result", {
    callId: data.callId,
    type,
    matchedBy: resolved.matchedBy,
    taskId: resolved.task?.id || null,
    existingConversationId: resolved.existing?.id || null,
    existingHasQuo: !!resolved.existing?.quo,
  });
  if (!resolved.task) {
    const body = { ok: true, linked: false, callId: data.callId, matchedBy: resolved.matchedBy };
    console.info("Quo webhook skipped upsert: not linked", body);
    return { status: 202, body };
  }

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
  await removeQuoDialAttempt(resolved.task.id);
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
