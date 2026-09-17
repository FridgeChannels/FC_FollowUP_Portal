"use client";

import {
  Activity,
  Bot,
  CalendarClock,
  Clock3,
  ExternalLink,
  FileAudio,
  PhoneCall,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import type {
  QuoCallData,
  QuoJob,
  QuoRecording,
  QuoTranscriptLine,
  QuoVoicemail,
} from "@/lib/quo/types";
import { formatScheduledDateTime } from "@/lib/display-time";
import { recordingsForQuoCall } from "@/lib/quo/data";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return formatScheduledDateTime(value) || value;
}

function formatDuration(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function DataValue({ value }: { value: unknown }) {
  if (!hasValue(value)) return <span>—</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return <a className="inline-flex max-w-full items-center gap-1 break-all font-medium text-violet-700 hover:text-violet-900" href={value} target="_blank" rel="noreferrer">Open link <ExternalLink className="size-3 shrink-0"/></a>;
  }
  if (Array.isArray(value) && value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
    return <span>{value.length ? value.map((item) => String(item ?? "—")).join(", ") : "—"}</span>;
  }
  if (typeof value === "object") {
    return <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-[11px] leading-5 text-slate-100">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span>{String(value)}</span>;
}

function Field({ label, value }: { label: string; value?: unknown }) {
  return <div className="min-w-0">
    <div className="text-[11px] font-semibold tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 break-words text-sm text-slate-800"><DataValue value={value}/></div>
  </div>;
}

function SpeakerLine({ line }: { line: QuoTranscriptLine }) {
  return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{line.content || "—"}</p>;
}

function Recording({ recording }: { recording: QuoRecording }) {
  return <div className="rounded-xl bg-slate-50 p-4">
    <Field label="Duration" value={formatDuration(recording.duration)}/>
    {recording.url ? <div className="mt-3">
      <audio className="w-full" controls preload="metadata" src={recording.url}>Your browser does not support audio playback.</audio>
    </div> : <p className="mt-3 text-sm text-slate-500">Recording URL is not available yet.</p>}
  </div>;
}

function Voicemail({ voicemail }: { voicemail: QuoVoicemail }) {
  const recordingUrl = voicemail.recordingUrl || voicemail.url;
  return <div className="rounded-xl bg-amber-50 p-4">
      <div className="mb-3 text-sm font-semibold text-amber-950">Voicemail</div>
      <Field label="Duration" value={formatDuration(voicemail.duration)}/>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-amber-950">{voicemail.transcript || "No voicemail transcript returned."}</p>
      {recordingUrl ? <div className="mt-3"><audio className="w-full" controls preload="metadata" src={recordingUrl}>Your browser does not support audio playback.</audio></div> : null}
  </div>;
}

function Job({ job, index }: { job: QuoJob; index: number }) {
  return <div className="rounded-xl bg-slate-50 p-4">
    <div className="text-sm font-semibold text-slate-900">{job.name || `Job ${index + 1}`}</div>
    {job.result?.data?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{job.result.data.map((item, itemIndex) => <Field key={`${item.name || "value"}-${itemIndex}`} label={item.name || `Value ${itemIndex + 1}`} value={item.value}/>)}</div> : null}
  </div>;
}

function AwaitingQuoData() {
  return <section className="mt-6 rounded-2xl bg-slate-50 p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><PhoneCall className="size-4"/></span><div><h3 className="font-bold text-slate-950">Quo call record</h3><p className="mt-1 text-sm leading-6 text-slate-600">Call status, recording, transcript, AI summary, and webhook receipts will appear here automatically.</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">{["Call", "Recording", "Transcript", "AI summary"].map((label) => <div key={label}><div className="text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-700">Waiting</div></div>)}</div>
  </section>;
}

export function QuoCallPanel({
  data,
  onRefresh,
  refreshing = false,
  compact = false,
}: {
  data: QuoCallData | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
}) {
  if (!data) return compact ? null : <AwaitingQuoData/>;

  const call = data.call;
  const recordings = recordingsForQuoCall(data);
  const voicemail = data.voicemail || call?.voicemail || null;
  const dialogue = data.transcript?.dialogue || [];
  const summary = data.summary?.summary || [];
  const nextSteps = data.summary?.nextSteps || [];
  const jobs = data.summary?.jobs || [];
  const eventTypes = new Set(data.eventTypes || []);

  return <section className={compact ? "rounded-xl bg-white p-4" : "mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5"}>
    <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
      <div className="flex min-w-0 items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><PhoneCall className="size-4"/></span><h3 className="pt-1 font-bold text-slate-950">Quo call details</h3></div>
      {onRefresh ? <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`mr-2 size-3.5 ${refreshing ? "animate-spin" : ""}`}/>Refresh Quo data</Button> : null}
    </div>
    <Tabs defaultValue="call">
      <TabsList variant="line" className="grid h-11 w-full grid-cols-4 gap-0">
        <TabsTrigger value="call" className="min-w-0 px-1 text-xs sm:text-sm"><Activity className="size-3.5"/>Call</TabsTrigger>
        <TabsTrigger value="recording" className="min-w-0 px-1 text-xs sm:text-sm"><FileAudio className="size-3.5"/>Recording</TabsTrigger>
        <TabsTrigger value="summary" className="min-w-0 px-1 text-xs sm:text-sm"><Bot className="size-3.5"/>Summary</TabsTrigger>
        <TabsTrigger value="transcript" className="min-w-0 px-1 text-xs sm:text-sm"><UsersRound className="size-3.5"/>Transcript</TabsTrigger>
      </TabsList>

      <TabsContent value="call" className="mt-5">
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Call ID" value={call?.id || data.callId}/><Field label="Status" value={call?.status}/><Field label="Started" value={formatDate(call?.createdAt)}/><Field label="Answered" value={formatDate(call?.answeredAt)}/><Field label="Completed" value={formatDate(call?.completedAt)}/><Field label="Duration" value={formatDuration(call?.duration ?? data.transcript?.duration)}/><Field label="From" value={call?.from}/><Field label="To" value={call?.to}/></div>
      </TabsContent>

      <TabsContent value="recording" className="mt-5 space-y-4">
        {recordings.length ? recordings.map((recording, index) => <Recording key={recording.id || recording.url || index} recording={recording}/>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{eventTypes.has("call.recording.completed") ? "Quo reported that recording processing completed, but no recording file was included." : "No recording available yet."}</p>}
        {voicemail ? <Voicemail voicemail={voicemail}/> : null}
      </TabsContent>

      <TabsContent value="summary" className="mt-5">
        {data.summary || eventTypes.has("call.summary.completed") ? <div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl bg-violet-50 p-4"><div className="mb-2 font-semibold text-violet-950">Summary</div>{summary.length ? <ul className="space-y-2 text-sm leading-6 text-violet-950">{summary.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul> : <p className="text-sm text-violet-900/70">No summary returned.</p>}</div><div className="rounded-xl bg-emerald-50 p-4"><div className="mb-2 flex items-center gap-2 font-semibold text-emerald-950"><CalendarClock className="size-4"/>Next steps</div>{nextSteps.length ? <ul className="space-y-2 text-sm leading-6 text-emerald-950">{nextSteps.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span>•</span><span>{item}</span></li>)}</ul> : <p className="text-sm text-emerald-900/70">No next steps returned.</p>}</div></div>{jobs.length ? <div className="mt-4 space-y-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Clock3 className="size-4"/>Jobs</div>{jobs.map((job, index) => <Job key={`${job.name || "job"}-${index}`} job={job} index={index}/>)}</div> : null}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No AI summary available yet.</p>}
      </TabsContent>

      <TabsContent value="transcript" className="mt-5">
        {data.transcript || eventTypes.has("call.transcript.completed")
          ? dialogue.length
            ? <div className="space-y-3 rounded-xl bg-slate-50 p-4">{dialogue.map((line, index) => <SpeakerLine key={`${line.start}-${line.end}-${index}`} line={line}/>)}</div>
            : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Quo returned the transcript event without dialogue lines.</p>
          : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No transcript available yet.</p>}
      </TabsContent>
    </Tabs>
  </section>;
}
