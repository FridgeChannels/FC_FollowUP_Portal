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

  const wait = new URL(request.url).searchParams.get("wait") === "1";
  if (type === "call.ringing") {
    try {
      const result = await processQuoWebhookEvent(type, data);
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
      console.error("Quo webhook job failed", error);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const job = enqueueQuoWebhookJob(type, data);
  if (wait) {
    try {
      const result = await job;
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
      console.error("Quo webhook job failed", error);
      return Response.json({ error: message }, { status: 500 });
    }
  }

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
