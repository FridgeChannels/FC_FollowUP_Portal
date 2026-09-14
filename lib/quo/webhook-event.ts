import type {
  QuoCall,
  QuoCallData,
  QuoRecording,
  QuoSummary,
  QuoTranscript,
  QuoVoicemail,
  QuoWebhookEvent,
} from "./types";

type JsonObject = Record<string, unknown>;

const HANDLED_EVENT_TYPES = [
  "call.ringing",
  "call.completed",
  "call.recording.completed",
  "call.transcript.completed",
  "call.summary.completed",
  "call.voicemail.completed",
] as const;

export type HandledQuoWebhookType = (typeof HANDLED_EVENT_TYPES)[number];

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()) : [];
}

function envelope(event: JsonObject) {
  const data = isObject(event.data) ? event.data : event;
  const resource = isObject(data.resource)
    ? data.resource
    : isObject(data.object)
      ? data.object
      : data;
  const context = isObject(data.context) ? data.context : null;
  return { data, resource, context };
}

function phonesFrom(resource: JsonObject, context: JsonObject | null) {
  const participants = isObject(context?.participants) ? context.participants : null;
  const workspace = stringList(participants?.workspace);
  const external = stringList(participants?.external);
  return {
    workspace,
    external,
    all: [...new Set([
      ...stringList(resource.participants),
      ...workspace,
      ...external,
    ])],
  };
}

function callIdFrom(resource: JsonObject) {
  const callId = text(resource.callId);
  const id = text(resource.id);
  if (callId) return callId;
  if (id && (id.startsWith("AC") || id.startsWith("call_"))) return id;
  return id;
}

function asCall(resource: JsonObject, context: JsonObject | null): QuoCall | null {
  const callId = callIdFrom(resource);
  if (!callId) return null;
  const phones = phonesFrom(resource, context);
  const direction = text(resource.direction);
  const outgoing = direction === "outgoing" || direction === "outbound";
  const from = text(resource.from, outgoing ? phones.workspace[0] : phones.external[0]);
  const to = text(resource.to, outgoing ? phones.external[0] : phones.workspace[0]);
  return {
    ...resource,
    id: callId,
    object: text(resource.object) || "call",
    from,
    to,
    direction,
    participants: phones.all,
    conversationId: text(resource.conversationId, context?.conversationId),
    status: text(resource.status),
    createdAt: text(resource.createdAt),
    answeredAt: text(resource.answeredAt),
    completedAt: text(resource.completedAt),
    updatedAt: text(resource.updatedAt),
    hasVoicemail: resource.hasVoicemail === true,
    recordings: Array.isArray(resource.recordings) ? resource.recordings as QuoRecording[] : undefined,
  };
}

function asTranscript(resource: JsonObject, callId: string): QuoTranscript {
  return {
    ...resource,
    object: text(resource.object) || "transcript",
    callId,
    createdAt: text(resource.createdAt),
    duration: typeof resource.duration === "number" ? resource.duration : null,
    status: text(resource.processingStatus, resource.status),
    dialogue: Array.isArray(resource.dialogue) ? resource.dialogue as QuoTranscript["dialogue"] : null,
  };
}

function asSummary(resource: JsonObject, callId: string): QuoSummary {
  return {
    ...resource,
    object: text(resource.object) || "callSummary",
    callId,
    status: text(resource.processingStatus, resource.status),
    summary: Array.isArray(resource.summary) ? resource.summary as string[] : null,
    nextSteps: Array.isArray(resource.nextSteps) ? resource.nextSteps as string[] : null,
    jobs: Array.isArray(resource.jobs) ? resource.jobs as QuoSummary["jobs"] : null,
  };
}

function asVoicemail(resource: JsonObject): QuoVoicemail {
  return {
    ...resource,
    id: text(resource.voicemailId, resource.id),
    duration: typeof resource.duration === "number" ? resource.duration : null,
    transcript: text(resource.transcript),
    recordingUrl: text(resource.recordingUrl, resource.url),
    url: text(resource.url, resource.recordingUrl),
    status: text(resource.status, resource.processingStatus),
  };
}

export function isHandledQuoWebhookType(type: string): type is HandledQuoWebhookType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

export function callDataFromQuoWebhook(event: JsonObject): QuoCallData | null {
  const type = text(event.type) || "";
  const { resource, context } = envelope(event);
  const callId = callIdFrom(resource);
  if (!callId) return null;
  const call = asCall(resource, context);
  const nestedRecordings = Array.isArray(resource.recordings) ? resource.recordings as QuoRecording[] : [];
  const recordings = nestedRecordings.length
    ? nestedRecordings
    : type === "call.recording.completed" && text(resource.url)
      ? [resource as QuoRecording]
      : [];
  const data: QuoCallData = {
    callId,
    call,
    recordings,
    webhookEvents: [{ ...event, type } as QuoWebhookEvent],
    eventTypes: [type],
    lastEventAt: text(event.createdAt, resource.completedAt, resource.createdAt) || new Date().toISOString(),
  };
  if (type === "call.transcript.completed") data.transcript = asTranscript(resource, callId);
  if (type === "call.summary.completed") data.summary = asSummary(resource, callId);
  if (type === "call.voicemail.completed" || call?.voicemail) {
    data.voicemail = type === "call.voicemail.completed"
      ? asVoicemail(resource)
      : call?.voicemail || null;
    if (data.call) data.call.voicemail = data.voicemail;
  }
  return data;
}
