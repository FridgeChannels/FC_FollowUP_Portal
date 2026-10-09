"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  Clock3,
  createLucideIcon,
  Mail,
  MailOpen,
  Radio,
  RefreshCw,
  SmartphoneNfc,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  effectiveFollowup,
  filterQueue,
  summarize,
  safeSourceUrl,
  type SignalBrand,
  type SignalType,
} from "@/lib/signals/model";
import type { BrandActivity, BrandDetail as BrandData } from "@/lib/brand-list";
import { channelReachable } from "@/lib/channel-availability";
import type { MediaAttachment } from "@/lib/media-attachments";
import type { DeliveryMode } from "./send-timing-toggle";
import type { Channel } from "@/lib/outreach-domain";
import { formatScheduledDateTime } from "@/lib/display-time";
import { dialPhoneOptions } from "@/lib/dial-phones";
import {
  ReplyDialog,
  toCustomerContacts,
  toInteractions,
} from "./workspace-customer";
import { ActivityTimeline, InteractionFeed } from "./interaction-feed";
import { CallWithQuoButton } from "./phone-task-board";
import { usePageMetadata } from "./use-page-metadata";
import { useSignals } from "./signals-store";
const Linkedin = createLucideIcon("Linkedin", [
  [
    "path",
    {
      d: "M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z",
      key: "a",
    },
  ],
  ["rect", { x: "2", y: "9", width: "4", height: "12", key: "b" }],
  ["circle", { cx: "4", cy: "4", r: "2", key: "c" }],
]);
const types = {
  sample: {
    label: "Sample Tap",
    icon: SmartphoneNfc,
    style:
      "text-[#7C3AED] bg-violet-50 dark:bg-violet-950 dark:text-violet-300",
  },
  email: {
    label: "Email Open",
    icon: MailOpen,
    style: "text-[#B45309] bg-amber-50 dark:bg-amber-950 dark:text-amber-300",
  },
  linkedin: {
    label: "LinkedIn",
    icon: Linkedin,
    style: "text-[#0A66C2] bg-blue-50 dark:bg-blue-950 dark:text-blue-300",
  },
};
function SignalLabel({ type }: { type: SignalType }) {
  const { label, icon: Icon, style } = types[type];
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium ${style}`}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}
function date(value?: string) {
  return value
    ? formatScheduledDateTime(
        value,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ) || value
    : "—";
}
const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function SignalsPage() {
  usePageMetadata({
    title: "Signals",
    description: "Review customer signals and follow up in one workspace.",
  });
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const { data, error, refresh } = useSignals();
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("brand");
  const [status, setStatus] = useState<"review" | "all">("review");
  const [time, setTime] = useState<"today" | "week">("week");
  const [type, setType] = useState<SignalType | "all">("all");
  const [selected, setSelected] = useState<string | null>(requested);
  const [mobileDetail, setMobileDetail] = useState(Boolean(requested));
  const queue = useMemo(
    () => filterQueue(data?.brands || [], { status, time, type }),
    [data, status, time, type],
  );
  const summary = summarize(data?.brands || []);
  const [lastRequested, setLastRequested] = useState(requested);
  if (lastRequested !== requested) {
    setLastRequested(requested);
    if (requested) {
      setSelected(requested);
      setMobileDetail(true);
    }
  }
  const selectedBrand = data?.brands.find((b) => b.id === selected);
  // A notification deep link can open a brand outside the current filters.
  const current =
    selectedBrand &&
    (requested === selected || queue.some((b) => b.id === selected))
      ? selectedBrand
      : queue[0];
  const onComplete = () => {
    const index = queue.findIndex((b) => b.id === current?.id);
    const next = queue[index + 1] || queue.find((b) => b.id !== current?.id);
    setSelected(next?.id || null);
    setMobileDetail(Boolean(next));
    if (requested) router.replace("/signals", { scroll: false });
    void refresh();
  };
  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 text-foreground sm:px-8">
      <header>
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Today: {summary.today} brands updated{" "}
          <span className="px-1.5">·</span> This week: {summary.week}{" "}
          <span className="px-1.5">·</span> Needs review: {summary.needsReview}
        </p>
      </header>
      <div className="my-7 flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as typeof status)}
        >
          <SelectTrigger aria-label="Signal status" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="review">Needs Review</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={time} onValueChange={(v) => setTime(v as typeof time)}>
          <SelectTrigger aria-label="Signal time" className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger aria-label="Signal type" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Signals</SelectItem>
            {Object.entries(types).map(([key, t]) => (
              <SelectItem key={key} value={key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh signals"
          onClick={() => void refresh()}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {error ? (
        <div role="alert" className="mb-6 text-sm text-muted-foreground">
          Signals could not be refreshed. {error}{" "}
          <Button variant="link" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!data && !error ? (
        <div className="space-y-3" aria-label="Loading signals">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,35fr)_minmax(0,65fr)]">
          <section
            aria-label="Brand queue"
            className={mobileDetail && current ? "hidden lg:block" : ""}
          >
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {queue.length} {queue.length === 1 ? "brand" : "brands"}
              </span>
              <span>Priority, then latest</span>
            </div>
            {queue.length ? (
              <div className="space-y-1">
                {queue.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => {
                      setSelected(brand.id);
                      setMobileDetail(true);
                    }}
                    aria-current={current?.id === brand.id ? "true" : undefined}
                    className={`w-full rounded-lg px-3 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${current?.id === brand.id ? "bg-muted" : "hover:bg-muted/60"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-semibold">
                        {brand.name}
                      </span>
                      {brand.unread ? (
                        <span
                          className="size-2 shrink-0 rounded-full bg-foreground"
                          aria-label="Unread"
                        />
                      ) : null}
                    </div>
                    <div className="my-2 flex flex-wrap gap-1.5">
                      {[...new Set(brand.events.map((e) => e.type))].map(
                        (type) => (
                          <SignalLabel key={type} type={type} />
                        ),
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {brand.events[0].summary}
                    </p>
                    <div className="mt-2 flex justify-between gap-2 text-[11px] text-muted-foreground">
                      <time dateTime={brand.events[0].occurredAt}>
                        {date(brand.events[0].occurredAt)}
                      </time>
                      <span>{brand.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-14 text-center">
                <Radio className="mx-auto mb-4 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {data?.brands.length
                    ? "No brands match these filters"
                    : "No signals yet"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data?.brands.length
                    ? "Change the status, time or signal type."
                    : "Customer updates will appear here when received."}
                </p>
              </div>
            )}
            {data ? (
              <div className="mt-8 space-y-2 text-xs text-muted-foreground">
                {Object.entries(types).map(([key, t]) => (
                  <div
                    className="flex items-center justify-between gap-3"
                    key={key}
                  >
                    <span>{t.label}</span>
                    <span>{data.sources[key as SignalType]}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section
            aria-label="Brand review"
            className={!mobileDetail ? "hidden min-w-0 lg:block" : "min-w-0"}
          >
            {current ? (
              <>
                <Button
                  variant="ghost"
                  className="mb-3 lg:hidden"
                  onClick={() => setMobileDetail(false)}
                >
                  <ArrowLeft className="mr-2 size-4" />
                  Back to brands
                </Button>
                {desktop || mobileDetail ? (
                  <BrandReview
                    key={current.id}
                    brand={current}
                    onComplete={onComplete}
                  />
                ) : null}
              </>
            ) : (
              <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
                Select a brand to review its signals.
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
type ActivityPage = {
  activities: BrandActivity[];
  nextCursor?: string | null;
  hasMore?: boolean;
};
async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(payload.error || "Unable to load brand context");
  return payload;
}
async function loadContext(id: string) {
  const [payload, activity] = await Promise.all([
    readJson<{ brand: BrandData }>(`/api/brands/${id}`),
    readJson<ActivityPage>(`/api/brands/${id}/activities?limit=50`),
  ]);
  return {
    brand: { ...payload.brand, activities: activity.activities },
    cursor: activity.hasMore ? activity.nextCursor || null : null,
  };
}
function BrandReview({
  brand,
  onComplete,
}: {
  brand: SignalBrand;
  onComplete: () => void;
}) {
  const { data, refresh, settle } = useSignals();
  const readOnly = data?.readOnly !== false;
  const [detail, setDetail] = useState<BrandData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<Channel | null>(null);
  const [later, setLater] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [history, setHistory] = useState(false);
  const [tapHistory, setTapHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [now] = useState(() => Date.now());
  const [readError, setReadError] = useState<string | null>(null);
  const readSnapshot = useRef("");
  const watchedMessage = useRef<string | null>(null);
  const callStarted = useRef<number | null>(null);
  const completing = useRef(false);
  const snapshot = brand.events
    .map((e) => e.id)
    .sort()
    .join("|");
  useEffect(() => {
    let cancelled = false;
    loadContext(brand.id)
      .then((context) => {
        if (!cancelled) {
          setDetail(context.brand);
          setCursor(context.cursor);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [brand.id]);
  useEffect(() => {
    if (readOnly || !brand.unread || readSnapshot.current === snapshot) return;
    readSnapshot.current = snapshot;
    let cancelled = false;
    fetch(`/api/signals/${brand.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "read",
        eventIds: brand.events.map((e) => e.id),
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const p = (await r.json()) as { brand: BrandData; error?: string };
          throw new Error(p.error || "Unable to mark signals read");
        }
        if (!cancelled) {
          setReadError(null);
          settle(
            brand.id,
            brand.events.map((e) => e.id),
          );
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setReadError(e.message);
          readSnapshot.current = "";
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    brand.id,
    brand.unread,
    brand.events,
    snapshot,
    refresh,
    settle,
    readOnly,
  ]);
  async function complete(
    action: "review" | "later" | "handled",
    linkedTask?: string,
    activityId?: string,
  ) {
    if (readOnly) return false;
    setSaving(true);
    try {
      const response = await fetch(`/api/signals/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventIds: brand.events.map((e) => e.id),
          taskId: linkedTask,
          activityId,
        }),
      });
      const p = (await response.json()) as {
        error?: string;
        taskId?: string;
        conversationId?: string;
      };
      if (!response.ok) throw new Error(p.error || "Unable to save review");
      settle(
        brand.id,
        brand.events.map((e) => e.id),
        action === "later"
          ? "Later"
          : action === "handled"
            ? "Handled"
            : "Reviewed",
        linkedTask,
      );
      toast.success(
        action === "later"
          ? "Follow-up task linked"
          : action === "handled"
            ? "Follow-up completed"
            : "Marked reviewed",
      );
      onComplete();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save review");
      return false;
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (
        document.visibilityState !== "visible" ||
        (!watchedMessage.current && callStarted.current === null) ||
        completing.current
      )
        return;
      try {
        const context = await loadContext(brand.id);
        const fresh = context.brand;
        if (cancelled) return;
        setDetail(fresh);
        const after = Math.max(
          ...brand.events.map((e) => Date.parse(e.detectedAt)),
        );
        const candidate = fresh.activities.find(
          (a) =>
            (a.id === watchedMessage.current ||
              (callStarted.current !== null &&
                a.channel === "Phone" &&
                Date.parse(a.quo?.call?.completedAt || "") >=
                  callStarted.current)) &&
            effectiveFollowup(a, after),
        );
        if (!candidate || !brand.needsReview) return;
        completing.current = true;
        if (await complete("handled", undefined, candidate.id)) {
          watchedMessage.current = null;
          callStarted.current = null;
        }
      } catch {
        /* Refresh failures retain the pending item for a later check. */
      } finally {
        completing.current = false;
      }
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  });
  async function sendMessage(
    contactId: string,
    channel: Channel,
    content: string,
    object?: string,
    deliveryMode?: DeliveryMode,
    scheduledAt?: string,
    attachments?: MediaAttachment[],
    cc?: string,
    taskId?: string,
    threadId?: string,
  ) {
    if (readOnly)
      throw new Error("Signals is in read-only preview. Sending is disabled.");
    const response = await fetch(`/api/brands/${brand.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        channel,
        content,
        object,
        deliveryMode,
        scheduledAt,
        attachments,
        cc,
        taskId,
        threadId,
      }),
    });
    const p = (await response.json()) as {
      error?: string;
      taskId?: string;
      conversationId?: string;
    };
    if (!response.ok) throw new Error(p.error || "Unable to send");
    try {
      const context = await loadContext(brand.id);
      setDetail(context.brand);
      setCursor(context.cursor);
    } catch {
      setError("Message saved; communication history could not be refreshed.");
    }
    if (later && p.taskId) await complete("later", p.taskId);
    else {
      watchedMessage.current = p.conversationId || null;
      toast.success("Message saved to the sending workflow");
    }
  }
  const contacts = detail ? toCustomerContacts(detail.contacts) : [];
  const email = detail?.ownerId
    ? contacts.find((c) => c.email && c.emailValid)
    : undefined;
  const phone = contacts.find((c) => dialPhoneOptions(c).length);
  const linkedin = contacts.find((c) => c.linkedin);
  const taps = brand.events.filter((e) => e.type === "sample");
  const interactions = detail
    ? toInteractions(brand.id, detail.activities, {}, detail.tasks).sort(
        (a, b) =>
          Date.parse(b.recordedAt || b.createdAt) -
          Date.parse(a.recordedAt || a.createdAt),
      )
    : [];
  const scheduledTasks =
    detail?.tasks.filter(
      (t) =>
        t.scheduledAt &&
        Date.parse(t.scheduledAt) > now &&
        !["Completed", "Cancelled", "Failed"].includes(t.status || ""),
    ) || [];
  const composeContacts = composer
    ? contacts
        .filter((c) => channelReachable(c, composer))
        .map((c) => ({ ...c, preferredChannel: composer }))
    : contacts;
  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {brand.name}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {brand.ownerName || "Unassigned"}{" "}
              {detail?.contacts[0] ? `· ${detail.contacts[0].name}` : ""} ·{" "}
              {detail?.currentCp || brand.currentCp}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || saving || !brand.needsReview}
            onClick={() => void complete("review")}
          >
            <CheckCheck className="mr-1.5 size-4" />
            Mark Reviewed
          </Button>
        </div>
        <a
          href={`/customers/${encodeURIComponent(brand.id)}`}
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Open Full Brand Detail
          <ArrowUpRight className="size-3.5" />
        </a>
        {readOnly ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Read-only preview · review updates and sending are disabled.
          </p>
        ) : null}
        {readError ? (
          <p role="alert" className="mt-2 text-xs text-muted-foreground">
            {readError}
          </p>
        ) : null}
      </header>
      <section>
        <h3 className="mb-4 text-sm font-semibold">Quick Actions</h3>
        {!detail ? (
          <p className="text-xs text-muted-foreground">
            {error || "Loading available channels…"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {email ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setComposer("Email")}
              >
                <Mail className="mr-1.5 size-4" />
                Email
              </Button>
            ) : null}
            {phone && !readOnly ? (
              <CallWithQuoButton
                options={dialPhoneOptions(phone)}
                state="open"
                onCallOpening={() => {
                  callStarted.current = Date.now();
                }}
              />
            ) : null}
            {linkedin ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={safeSourceUrl(
                    linkedin.linkedin?.startsWith("http")
                      ? linkedin.linkedin
                      : `https://www.linkedin.com/in/${encodeURIComponent(linkedin.linkedin || "")}`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Linkedin className="mr-1.5 size-4" />
                  LinkedIn
                </a>
              </Button>
            ) : null}
            <Button
              disabled={readOnly}
              variant="outline"
              size="sm"
              onClick={() => setLater(true)}
            >
              <Clock3 className="mr-1.5 size-4" />
              Follow up later
            </Button>
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-4 text-sm font-semibold">Recent Signals</h3>
        {taps.length ? (
          <div className="mb-5 text-xs text-muted-foreground">
            Latest tap: {date(taps[0].occurredAt)} · {taps.length} total taps{" "}
            <button
              className="ml-2 font-medium text-foreground hover:underline"
              onClick={() => setTapHistory((v) => !v)}
              aria-expanded={tapHistory}
            >
              {tapHistory ? "Hide" : "Tap History"}
            </button>
            {tapHistory ? (
              <ul className="mt-3 space-y-2">
                {taps.map((e) => (
                  <li key={e.id}>
                    {date(e.occurredAt)} · {e.sampleId} · {e.evidence}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-5">
          {brand.events.map((event) => (
            <article key={event.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SignalLabel type={event.type} />
                  {event.highPriority ? (
                    <span className="text-xs text-red-700 dark:text-red-300">
                      High Priority
                    </span>
                  ) : null}
                </div>
                <time
                  className="text-[11px] text-muted-foreground"
                  dateTime={event.occurredAt}
                >
                  {date(event.occurredAt)}
                </time>
              </div>
              <p className="mt-2 text-sm">{event.summary}</p>
              {event.subject ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Subject: {event.subject}
                </p>
              ) : null}
              {event.type === "email" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Open detected {date(event.detectedAt)}. Tracking pixels can be
                  triggered by privacy tools or automated scans; this does not
                  confirm reading.
                </p>
              ) : null}
              {event.type === "linkedin" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Published {date(event.publishedAt)} · Monitored{" "}
                  {date(event.detectedAt)}
                </p>
              ) : null}
              {event.evidence ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.evidence}
                </p>
              ) : null}
              {event.sourceUrl ? (
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Source evidence
                  <ArrowUpRight className="size-3" />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Communication History</h3>
          {interactions.length ? (
            <Button variant="ghost" size="sm" onClick={() => setHistory(true)}>
              View all
            </Button>
          ) : null}
        </div>
        {detail ? (
          interactions.length ? (
            <ActivityTimeline
              items={interactions.slice(0, 5)}
              formatTime={date}
              onOpen={() => setHistory(true)}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              No communication recorded.
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            {error || "Loading communication history…"}
          </p>
        )}
      </section>
      {detail && composer ? (
        <ReplyDialog
          customerId={brand.id}
          open
          onOpenChange={(open) => {
            if (!open) setComposer(null);
          }}
          contacts={composeContacts}
          initialChannel={composer}
          contentClassName="signals-overlay"
          readOnly={readOnly}
          onSend={sendMessage}
        />
      ) : null}
      <Dialog open={later && !composer} onOpenChange={setLater}>
        <DialogContent className="signals-overlay">
          <DialogHeader>
            <DialogTitle>Follow up later</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Link a scheduled task, or schedule a message using the existing
            sending workflow.
          </p>
          {scheduledTasks.length ? (
            <>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a scheduled task" />
                </SelectTrigger>
                <SelectContent>
                  {scheduledTasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.channel} · {date(t.scheduledAt || undefined)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!taskId || saving}
                onClick={() => void complete("later", taskId)}
              >
                Link task
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No scheduled follow-up tasks for this brand.
            </p>
          )}
          {email ? (
            <Button variant="outline" onClick={() => setComposer("Email")}>
              Schedule email
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent className="signals-overlay max-h-[85vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Communication History · {brand.name}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <InteractionFeed
              customerId={brand.id}
              interactions={interactions}
              contacts={contacts}
              tasks={detail.tasks}
              showAllChannels
              onSend={(
                contactId,
                channel,
                content,
                taskId,
                threadId,
                subject,
                deliveryMode,
                scheduledAt,
                attachments,
                cc,
              ) =>
                sendMessage(
                  contactId,
                  channel,
                  content,
                  subject,
                  deliveryMode,
                  scheduledAt,
                  attachments,
                  cc,
                  taskId,
                  threadId,
                )
              }
            />
          ) : null}
          {cursor ? (
            <Button
              variant="ghost"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void readJson<ActivityPage>(
                  `/api/brands/${brand.id}/activities?limit=50&cursor=${encodeURIComponent(cursor)}`,
                )
                  .then((page) => {
                    setDetail((current) =>
                      current
                        ? {
                            ...current,
                            activities: [
                              ...new Map(
                                [...current.activities, ...page.activities].map(
                                  (a) => [a.id, a],
                                ),
                              ).values(),
                            ],
                          }
                        : current,
                    );
                    setCursor(page.hasMore ? page.nextCursor || null : null);
                  })
                  .catch((e) => toast.error(e.message))
                  .finally(() => setLoadingMore(false));
              }}
            >
              Load more history
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
