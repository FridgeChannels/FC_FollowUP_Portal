import type {
  QuoCall,
  QuoCallData,
  QuoMedia,
  QuoRecording,
  QuoSummary,
  QuoTranscript,
  QuoVoicemail,
  QuoWebhookEvent,
} from "./types";

/** Synthetic media-1 / media-2 ids collide across webhook/sync payloads — never match on them. */
function isStableRecordingId(id?: string | null) {
  return !!id && !/^media-\d+$/i.test(id);
}

/** Strip signed-query noise so the same file is not listed twice. */
function urlPathKey(raw?: string | null) {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw.trim();
  }
}

/**
 * Quo often returns the same take as both `….mp3` (call-recordings) and `…_mono.mp3` (call.media).
 * Treat those as one recording for UI + merge.
 */
function quoRecordingFileKey(raw?: string | null) {
  const path = urlPathKey(raw);
  if (!path) return null;
  return path.replace(/_mono(?=\.(mp3|wav|m4a)$)/i, "");
}

function isMonoRecordingUrl(raw?: string | null) {
  return /_mono\.(mp3|wav|m4a)(?:\?|$)/i.test(raw || "");
}

/** Prefer dedicated CR* recordings over media mirrors / mono variants. */
function preferRecording(left: QuoRecording, right: QuoRecording): QuoRecording {
  const leftStable = isStableRecordingId(left.id);
  const rightStable = isStableRecordingId(right.id);
  if (leftStable !== rightStable) return leftStable ? { ...right, ...left } : { ...left, ...right };
  const leftMono = isMonoRecordingUrl(left.url);
  const rightMono = isMonoRecordingUrl(right.url);
  if (leftMono !== rightMono) return leftMono ? { ...left, ...right } : { ...right, ...left };
  return { ...left, ...right };
}

export function recordingsForQuoCall(data: Pick<QuoCallData, "call" | "recordings">) {
  // Prefer dedicated recording payloads. call.media is often the same audio with a
  // differently signed URL — merging both produced duplicate players in the UI.
  const dedicated = mergeQuoRecordings(data.recordings, data.call?.recordings);
  if (dedicated.length) return dedicated;
  return mediaAsRecordings(data.call);
}

export function mergeQuoRecordings(...groups: Array<QuoRecording[] | null | undefined>) {
  const recordings = groups.flatMap((group) => group || []);
  return recordings.reduce<QuoRecording[]>((merged, recording) => {
    const match = merged.findIndex((existing) => {
      if (isStableRecordingId(recording.id) && recording.id === existing.id) return true;
      if (recording.url && recording.url === existing.url) return true;
      const left = quoRecordingFileKey(recording.url);
      const right = quoRecordingFileKey(existing.url);
      return !!left && !!right && left === right;
    });
    if (match === -1) merged.push(recording);
    else merged[match] = preferRecording(merged[match], recording);
    return merged;
  }, []);
}

/** Prefer URL as identity so refresh/webhook cannot overwrite a different file via media-N. */
export function mediaAsRecordings(call?: QuoCall | null): QuoRecording[] {
  return (call?.media || [])
    .filter((item) => !!item.url)
    .map((item) => ({
      ...item,
      id: item.url || null,
      duration: typeof item.duration === "number" ? item.duration : null,
      startTime: call?.createdAt || null,
      status: call?.status || null,
      type: item.type || null,
      url: item.url || null,
    } satisfies QuoRecording));
}

function mediaKey(media: QuoMedia, index: number) {
  return media.url || `${media.type || "media"}-${media.duration ?? "unknown"}-${index}`;
}

function mergeMedia(...groups: Array<QuoMedia[] | null | undefined>) {
  const media = groups.flatMap((group) => group || []);
  return Array.from(new Map(media.map((item, index) => [mediaKey(item, index), item])).values());
}

function definedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined),
  ) as Partial<T>;
}

function hasTranscriptDialogue(transcript?: QuoTranscript | null) {
  return !!(transcript?.dialogue?.length);
}

function mergeCall(
  previous?: QuoCall | null,
  incoming?: QuoCall | null,
  options?: { replaceNested?: boolean },
): QuoCall | null {
  if (!previous && !incoming) return null;
  if (options?.replaceNested && incoming) {
    return {
      ...(previous || {}),
      ...definedFields(incoming as Record<string, unknown>),
      media: incoming.media !== undefined ? incoming.media : previous?.media || null,
      recordings: incoming.recordings !== undefined
        ? mergeQuoRecordings(incoming.recordings)
        : previous?.recordings || null,
      voicemail: incoming.voicemail || previous?.voicemail || null,
    };
  }
  return {
    ...(previous || {}),
    ...definedFields((incoming || {}) as Record<string, unknown>),
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
  const isLiveSync = eventType === "call.sync";
  return {
    ...(previous || {}),
    ...incoming,
    callId: incoming.callId,
    call: mergeCall(previous?.call, incoming.call, { replaceNested: isLiveSync }),
    recordings: isLiveSync
      ? (incoming.recordings?.length ? incoming.recordings : previous?.recordings || [])
      : mergeQuoRecordings(previous?.recordings, incoming.recordings),
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

export type QuoLiveBundle = {
  call: QuoCall | null;
  recordings: QuoRecording[];
  transcript: QuoTranscript | null;
  summary: QuoSummary | null;
  voicemail: QuoVoicemail | null;
};

/**
 * Apply a live Quo API snapshot without pairing a new recording URL
 * with a stale webhook transcript (or the reverse).
 *
 * - Both live recording + transcript → take both (coherent snapshot)
 * - Live recording only, existing transcript → keep existing pair until transcript catches up
 * - Live transcript only → update transcript (normal ASR lag after recording webhook)
 * - Live recording only, no existing transcript → take recording
 */
export function syncQuoCallDataFromLive(
  existing: QuoCallData,
  live: QuoLiveBundle,
): QuoCallData {
  const liveRecordings = live.recordings || [];
  const hasLiveRecordings = liveRecordings.length > 0;
  const hasLiveTranscript = hasTranscriptDialogue(live.transcript);
  const hasExistingTranscript = hasTranscriptDialogue(existing.transcript);
  const hasExistingRecordings = recordingsForQuoCall(existing).length > 0;

  let nextRecordings = existing.recordings || [];
  let nextTranscript = existing.transcript || null;
  /** Replace call.media / call.recordings from live (do not merge stale mirrors). */
  let replaceNested = false;
  /** Keep existing audio mirrors so recordingsForQuoCall cannot surface a newer live URL. */
  let freezeAudio = false;

  if (hasLiveRecordings && hasLiveTranscript) {
    nextRecordings = liveRecordings;
    nextTranscript = live.transcript;
    replaceNested = true;
  } else if (hasLiveRecordings && !hasLiveTranscript) {
    if (!hasExistingTranscript) {
      nextRecordings = liveRecordings;
      replaceNested = true;
    } else {
      freezeAudio = true;
    }
  } else if (!hasLiveRecordings && hasLiveTranscript) {
    nextTranscript = live.transcript;
    // Keep existing audio mirrors; only the dialogue is catching up.
    if (hasExistingRecordings) freezeAudio = true;
  }

  const nextCall = live.call
    ? {
        ...(existing.call || {}),
        ...definedFields(live.call as Record<string, unknown>),
        media: freezeAudio
          ? (existing.call?.media ?? null)
          : replaceNested
            ? (live.call.media ?? null)
            : mergeMedia(existing.call?.media, live.call.media),
        recordings: freezeAudio
          ? (existing.call?.recordings ?? null)
          : replaceNested
            ? mergeQuoRecordings(live.call.recordings, liveRecordings)
            : mergeQuoRecordings(existing.call?.recordings, live.call.recordings),
        voicemail: live.voicemail || live.call.voicemail || existing.call?.voicemail || null,
      }
    : existing.call;

  return mergeQuoCallData(existing, {
    callId: existing.callId,
    call: nextCall,
    recordings: nextRecordings,
    transcript: nextTranscript,
    summary: live.summary?.summary?.length ? live.summary : existing.summary || null,
    voicemail: live.voicemail || existing.voicemail || null,
    lastEventAt: new Date().toISOString(),
    eventTypes: ["call.sync"],
  }, "call.sync");
}
