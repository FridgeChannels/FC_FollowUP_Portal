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
  const call: QuoCall = {
    id: callId,
    object: text(resource.object) || "call",
  };
  if (from) call.from = from;
  if (to) call.to = to;
  if (direction) call.direction = direction;
  if (phones.all.length) call.participants = phones.all;
  const conversationId = text(resource.conversationId, context?.conversationId);
  if (conversationId) call.conversationId = conversationId;
  const status = text(resource.status);
  if (status) call.status = status;
  const createdAt = text(resource.createdAt);
  if (createdAt) call.createdAt = createdAt;
  const answeredAt = text(resource.answeredAt);
  if (answeredAt) call.answeredAt = answeredAt;
  const completedAt = text(resource.completedAt);
  if (completedAt) call.completedAt = completedAt;
  const updatedAt = text(resource.updatedAt);
  if (updatedAt) call.updatedAt = updatedAt;
  if (resource.hasVoicemail === true) call.hasVoicemail = true;
  if (typeof resource.duration === "number") call.duration = resource.duration;
  if (Array.isArray(resource.recordings)) call.recordings = resource.recordings as QuoRecording[];
  if (Array.isArray(resource.media)) call.media = resource.media as QuoCall["media"];
  return call;
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
  const summaryValue = resource.summary;
  const summary = Array.isArray(summaryValue)
    ? summaryValue as string[]
    : typeof summaryValue === "string" && summaryValue.trim()
      ? [summaryValue.trim()]
      : null;
  return {
    ...resource,
    object: text(resource.object) || "callSummary",
    callId,
    status: text(resource.processingStatus, resource.status),
    summary,
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
  const mediaRecordings = Array.isArray(resource.media)
    ? (resource.media as Array<{ url?: string | null; type?: string | null; duration?: number | null }>)
      .filter((item) => typeof item?.url === "string" && !!item.url.trim())
      .map((item, index) => ({
        id: `media-${index + 1}`,
        url: item.url || null,
        type: item.type || null,
        duration: typeof item.duration === "number" ? item.duration : null,
        startTime: text(resource.createdAt),
        status: text(resource.status),
      } satisfies QuoRecording))
    : [];
  const recordings = nestedRecordings.length
    ? nestedRecordings
    : mediaRecordings.length
      ? mediaRecordings
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
