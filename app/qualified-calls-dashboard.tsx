"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PhoneCall, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QualifiedCallDashboardDay } from "@/lib/qualified-call-dashboard";

type DashboardPayload = {
  timeZone?: string;
  days?: QualifiedCallDashboardDay[];
  error?: string;
};

function formatDay(value: string, timeZone: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatQualifiedTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function DashboardLoading() {
  return (
    <div className="mx-auto max-w-3xl px-1 py-1">
      <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-10 h-28 animate-pulse rounded-3xl bg-slate-200/70" />
      <div className="mt-10 space-y-8">
        {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-200/60" />)}
      </div>
    </div>
  );
}

async function requestDashboard() {
  const response = await fetch("/api/dashboard/qualified-calls");
  const payload = await response.json() as DashboardPayload;
  if (!response.ok) throw new Error(payload.error || "Unable to load dashboard");
  return payload;
}

export function QualifiedCallsDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    requestDashboard()
      .then((payload) => setData(payload))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load dashboard"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    void requestDashboard()
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load dashboard"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardLoading />;

  if (error) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-start justify-center px-1">
        <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Dashboard</h1>
        <p className="mt-3 text-sm text-slate-500">{error}</p>
        <Button className="mt-6" onClick={load}><RotateCw className="mr-2 size-4" />Try again</Button>
      </div>
    );
  }

  const days = data?.days || [];
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const timeZone = data?.timeZone || "America/New_York";

  return (
    <div className="mx-auto max-w-3xl px-1 pb-10">
      <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">Dashboard</h1>

      <div className="mt-8 flex items-end justify-between gap-5 bg-violet-50 px-5 py-6 sm:px-7">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold text-violet-800"><CheckCircle2 className="size-4" />Qualified calls</span>
          <span className="mt-2 block text-5xl font-bold tracking-[-0.065em] text-slate-950">{total}</span>
        </span>
        <span className="pb-1 text-right text-xs font-medium text-slate-500">Current Qualified<br />{timeZone}</span>
      </div>

      {days.length ? (
        <div className="mt-10 space-y-10">
          {days.map((day) => (
            <section key={day.date} aria-label={`${formatDay(day.date, timeZone)} Qualified calls`}>
              <div className="flex items-baseline justify-between gap-4">
                <time className="text-sm font-semibold text-slate-900">{formatDay(day.date, timeZone)}</time>
                <span className="shrink-0 text-sm font-semibold text-violet-700">{day.total}</span>
              </div>
              <div className="mt-4 space-y-6">
                {day.callers.map((caller) => (
                  <div key={`${day.date}-${caller.id || "unassigned"}`} className="space-y-3">
                    <div className="flex items-center justify-between gap-4 px-1">
                      <span className="truncate text-sm font-semibold text-slate-800">{caller.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-slate-500">{caller.total}</span>
                    </div>
                    <div className="space-y-1">
                      {caller.calls.map((call) => (
                        <button
                          key={call.taskId}
                          type="button"
                          onClick={() => router.push(`/tasks/${encodeURIComponent(call.taskId)}`)}
                          className="group flex w-full items-start gap-3 px-1 py-3 text-left transition-colors active:scale-[0.99] hover:bg-white/70"
                        >
                          <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 group-active:bg-violet-100 group-active:text-violet-700"><PhoneCall className="size-3.5" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{call.brandName || call.taskTitle}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">Task · {call.taskTitle}</span>
                            <span className="mt-1 block text-xs text-slate-500">AccountManager · {call.reviewerName || call.reviewerEmail || "Not recorded"}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{formatQualifiedTime(call.qualifiedAt, timeZone)} · Call record {call.callId || "not linked"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-20 flex flex-col items-center text-center text-slate-500">
          <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400"><CheckCircle2 className="size-5" /></span>
          <p className="mt-4 text-sm font-medium">No Qualified calls yet</p>
        </div>
      )}
    </div>
  );
}
