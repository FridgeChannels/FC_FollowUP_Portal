"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Check, SmartphoneNfc } from "lucide-react";
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

function SignalLabel({ type }: { type: SignalType }) {
  const { label, style } = types[type];
  const icon = type === "email"
    ? <ChannelIcon channel="Email" className="size-3.5" alt="" />
    : type === "linkedin"
      ? <ChannelIcon channel="LinkedIn" className="size-3.5" alt="" />
      : <SmartphoneNfc className="size-3.5" />;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${style}`}>
      {icon}
      {label}
    </span>
  );
}

function relativeTime(value: string, now: Date) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 48 * 60) return "Yesterday";
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function latestVisibleEvent(brand: SignalBrand, type: SignalType | "all") {
  const visibleEvents = brand.events.filter((event) => type === "all" || event.type === type);
  return visibleEvents.find(
    (event) => event.isNewSignal && !brand.readEventIds?.includes(event.signalReadId || event.id),
  ) || visibleEvents[0];
}

function brandDetailHref(brand: SignalBrand, event: SignalEvent, mock: boolean) {
  const returnTo = mock ? "/signals?mock=1" : "/signals";
  return `/customers/${encodeURIComponent(brand.id)}?returnTo=${encodeURIComponent(returnTo)}&signal=${encodeURIComponent(event.id)}${mock ? "&mock=1" : ""}`;
}

export function SignalsPage() {
  usePageMetadata({
    title: "Signals",
    description: "Review customer signals and follow up in one workspace.",
  });
  const { data, error, refresh, settle } = useSignals();
  const router = useRouter();
  const params = useSearchParams();
  const showingMock = process.env.NODE_ENV !== "production" && params.get("mock") === "1";
  const [type, setType] = useState<SignalType | "all">("all");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const queue = useMemo(() => {
    const signalTime = (brand: SignalBrand) => Math.max(
      ...brand.events
        .filter((event) => type === "all" || event.type === type)
        .map((event) => Date.parse(event.occurredAt)),
    );
    return [...(data?.brands || [])]
      .filter((brand) => brand.events.some((event) => type === "all" || event.type === type))
      .sort((left, right) => signalTime(right) - signalTime(left));
  }, [data, type]);
  const summary = summarize(data?.brands || [], now);

  const markBrandRead = (brand: SignalBrand) => {
    const newReadIds = brand.events
      .filter((event) => event.isNewSignal && !brand.readEventIds?.includes(event.signalReadId || event.id))
      .map((event) => event.signalReadId || event.id);
    if (!newReadIds.length) return;
    const fresh = new Set(brand.newEventIds || brand.events.filter((event) => event.isNewSignal).map((event) => event.id));
    const snapshot = [...new Set([...(brand.readEventIds || []), ...newReadIds])].filter((id) => fresh.has(id));
    settle(brand.id, snapshot);
    if (showingMock) return;
    void fetch(`/api/signals/${encodeURIComponent(brand.id)}`, {
      method: "PATCH",
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
        <p className="mt-1 text-sm text-muted-foreground">{summary.unread} new signal{summary.unread === 1 ? "" : "s"}</p>
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
          </SelectContent>
        </Select>
        {process.env.NODE_ENV !== "production" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(showingMock ? "/signals" : "/signals?mock=1")}
          >
            {showingMock ? "Exit mock preview" : "Mock preview"}
          </Button>
        ) : null}
      </div>
      {showingMock ? <p className="-mt-3 mb-6 text-xs text-muted-foreground">Mock preview · local actions only</p> : null}
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
          {queue.length ? (
            <div className="space-y-2">
              {queue.map((brand) => {
                const latest = latestVisibleEvent(brand, type);
                if (!latest) return null;
                const isUnread = brand.unread;
                return (
                  <article
                    key={brand.id}
                    className={`grid w-full gap-4 rounded-md px-4 py-4 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${isUnread ? "bg-slate-100/90" : "bg-transparent hover:bg-slate-100/60"}`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        {isUnread ? <span className="size-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" aria-label="Unread" /> : null}
                        <h3 className={`min-w-0 truncate text-sm ${isUnread ? "font-semibold text-foreground" : "font-medium text-slate-600"}`}>{brand.name}</h3>
                        <SignalLabel type={latest.type} />
                        <time dateTime={latest.occurredAt} title={latest.occurredAt} className="text-xs text-muted-foreground">
                          {relativeTime(latest.occurredAt, now)}
                        </time>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{latest.summary}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {isUnread ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-muted-foreground"
                          onClick={() => markBrandRead(brand)}
                          aria-label={`Mark ${brand.name} as read`}
                        >
                          Mark as read
                        </Button>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1 px-2 text-xs text-muted-foreground">
                          <Check className="size-3.5" /> Read
                        </span>
                      )}
                      <Link
                        href={brandDetailHref(brand, latest, showingMock)}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                      >
                        Take Action Now <ArrowUpRight className="size-4" />
                      </Link>
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
