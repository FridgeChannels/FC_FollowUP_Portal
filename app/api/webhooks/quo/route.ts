import { getQuoWebhookSigningSecrets } from "@/lib/quo/config";
import {
  resolveFollowupTaskForQuoWebhook,
  upsertQuoCallActivity,
} from "@/lib/notion/quo-calls";
import { removeQuoDialAttempt } from "@/lib/quo/dial-attempts";
import {
  callDataFromQuoWebhook,
  isHandledQuoWebhookType,
} from "@/lib/quo/webhook-event";
import {
  quoWebhookSignatureDebug,
  verifyQuoWebhookSignature,
} from "@/lib/quo/webhook-signature";

type JsonObject = Record<string, unknown>;

export async function GET() {
  return Response.json({ ok: true, configured: getQuoWebhookSigningSecrets().length > 0 });
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const secrets = getQuoWebhookSigningSecrets();
  if (!(await verifyQuoWebhookSignature({
    body: bodyText,
    headers: request.headers,
    secrets,
    allowUnsigned: process.env.NODE_ENV !== "production",
  }))) {
    console.warn("Rejected Quo webhook signature", {
      ...quoWebhookSignatureDebug(request.headers),
      secretCount: secrets.length,
    });
    return Response.json({ error: "Invalid Quo webhook signature" }, { status: 401 });
  }
  let event: JsonObject;
  try {
    event = JSON.parse(bodyText) as JsonObject;
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const data = callDataFromQuoWebhook(event);
  if (!data || !isHandledQuoWebhookType(type)) {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const resolved = await resolveFollowupTaskForQuoWebhook({
      callId: data.callId,
      call: data.call,
      eventAt: data.lastEventAt,
    });
    if (type === "call.ringing") {
      return Response.json({
        ok: true,
        pending: true,
        linked: !!resolved.task,
        taskId: resolved.task?.id || null,
        callId: data.callId,
        matchedBy: resolved.matchedBy,
      });
    }
    if (!resolved.task) {
      return Response.json({ ok: true, linked: false, callId: data.callId }, { status: 202 });
    }
    const created = !resolved.existing;
    await upsertQuoCallActivity({ task: resolved.task, data, eventType: type });
    await removeQuoDialAttempt(resolved.task.id);
    return Response.json({
      ok: true,
      linked: true,
      taskId: resolved.task.id,
      callId: data.callId,
      matchedBy: resolved.matchedBy,
      created,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
    return Response.json({ error: message }, { status: 500 });
  }
}
