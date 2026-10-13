"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ExternalLink, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { reportToday, type CallerNotionReport } from "@/lib/caller-notion";
import { getDisplayTimeZone } from "@/lib/display-time";

type ReportPayload = { reports?: CallerNotionReport[]; report?: CallerNotionReport; today?: string; timeZone?: string; callerName?: string; mock?: boolean; error?: string };

export function TodaysNotion() {
  const id = useId();
  const [reports, setReports] = useState<CallerNotionReport[]>([]);
  const [today, setToday] = useState(() => reportToday(getDisplayTimeZone()));
  const [date, setDate] = useState(today);
  const [zone, setZone] = useState(getDisplayTimeZone());
  const [callerName, setCallerName] = useState("Caller Name");
  const [mockMode, setMockMode] = useState(false);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const selected = reports.find((report) => report.date === date);
  const load = useCallback(() => {
    return fetch("/api/caller-notion", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ReportPayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load Notion links.");
        return payload;
      })
      .then((payload) => {
        if (!mounted.current) return;
        setReports(payload.reports || []);
        if (payload.today) setToday(payload.today);
        if (payload.timeZone) setZone(payload.timeZone);
        if (payload.callerName) setCallerName(payload.callerName);
        setMockMode(Boolean(payload.mock));
      })
      .catch((reason: unknown) => {
        if (mounted.current) setError(reason instanceof Error ? reason.message : "Unable to load Notion links.");
      })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);
  // Keep the default date correct when a dashboard remains open overnight.
  useEffect(() => {
    const update = () => {
      const next = reportToday(zone);
      setToday((previous) => {
        if (next !== previous) setDate((chosen) => chosen === previous ? next : chosen);
        return next;
      });
    };
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", update); };
  }, [zone]);

  async function save() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/caller-notion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, url: url.trim() }) });
      const payload = await response.json() as ReportPayload;
      if (!response.ok || !payload.report) throw new Error(payload.error || "Unable to save Notion link.");
      const report = payload.report;
      setReports((current) => [...current.filter((item) => item.date !== report.date), report]);
      setEditing(false); setUrl("");
      window.dispatchEvent(new Event("caller-notion-updated"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save Notion link."); }
    finally { setSaving(false); }
  }

  const showForm = !loading && (!selected || editing);
  return <section aria-label="Daily Notion report" className="mb-7 rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><FileText className="size-5" /></span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-950">{date === today ? "Today's Notion" : "Daily Notion"}</h2>
            {mockMode ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Mock · no Notion write</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">One report for all your calls that day</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-date`} className="sr-only">Report date</label>
        <Input id={`${id}-date`} type="date" value={date} max={today} disabled={saving} onChange={(event) => { setDate(event.target.value); setEditing(false); setUrl(""); setError(""); }} className="h-9 w-40 text-xs" />
        {date !== today ? <Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDate(today); setEditing(false); setUrl(""); setError(""); }}>Today</Button> : null}
      </div>
    </div>
    {loading ? <p role="status" className="mt-4 text-xs text-slate-500">Loading Notion link…</p> : selected && !editing ? <div className="mt-4 flex flex-wrap items-center gap-3">
      <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">Linked <Check className="size-3.5" /></span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-slate-700">{selected.title}</p>
        <a href={selected.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-xs text-violet-700 underline-offset-2 hover:underline">{selected.url}</a>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" className="size-8" asChild>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" aria-label="Open Notion report"><ExternalLink className="size-3.5" /></a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="Edit Notion report" onClick={() => { setEditing(true); setUrl(selected.url); setError(""); }}><Pencil className="size-3.5" /></Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div> : null}
    {showForm ? <form className="mt-4 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label htmlFor={`${id}-url`} className="text-xs font-medium text-slate-700">Notion daily report URL</label>
      <div className="flex flex-wrap gap-2">
        <Input id={`${id}-url`} type="url" required value={url} onChange={(event) => setUrl(event.target.value)} disabled={saving || loading} placeholder="https://www.notion.so/…" className="min-w-0 flex-1 basis-60" aria-describedby={`${id}-hint`} />
        {editing ? <Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditing(false); setUrl(""); setError(""); }}>Cancel</Button> : null}
        <Button type="submit" disabled={saving || loading || !url.trim() || !date}>{saving ? "Checking & saving…" : "Save link"}</Button>
      </div>
      <p id={`${id}-hint`} className="text-xs leading-5 text-slate-500">Page title: {callerName} {date ? `${date.slice(5, 7)}-${date.slice(8)}-${date.slice(0, 4)}` : "MM-DD-YYYY"}. Dates follow {zone}. Select an earlier date to add or edit a past report.</p>
    </form> : null}
    {error ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-rose-700"><p role="alert">{error}</p><Button size="sm" variant="ghost" disabled={saving || loading} onClick={() => { setLoading(true); setError(""); void load(); }}>Retry</Button></div> : null}
  </section>;
}
