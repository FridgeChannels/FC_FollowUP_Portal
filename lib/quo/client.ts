import { getQuoApiKey } from "./config";
import type {
  QuoApiEnvelope,
  QuoCall,
  QuoRecording,
  QuoSummary,
  QuoTranscript,
  QuoVoicemail,
} from "./types";

const QUO_API = "https://api.quo.com/v1";

async function quoFetch<T>(path: string) {
  const key = getQuoApiKey();
  if (!key) throw new Error("QUO_API_KEY is not configured");
  const response = await fetch(`${QUO_API}${path}`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Quo ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

const encodedCallId = (callId: string) => encodeURIComponent(callId);

export function quoApiConfigured() {
  return !!getQuoApiKey();
}

export async function getQuoCall(callId: string) {
  return quoFetch<QuoApiEnvelope<QuoCall>>(`/calls/${encodedCallId(callId)}`);
}

export async function getQuoRecordings(callId: string) {
  return quoFetch<QuoApiEnvelope<QuoRecording[]>>(`/call-recordings/${encodedCallId(callId)}`);
}

export async function getQuoTranscript(callId: string) {
  return quoFetch<QuoApiEnvelope<QuoTranscript>>(`/call-transcripts/${encodedCallId(callId)}`);
}

export async function getQuoSummary(callId: string) {
  return quoFetch<QuoApiEnvelope<QuoSummary>>(`/call-summaries/${encodedCallId(callId)}`);
}

export async function getQuoVoicemail(callId: string) {
  return quoFetch<QuoApiEnvelope<QuoVoicemail | null>>(`/call-voicemails/${encodedCallId(callId)}`);
}

export async function getQuoCallBundle(callId: string) {
  const [call, recordings, transcript, summary, voicemail] = await Promise.allSettled([
    getQuoCall(callId),
    getQuoRecordings(callId),
    getQuoTranscript(callId),
    getQuoSummary(callId),
    getQuoVoicemail(callId),
  ]);
  return {
    call: call.status === "fulfilled" ? call.value.data : null,
    recordings: recordings.status === "fulfilled" ? recordings.value.data || [] : [],
    transcript: transcript.status === "fulfilled" ? transcript.value.data : null,
    summary: summary.status === "fulfilled" ? summary.value.data : null,
    voicemail: voicemail.status === "fulfilled" ? voicemail.value.data : null,
    errors: [call, recordings, transcript, summary, voicemail]
      .map((item) => item.status === "rejected" ? (item.reason instanceof Error ? item.reason.message : String(item.reason)) : null)
      .filter((item): item is string => !!item),
  };
}
