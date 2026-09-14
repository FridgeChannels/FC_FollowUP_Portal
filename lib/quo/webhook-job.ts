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
  if (type === "call.ringing") {
    const attempt = await findRecentQuoDialAttempt(
      callPhones(data.call),
      data.call?.createdAt || data.lastEventAt,
    );
    return {
      status: 200,
      body: {
        ok: true,
        pending: true,
        linked: !!attempt,
        taskId: attempt?.taskId || null,
        callId: data.callId,
        matchedBy: attempt ? "dial-attempt" : null,
      },
    };
  }

  const resolved = await resolveFollowupTaskForQuoWebhook({
    callId: data.callId,
    call: data.call,
    eventAt: data.lastEventAt,
  });
  if (!resolved.task) {
    return {
      status: 202,
      body: { ok: true, linked: false, callId: data.callId, matchedBy: resolved.matchedBy },
    };
  }

  const created = !resolved.existing;
  await upsertQuoCallActivity({ task: resolved.task, data, eventType: type });
  await removeQuoDialAttempt(resolved.task.id);
  return {
    status: 200,
    body: {
      ok: true,
      linked: true,
      taskId: resolved.task.id,
      callId: data.callId,
      matchedBy: resolved.matchedBy,
      created,
    },
  };
}

export function enqueueQuoWebhookJob(type: HandledQuoWebhookType, data: QuoCallData) {
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
    if (!result.body.linked && type !== "call.ringing") {
      console.info("Quo webhook accepted but not linked", {
        callId: data.callId,
        type,
        status: result.status,
        matchedBy: result.body.matchedBy || null,
      });
    }
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
