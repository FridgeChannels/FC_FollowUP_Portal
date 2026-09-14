"use client";

import { useMemo } from "react";
import { AudioLines, Bot, CalendarClock, CheckCircle2, Clock3, ExternalLink, FileAudio, PhoneCall, RefreshCw, ScrollText, UserRound } from "lucide-react";
import type { QuoCallData, QuoTranscriptLine } from "@/lib/quo/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function formatDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatOffset(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, value);
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return <div className="min-w-0"><div className="text-[11px] font-semibold tracking-wide text-slate-400">{label}</div><div className="mt-1 break-words text-sm text-slate-800">{text}</div></div>;
}

function statusClass(status?: string | null) {
  if (status === "completed" || status === "Connected") return "bg-emerald-100 text-emerald-800";
  if (status === "ringing" || status === "processing") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function SpeakerLine({ line }: { line: QuoTranscriptLine }) {
  return <div className="grid grid-cols-[54px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-3 last:border-b-0">
    <div className="pt-0.5 font-mono text-[11px] text-slate-400">{formatOffset(line.start)}</div>
    <div className="min-w-0"><div className="mb-1 text-xs font-semibold text-slate-500">{line.identifier || line.userId || "Speaker"}{line.end !== undefined && line.end !== null ? <span className="ml-2 font-normal text-slate-400">to {formatOffset(line.end)}</span> : null}</div><p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{line.content || ""}</p></div>
  </div>;
}

function AwaitingQuoData() {
  return <section className="mt-6 rounded-2xl bg-slate-50 p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><PhoneCall className="size-4"/></span><div><h3 className="font-bold text-slate-950">Quo call record</h3><p className="mt-1 text-sm leading-6 text-slate-600">Call status, recording, transcript, and AI summary will appear here automatically after Quo sends them back.</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4"><div><div className="text-slate-500">Call</div><div className="mt-1 font-medium text-slate-700">Waiting</div></div><div><div className="text-slate-500">Recording</div><div className="mt-1 font-medium text-slate-700">Waiting</div></div><div><div className="text-slate-500">Transcript</div><div className="mt-1 font-medium text-slate-700">Waiting</div></div><div><div className="text-slate-500">AI summary</div><div className="mt-1 font-medium text-slate-700">Waiting</div></div></div>
  </section>;
}

export function QuoCallPanel({ data, onRefresh, refreshing = false }: { data: QuoCallData | null; onRefresh?: () => void; refreshing?: boolean }) {
  const raw = useMemo(() => data ? JSON.stringify(data, null, 2) : "", [data]);
  if (!data) return <AwaitingQuoData/>;
  const call = data.call;
  const recordings = data.recordings || [];
  const dialogue = data.transcript?.dialogue || [];
  const summary = data.summary?.summary || [];
  const nextSteps = data.summary?.nextSteps || [];
  const jobs = data.summary?.jobs || [];
  const callStatus = call?.status || data.transcript?.status || data.summary?.status;
  const eventTypes = new Set(data.eventTypes || []);
  const received = [
    { label: "Call", ready: eventTypes.has("call.ringing") || eventTypes.has("call.completed"), icon: PhoneCall },
    { label: "Recording", ready: eventTypes.has("call.recording.completed") || recordings.length > 0, icon: FileAudio },
    { label: "Transcript", ready: eventTypes.has("call.transcript.completed") || dialogue.length > 0, icon: ScrollText },
    { label: "AI summary", ready: eventTypes.has("call.summary.completed") || summary.length > 0, icon: Bot },
  ];
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><PhoneCall className="size-4"/></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">Quo call details</h3>{callStatus ? <Badge className={statusClass(callStatus)}>{callStatus}</Badge> : null}</div><p className="mt-1 text-xs text-slate-500">Call ID · {data.callId}</p></div></div>
      {onRefresh ? <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`mr-2 size-3.5 ${refreshing ? "animate-spin" : ""}`}/>Refresh Quo data</Button> : null}
    </div>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">{received.map((item) => { const Icon = item.icon; return <div key={item.label} className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-lg ${item.ready ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{item.ready ? <CheckCircle2 className="size-4"/> : <Icon className="size-4"/>}</span><div><div className="text-slate-500">{item.label}</div><div className={`text-xs font-semibold ${item.ready ? "text-emerald-700" : "text-slate-500"}`}>{item.ready ? "Received" : "Waiting"}</div></div></div>; })}</div>
      <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Direction" value={call?.direction}/><Field label="Duration" value={formatDuration(call?.duration || data.transcript?.duration)}/><Field label="Created" value={formatDate(call?.createdAt)}/><Field label="Completed" value={formatDate(call?.completedAt)}/>
        <Field label="From" value={call?.from}/><Field label="To" value={call?.to}/><Field label="Answered at" value={formatDate(call?.answeredAt)}/><Field label="Updated" value={formatDate(call?.updatedAt)}/>
      </div>
      <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Participants" value={call?.participants?.join(", ")}/><Field label="Quo user ID" value={call?.userId}/><Field label="Initiated by" value={call?.initiatedBy}/><Field label="Answered by" value={call?.answeredBy}/><Field label="Phone number ID" value={call?.phoneNumberId}/><Field label="Conversation ID" value={call?.conversationId}/><Field label="Call route" value={call?.callRoute}/><Field label="AI handled" value={call?.aiHandled}/><Field label="Forwarded from" value={call?.forwardedFrom}/><Field label="Forwarded to" value={call?.forwardedTo}/>
      </div>

      {recordings.length ? <div><div className="mb-3 flex items-center gap-2 font-bold"><FileAudio className="size-4 text-violet-600"/>Recordings <Badge variant="secondary">{recordings.length}</Badge></div><div className="space-y-3">{recordings.map((recording, index) => <div key={recording.id || `${recording.url}-${index}`} className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Recording {index + 1} · {recording.type || "audio"}</span><span>{formatDuration(recording.duration)} · {recording.status || "—"}</span></div>{recording.url ? <><audio className="w-full" controls preload="metadata" src={recording.url}>Your browser does not support audio playback.</audio><a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:text-violet-900" href={recording.url} target="_blank" rel="noreferrer">Open recording <ExternalLink className="size-3"/></a></> : <p className="text-sm text-slate-500">Recording URL is not available yet.</p>}</div>)}</div></div> : null}

      {data.voicemail || call?.voicemail ? <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><div className="mb-3 flex items-center gap-2 font-bold text-amber-950"><AudioLines className="size-4"/>Voicemail</div><div className="grid gap-3 sm:grid-cols-4"><Field label="Status" value={data.voicemail?.status || call?.voicemail?.status}/><Field label="Duration" value={formatDuration(data.voicemail?.duration || call?.voicemail?.duration)}/><Field label="Voicemail ID" value={data.voicemail?.id || call?.voicemail?.id}/><Field label="Type" value={data.voicemail?.type || call?.voicemail?.type}/></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-950">{data.voicemail?.transcript || call?.voicemail?.transcript || "No voicemail transcript available."}</p>{(data.voicemail?.recordingUrl || data.voicemail?.url || call?.voicemail?.recordingUrl || call?.voicemail?.url) ? <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-800" href={data.voicemail?.recordingUrl || data.voicemail?.url || call?.voicemail?.recordingUrl || call?.voicemail?.url || undefined} target="_blank" rel="noreferrer">Open voicemail recording <ExternalLink className="size-3"/></a> : null}</div> : null}

      {summary.length || nextSteps.length || jobs.length ? <div className="grid gap-4 lg:grid-cols-3"><div className="rounded-xl bg-violet-50 p-4"><div className="mb-2 flex items-center gap-2 font-bold text-violet-950"><Bot className="size-4"/>AI summary</div>{summary.length ? <ul className="space-y-2 text-sm leading-6 text-violet-950">{summary.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul> : <p className="text-sm text-violet-900/70">No summary returned.</p>}</div><div className="rounded-xl bg-emerald-50 p-4"><div className="mb-2 flex items-center gap-2 font-bold text-emerald-950"><CalendarClock className="size-4"/>Next steps</div>{nextSteps.length ? <ul className="space-y-2 text-sm leading-6 text-emerald-950">{nextSteps.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul> : <p className="text-sm text-emerald-900/70">No next steps returned.</p>}</div><div className="rounded-xl bg-slate-100 p-4"><div className="mb-2 flex items-center gap-2 font-bold text-slate-950"><Clock3 className="size-4"/>Jobs</div>{jobs.length ? <div className="space-y-3">{jobs.map((job, index) => <div key={`${job.name || "job"}-${index}`} className="rounded-lg bg-white p-3"><div className="text-sm font-semibold">{job.name || "Unnamed job"}</div>{job.result?.data?.map((item, itemIndex) => <div key={`${item.name || "value"}-${itemIndex}`} className="mt-1 text-xs text-slate-600">{item.name || "Value"}: {item.value || "—"}</div>)}</div>)}</div> : <p className="text-sm text-slate-500">No jobs returned.</p>}</div></div> : null}

      {dialogue.length ? <div><div className="mb-3 flex items-center gap-2 font-bold"><UserRound className="size-4 text-blue-600"/>Full transcript <Badge variant="secondary">{dialogue.length} lines</Badge></div><div className="rounded-xl border border-slate-200 px-4">{dialogue.map((line, index) => <SpeakerLine key={`${line.start}-${line.end}-${index}`} line={line}/>)}</div></div> : null}
      <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">Show complete Quo payload</summary><pre className="max-h-[420px] overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-200">{raw}</pre></details>
      <div className="flex flex-wrap gap-2 text-xs text-slate-500"><span>Events received: {data.eventTypes?.join(", ") || "—"}</span><span>·</span><span>Last sync: {formatDate(data.lastEventAt)}</span></div>
    </div>
  </section>;
}
