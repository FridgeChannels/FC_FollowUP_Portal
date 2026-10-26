"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { ArrowUpRight, FileText, SmartphoneNfc } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  summarize,
  type SignalBrand,
  type SignalEvent,
  type SignalType,
} from "@/lib/signals/model";
import { ChannelIcon } from "./channel-icon";
import { usePageMetadata } from "./use-page-metadata";
import { useSignals } from "./signals-store";
import { formatScheduledDateTime } from "@/lib/display-time";
import { buildSignalQueue } from "@/lib/signals/queue";
import { MOCK_PILOT_INFO } from "@/lib/mock-pilot-info";
import { portalNavigate } from "@/app/portal-navigate";

const types = {
  sample: {
    label: "Sample Tap",
    style: "text-[#7C3AED] dark:text-violet-300",
  },
  email: {
    label: "Email Open",
    style: "text-[#B45309] dark:text-amber-300",
  },
  linkedin: {
    label: "LinkedIn",
    style: "text-[#0A66C2] dark:text-blue-300",
  },
};

function SignalLabel({ type, muted = false }: { type: SignalType; muted?: boolean }) {
  const { label, style } = types[type];
  const icon = type === "email"
    ? <ChannelIcon channel="Email" className="size-3.5" alt="" />
    : type === "linkedin"
      ? <ChannelIcon channel="LinkedIn" className="size-3.5" alt="" />
      : <SmartphoneNfc className="size-3.5" />;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${muted ? "text-slate-400 grayscale" : style}`}>
      {icon}
      {label}
    </span>
  );
}

function brandDetailHref(brand: SignalBrand, event: SignalEvent) {
  return `/customers/${encodeURIComponent(brand.id)}?returnTo=%2Fsignals&signal=${encodeURIComponent(event.id)}`;
}

function navigateFromLink(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  portalNavigate(href);
}

export function SignalsPage() {
  usePageMetadata({
    title: "Signals",
    description: "Review customer signals and follow up in one workspace.",
  });
  const { data, error, refresh, settle } = useSignals();
  const [type, setType] = useState<SignalType | "pilot_info" | "all">("all");
  const queue = useMemo(() => type === "pilot_info" ? [] : buildSignalQueue(data?.brands || [], type), [data, type]);
  const summary = summarize(data?.brands || []);
  const showPilotInfoMock = type === "all" || type === "pilot_info";
  const pilotBrand = data?.brands.find((brand) =>
    brand.id.replace(/-/g, "").toLowerCase() === MOCK_PILOT_INFO.brandId.replace(/-/g, "").toLowerCase() ||
    brand.name.trim().toLowerCase() === MOCK_PILOT_INFO.brandName.toLowerCase(),
  );
  const pilotBrandId = pilotBrand?.id || MOCK_PILOT_INFO.brandId;
  const pilotInfoHref = `/customers/${encodeURIComponent(pilotBrandId)}?returnTo=%2Fsignals&pilotInfo=1#brand-pilot-info`;

  const markBrandRead = (brand: SignalBrand) => {
    const newReadIds = brand.events
      .filter((event) => event.isNewSignal && !brand.readEventIds?.includes(event.signalReadId || event.id))
      .map((event) => event.signalReadId || event.id);
    if (!newReadIds.length) return;
    const fresh = new Set(brand.newEventIds || brand.events.filter((event) => event.isNewSignal).map((event) => event.id));
    const snapshot = [...new Set([...(brand.readEventIds || []), ...newReadIds])].filter((id) => fresh.has(id));
    settle(brand.id, snapshot);
    void fetch(`/api/signals/${encodeURIComponent(brand.id)}`, {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", eventIds: snapshot }),
    }).then((response) => {
      if (!response.ok) {
        toast.error("Unable to update read status");
        void refresh();
      }
    }).catch(() => {
      toast.error("Unable to update read status");
      void refresh();
    });
  };

  return (
    <div className="mx-auto max-w-[1480px] text-foreground">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-2xl font-bold tracking-[-.035em] text-slate-950 sm:text-[28px]">Signals</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{summary.unread + Number(showPilotInfoMock)} new signal{summary.unread + Number(showPilotInfoMock) === 1 ? "" : "s"}</p>
      </header>
      <div className="my-5 flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
          <SelectTrigger aria-label="Signal type" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {Object.entries(types).map(([key, signalType]) => (
              <SelectItem key={key} value={key}>{signalType.label}</SelectItem>
            ))}
            <SelectItem value="pilot_info">Pilot Info</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <div role="alert" className="mb-6 text-sm text-muted-foreground">
          Unable to refresh signals.{" "}
          <Button variant="link" onClick={() => void refresh()}>Retry</Button>
        </div>
      ) : null}
      {!data && !error ? (
        <div className="space-y-3" aria-label="Loading signals">
          {[1, 2, 3].map((index) => <Skeleton key={index} className="h-20 w-full" />)}
        </div>
      ) : (
        <section aria-label="Brand queue" className="w-full">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Brand Queue</h2>
          </div>
          {queue.length || showPilotInfoMock ? (
            <div className="space-y-2">
              {showPilotInfoMock ? <article className="grid w-full gap-4 rounded-md bg-emerald-50/70 px-4 py-4 ring-1 ring-emerald-100 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="size-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" aria-label="Unread" />
                    <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{pilotBrand?.name || MOCK_PILOT_INFO.brandName}</h3>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800"><FileText className="size-3.5" />Pilot Info By Brand · {MOCK_PILOT_INFO.status}</span>
                    <time dateTime={MOCK_PILOT_INFO.occurredAt} title={formatScheduledDateTime(MOCK_PILOT_INFO.occurredAt)} className="text-xs text-muted-foreground">{formatScheduledDateTime(MOCK_PILOT_INFO.occurredAt)}</time>
                  </div>
                  <p className="mt-1 text-sm text-slate-700"><span className="font-medium">Pilot info ready for review.</span> {MOCK_PILOT_INFO.summary}</p>
                </div>
                <div className="relative z-10 flex items-center justify-end gap-2">
                  <a href={pilotInfoHref} onClick={(event) => navigateFromLink(event, pilotInfoHref)} className="relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2">View Pilot Info <ArrowUpRight className="size-4" /></a>
                </div>
              </article> : null}
              {queue.map(({ brand, latest }) => {
                const isUnread = brand.unread;
                return (
                  <article
                    key={brand.id}
                    className={`grid w-full gap-4 rounded-md px-4 py-4 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${isUnread ? "bg-slate-100/90" : "bg-slate-100/40"}`}
                  >
                    <div className="pointer-events-none relative min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        {isUnread ? <span className="size-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" aria-label="Unread" /> : null}
                        <h3 className={`min-w-0 truncate text-sm ${isUnread ? "font-semibold text-foreground" : "font-medium text-slate-400"}`}>{brand.name}</h3>
                        <SignalLabel type={latest.type} muted={!isUnread} />
                        <time dateTime={latest.occurredAt} title={formatScheduledDateTime(latest.occurredAt)} className={`text-xs ${isUnread ? "text-muted-foreground" : "text-slate-400"}`}>
                          {formatScheduledDateTime(latest.occurredAt)}
                        </time>
                      </div>
                      <p className={`mt-1 truncate text-sm ${isUnread ? "text-muted-foreground" : "text-slate-400"}`}>{latest.summary}</p>
                    </div>
                    <div className="relative z-10 flex items-center justify-end gap-2">
                      <a
                        href={brandDetailHref(brand, latest)}
                        onClick={(event) => {
                          navigateFromLink(event, brandDetailHref(brand, latest));
                          markBrandRead(brand);
                        }}
                        className={`relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isUnread ? "bg-blue-700 text-white shadow-sm hover:bg-blue-800" : "bg-slate-200/70 text-slate-500 hover:bg-slate-200"}`}
                      >
                        Take Action Now <ArrowUpRight className="size-4" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{data?.brands.length ? "No brands match this filter" : "No signals yet"}</p>
          )}
        </section>
      )}
    </div>
  );
}
