import { getQuoWebhookSigningSecrets } from "@/lib/quo/config";
import {
  resolveFollowupTaskForQuoWebhook,
  upsertQuoCallActivity,
} from "@/lib/notion/quo-calls";
import type {
  QuoCall,
  QuoCallData,
  QuoRecording,
  QuoSummary,
  QuoTranscript,
  QuoWebhookEvent,
} from "@/lib/quo/types";
import { recordingsForQuoCall } from "@/lib/quo/data";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object";
}

function eventObject(body: JsonObject) {
  const data = isObject(body.data) ? body.data : null;
  return data && isObject(data.object) ? data.object : data || body;
}

function asCall(value: JsonObject): QuoCall | null {
  if (value.object === "call" || typeof value.id === "string" && String(value.id).startsWith("AC")) {
    return value as QuoCall;
  }
  return null;
}

function callIdFor(event: JsonObject, object: JsonObject) {
  const direct = typeof object.callId === "string" ? object.callId : null;
  const id = typeof object.id === "string" && object.id.startsWith("AC") ? object.id : null;
  const eventData = isObject(event.data) && isObject(event.data.object) ? event.data.object : null;
  return direct || id || (eventData && typeof eventData.callId === "string" ? eventData.callId : null);
}

function base64Bytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifySignature(payload: string, header: string | null) {
  const secrets = getQuoWebhookSigningSecrets();
  if (!secrets.length) return process.env.NODE_ENV !== "production";
  if (!header) return false;
  const [scheme, version, timestamp, signature] = header.split(";");
  if (scheme !== "hmac" || version !== "1" || !timestamp || !signature) return false;
  try {
    const canonicalPayload = payload.replace(/\s/g, "");
    const source = new TextEncoder().encode(`${timestamp}.${canonicalPayload}`);
    for (const secret of secrets) {
      const key = await crypto.subtle.importKey(
        "raw",
        base64Bytes(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("HMAC", key, base64Bytes(signature), source)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function callDataFor(event: JsonObject, type: string): QuoCallData | null {
  const object = eventObject(event);
  const call = asCall(object);
  const callId = callIdFor(event, object);
  if (!callId) return null;
  const data: QuoCallData = {
    callId,
    call,
    recordings: type === "call.recording.completed"
      ? recordingsForQuoCall({ call, recordings: call ? [] : [object as QuoRecording] })
      : [],
    webhookEvents: [{ ...event, type } as QuoWebhookEvent],
    eventTypes: [type],
    lastEventAt: typeof event.createdAt === "string" ? event.createdAt : new Date().toISOString(),
  };
  if (type === "call.transcript.completed") data.transcript = object as QuoTranscript;
  if (type === "call.summary.completed") data.summary = object as QuoSummary;
  if (call?.voicemail) data.voicemail = call.voicemail;
  return data;
}

export async function GET() {
  return Response.json({ ok: true, configured: getQuoWebhookSigningSecrets().length > 0 });
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  if (!(await verifySignature(bodyText, request.headers.get("openphone-signature")))) {
    return Response.json({ error: "Invalid Quo webhook signature" }, { status: 401 });
  }
  let event: JsonObject;
  try {
    event = JSON.parse(bodyText) as JsonObject;
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  const type = typeof event.type === "string" ? event.type : "";
  const data = callDataFor(event, type);
  if (!data || !["call.ringing", "call.completed", "call.recording.completed", "call.transcript.completed", "call.summary.completed"].includes(type)) {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    const resolved = await resolveFollowupTaskForQuoWebhook({
      callId: data.callId,
      call: data.call,
      eventAt: data.lastEventAt,
    });
    if (!resolved.task) {
      return Response.json({ ok: true, linked: false, callId: data.callId }, { status: 202 });
    }
    await upsertQuoCallActivity({ task: resolved.task, data, eventType: type });
    return Response.json({
      ok: true,
      linked: true,
      taskId: resolved.task.id,
      callId: data.callId,
      matchedBy: resolved.matchedBy,
      created: !resolved.existing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process Quo webhook";
    return Response.json({ error: message }, { status: 500 });
  }
}
