import type {
  QuoCall,
  QuoCallData,
  QuoMedia,
  QuoRecording,
  QuoWebhookEvent,
} from "./types";

export function mergeQuoRecordings(...groups: Array<QuoRecording[] | null | undefined>) {
  const recordings = groups.flatMap((group) => group || []);
  return recordings.reduce<QuoRecording[]>((merged, recording) => {
    const match = merged.findIndex((existing) =>
      (!!recording.id && recording.id === existing.id)
      || (!!recording.url && recording.url === existing.url),
    );
    if (match === -1) merged.push(recording);
    else merged[match] = { ...merged[match], ...recording };
    return merged;
  }, []);
}

function mediaAsRecordings(call?: QuoCall | null) {
  return (call?.media || [])
    .filter((item) => !!item.url)
    .map((item, index) => ({
      ...item,
      id: `media-${index + 1}`,
      duration: typeof item.duration === "number" ? item.duration : null,
      startTime: call?.createdAt || null,
      status: call?.status || null,
      type: item.type || null,
      url: item.url || null,
    } satisfies QuoRecording));
}

export function recordingsForQuoCall(data: Pick<QuoCallData, "call" | "recordings">) {
  return mergeQuoRecordings(data.recordings, data.call?.recordings, mediaAsRecordings(data.call));
}

function mediaKey(media: QuoMedia, index: number) {
  return media.url || `${media.type || "media"}-${media.duration ?? "unknown"}-${index}`;
}

function mergeMedia(...groups: Array<QuoMedia[] | null | undefined>) {
  const media = groups.flatMap((group) => group || []);
  return Array.from(new Map(media.map((item, index) => [mediaKey(item, index), item])).values());
}

function mergeCall(previous?: QuoCall | null, incoming?: QuoCall | null): QuoCall | null {
  if (!previous && !incoming) return null;
  return {
    ...(previous || {}),
    ...(incoming || {}),
    media: mergeMedia(previous?.media, incoming?.media),
    recordings: mergeQuoRecordings(previous?.recordings, incoming?.recordings),
    voicemail: incoming?.voicemail || previous?.voicemail || null,
  };
}

function eventKey(event: QuoWebhookEvent, index: number) {
  return event.id || `${event.type || "event"}-${event.createdAt || index}`;
}

function mergeEvents(...groups: Array<QuoWebhookEvent[] | null | undefined>) {
  const events = groups.flatMap((group) => group || []);
  return Array.from(new Map(events.map((event, index) => [eventKey(event, index), event])).values());
}

export function mergeQuoCallData(
  previous: QuoCallData | null | undefined,
  incoming: QuoCallData,
  eventType?: string,
): QuoCallData {
  return {
    ...(previous || {}),
    ...incoming,
    callId: incoming.callId,
    call: mergeCall(previous?.call, incoming.call),
    recordings: mergeQuoRecordings(previous?.recordings, incoming.recordings),
    transcript: incoming.transcript || previous?.transcript || null,
    summary: incoming.summary || previous?.summary || null,
    voicemail: incoming.voicemail || previous?.voicemail || null,
    webhookEvents: mergeEvents(previous?.webhookEvents, incoming.webhookEvents),
    eventTypes: [...new Set([
      ...(previous?.eventTypes || []),
      ...(incoming.eventTypes || []),
      ...(eventType ? [eventType] : []),
    ])],
    lastEventAt: incoming.lastEventAt || previous?.lastEventAt || null,
  };
}
