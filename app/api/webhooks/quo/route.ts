import { after } from "next/server";
import { getQuoWebhookSigningSecrets } from "@/lib/quo/config";
import { enqueueQuoWebhookJob, processQuoWebhookEvent } from "@/lib/quo/webhook-job";
import {
  callDataFromQuoWebhook,
  isHandledQuoWebhookType,
} from "@/lib/quo/webhook-event";
import {
  quoWebhookSignatureDebug,
  verifyQuoWebhookSignature,
} from "@/lib/quo/webhook-signature";

type JsonObject = Record<string, unknown>;

function runWebhookJobInBackground(job: Promise<unknown>) {
  try {
    after(() => job);
  } catch {
    void job.catch((error) => {
      console.error("Quo webhook job failed", error);
    });
  }
}

export async function GET() {
  return Response.json({ ok: true, configured: getQuoWebhookSigningSecrets().length > 0 });
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const secrets = getQuoWebhookSigningSecrets();
  console.info("Quo webhook received", {
    bytes: bodyText.length,
    secretCount: secrets.length,
    ...quoWebhookSignatureDebug(request.headers),
  });
  if (!(await verifyQuoWebhookSignature({
    body: bodyText,
    headers: request.headers,
    secrets,
    allowUnsigned: process.env.NODE_ENV !== "production",
  }))) {
    console.warn("Quo webhook rejected: invalid signature", {
      ...quoWebhookSignatureDebug(request.headers),
      secretCount: secrets.length,
    });
    return Response.json({ error: "Invalid Quo webhook signature" }, { status: 401 });
  }
  console.info("Quo webhook signature verified");
  let event: JsonObject;
  try {
    event = JSON.parse(bodyText) as JsonObject;
  } catch {
    console.warn("Quo webhook rejected: invalid JSON", { bytes: bodyText.length });
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const eventId = typeof event.id === "string" ? event.id : null;
  const data = callDataFromQuoWebhook(event);
  if (!data || !isHandledQuoWebhookType(type)) {
    console.info("Quo webhook ignored", {
      eventId,
      type: type || null,
      reason: !type
        ? "missing-type"
        : !isHandledQuoWebhookType(type)
          ? "unhandled-type"
          : "missing-call-id",
      handled: isHandledQuoWebhookType(type),
      parsedCallId: data?.callId || null,
    });
    return Response.json({ ok: true, ignored: true });
  }

  console.info("Quo webhook accepted for processing", {
    eventId,
    type,
    callId: data.callId,
    hasCall: !!data.call,
    recordingCount: data.recordings?.length || 0,
    hasTranscript: !!(data.transcript?.dialogue?.length),
    hasSummary: !!(data.summary?.summary?.length),
    hasVoicemail: !!data.voicemail,
    phones: [data.call?.from, data.call?.to].filter(Boolean),
  });

  const wait = new URL(request.url).searchParams.get("wait") === "1";
  if (type === "call.ringing") {
    console.info("Quo webhook mode: sync (call.ringing)", { callId: data.callId });
    try {
      const result = await processQuoWebhookEvent(type, data);
      console.info("Quo webhook sync done", { type, callId: data.callId, ...result.body });
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
      console.error("Quo webhook job failed", { callId: data.callId, type, error });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const job = enqueueQuoWebhookJob(type, data);
  if (wait) {
    console.info("Quo webhook mode: wait", { type, callId: data.callId });
    try {
      const result = await job;
      console.info("Quo webhook wait done", { type, callId: data.callId, ...result.body });
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
      console.error("Quo webhook job failed", { callId: data.callId, type, error });
      return Response.json({ error: message }, { status: 500 });
    }
  }

  console.info("Quo webhook mode: background", { type, callId: data.callId });
  runWebhookJobInBackground(job.catch((error) => {
    console.error("Quo webhook job failed", { callId: data.callId, type, error });
  }));
  return Response.json({
    ok: true,
    accepted: true,
    callId: data.callId,
    eventType: type,
  });
}
