"use client";

import { formatBusinessDate } from "@/lib/display-time";
import { ArrowLeft, ArrowUpRight, ChevronDown, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandDetail, BrandMeetingNote } from "@/lib/brand-list";
import type { ExhibitionEncounter, FollowupHistory } from "@/lib/followup-history";

function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? formatBusinessDate(value) : "Not recorded";
}
export function RoundStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status === "Active" ? "bg-emerald-50 text-emerald-700" : status === "Paused" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{status}</span>;
}
function EncounterRecord({ encounter }: { encounter: ExhibitionEncounter }) {
  return <details className="group border-b border-slate-100 last:border-0">
    <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-3 marker:hidden">
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{encounter.exhibition_name}</p><p className="mt-1 text-xs text-slate-500">{date(encounter.meeting_at)} · Met by {encounter.met_by}</p>
        {encounter.key_changes.length > 0 && <p className="mt-1 text-xs text-violet-700">{encounter.key_changes.length} key change{encounter.key_changes.length === 1 ? "" : "s"}</p>}
      </div><ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-3 pb-4 text-sm leading-6 text-slate-600">
      <div><p className="text-xs font-semibold text-slate-500">Meeting notes</p><p className="mt-1 whitespace-pre-wrap break-words">{encounter.meeting_notes || "No notes recorded."}</p></div>
      {!!encounter.key_changes.length && <div><p className="text-xs font-semibold text-slate-500">Key changes</p><ul className="mt-1 space-y-2">{encounter.key_changes.map((change, index) => <li key={index}><span className="font-medium text-slate-800">{change.type}: </span>{change.text}<p className="break-words text-xs text-slate-400">Source: {change.source}</p></li>)}</ul></div>}
      {encounter.next_step && <div><p className="text-xs font-semibold text-slate-500">Next step</p><p className="mt-1 whitespace-pre-wrap">{encounter.next_step}</p></div>}
      {encounter.meeting_record_url && <a href={encounter.meeting_record_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-violet-700 hover:underline">Open original meeting record <ArrowUpRight className="size-3" /></a>}
    </div>
  </details>;
}
export function FollowupHistoryPanel({ history, legacyMeetings, legacyAssignments, onBack, onConversations }: {
  history: FollowupHistory; legacyMeetings: BrandMeetingNote[];
  legacyAssignments: NonNullable<BrandDetail["assignmentHistory"]>;
  onBack: () => void; onConversations: (roundId: string, number: number) => void;
}) {
  const unlinked = history.encounters.filter(e => !e.round_id);
  const legacy = legacyMeetings.filter(m => !history.encounters.some(e => e.id === m.id || e.meeting_record_url === m.url));
  return <div className="space-y-5">
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ArrowLeft className="mr-2 size-4" />Back to Brand details</Button>
    <p className="text-xs leading-5 text-slate-500">One Brand · Multiple Encounters · Continuous Follow-up</p>
    {history.unavailable && <p role="status" className="text-sm text-amber-700">{history.unavailable}</p>}
    {history.projectionPending && <p role="status" className="text-sm text-amber-700">Changes saved. Brand details are waiting to synchronize.</p>}
    {[...history.rounds].sort((a, b) => b.round_number - a.round_number).map(round => {
      const encounters = history.encounters.filter(e => e.round_id === round.id).sort((a, b) => a.meeting_at.localeCompare(b.meeting_at));
      const assignments = history.assignments.filter(a => a.round_id === round.id);
      const origin = history.encounters.find(e => e.id === round.origin_encounter_id);
      const commitments = encounters.flatMap(e => e.key_changes.filter(c => c.type === "Commitment").map(c => ({ ...c, exhibition: e.exhibition_name })));
      return <article key={round.id} className="overflow-hidden rounded-xl border border-slate-200">
        <header className="space-y-2 bg-slate-50 px-3 py-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Round {round.round_number}</h3><RoundStatusBadge status={round.status} /></div>
          <p className="text-sm text-slate-700">AM: {round.assigned_am_name || "Unassigned"}</p>
          <p className="text-xs leading-5 text-slate-500">Started {date(round.started_at)}{round.completed_at ? ` · Ended ${date(round.completed_at)}` : round.status === "Paused" && round.paused_at ? ` · Paused ${date(round.paused_at)}` : ""}</p>
          {origin && <p className="text-xs text-slate-500">Origin: {origin.exhibition_name}</p>}
          {round.migrated && <p className="text-xs text-slate-400">Existing follow-up · unverified dates and meeting associations remain unassigned.</p>}
        </header>
        <div className="px-3">{encounters.length ? encounters.map(e => <EncounterRecord key={e.id} encounter={e} />) : <p className="py-3 text-xs leading-5 text-slate-500">No Exhibition Encounter is confirmed for this Round.</p>}</div>
        {(round.outcome || round.status === "Paused" && round.paused_reason) && <div className="border-t border-slate-100 px-3 py-3"><p className="text-xs font-semibold text-slate-500">{round.status === "Paused" ? "Paused reason" : "Outcome"}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{round.status === "Paused" ? round.paused_reason : round.outcome}</p></div>}
        {!!commitments.length && <details className="border-t border-slate-100 px-3 py-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Important commitments ({commitments.length})</summary><ul className="mt-2 space-y-2 text-sm text-slate-600">{commitments.map((c, i) => <li key={i}>{c.text}<p className="text-xs text-slate-400">{c.exhibition} · {c.source}</p></li>)}</ul></details>}
        {!!assignments.length && <details className="border-t border-slate-100 px-3 py-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">AM assignment changes ({assignments.length})</summary><ol className="mt-2 space-y-3 text-sm text-slate-600">{assignments.map(a => <li key={a.id}>{a.previous_am_name || "Unassigned"} → {a.new_am_name || "Unassigned"}<p className="mt-1 text-xs text-slate-400">{date(a.changed_at)} · by {a.changed_by}</p></li>)}</ol></details>}
        <Button variant="ghost" size="sm" className="m-1 h-auto min-h-11 whitespace-normal text-left text-xs text-violet-700" onClick={() => onConversations(round.id, round.round_number)}><MessageSquareText className="mr-2 size-3.5 shrink-0" />View this Round’s conversations</Button>
      </article>;
    })}
    {!!unlinked.length && <section><h3 className="mb-2 text-sm font-semibold">Encounters without a Round</h3><p className="mb-1 text-xs leading-5 text-slate-500">Meeting again does not start a new follow-up Round.</p>{unlinked.map(e => <EncounterRecord key={e.id} encounter={e} />)}</section>}
    {!!legacy.length && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Original meeting records ({legacy.length})</summary><p className="mt-2 text-xs leading-5 text-slate-500">Preserved records with no verified Round association.</p><ul className="mt-2 space-y-2">{legacy.map(m => <li key={m.id}><a href={m.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-violet-700 hover:underline">{m.title}<ArrowUpRight className="size-3 shrink-0" /></a></li>)}</ul></details>}
    {!!legacyAssignments.length && <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Earlier assignment records</summary><p className="mt-2 text-xs leading-5 text-slate-500">Original brand-level records; no Round association has been inferred.</p><ol className="mt-2 space-y-2 text-sm text-slate-600">{legacyAssignments.map(a => <li key={`${a.ownerId}-${a.assignedAt}`}>{a.ownerName || "Former Account Manager"}<p className="text-xs text-slate-400">{date(a.assignedAt)}{a.handledAt ? " · reviewed" : ""}</p></li>)}</ol></details>}
    {!history.rounds.length && !history.encounters.length && !legacy.length && !legacyAssignments.length && <p className="py-6 text-sm text-slate-500">No follow-up history yet.</p>}
  </div>;
}
