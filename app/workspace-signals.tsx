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
  filterWorkspaceQueue,
  summarize,
  safeSourceUrl,
  type SignalBrand,
  type SignalEvent,
  type SignalQueueView,
  type SignalType,
} from "@/lib/signals/model";
import type { BrandActivity, BrandDetail as BrandData } from "@/lib/brand-list";
import { channelReachable } from "@/lib/channel-availability";
import type { MediaAttachment } from "@/lib/media-attachments";
import type { DeliveryMode } from "./send-timing-toggle";
import type { Channel, Contact } from "@/lib/outreach-domain";
import { formatScheduledDateTime } from "@/lib/display-time";
import { dialPhoneOptions } from "@/lib/dial-phones";
import {
  ReplyDialog,
  toCustomerContacts,
  toInteractions,
} from "./workspace-customer";
import { usePageMetadata } from "./use-page-metadata";
import { useSignals } from "./signals-store";
import { ChannelIcon } from "./channel-icon";
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
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${style}`}
    >
      {icon}
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
function groupedSignals(events: SignalEvent[]) {
  const groups = new Map<string, SignalEvent[]>();
  for (const event of [...new Map(events.map((item) => [item.id, item])).values()]) {
    const key = event.type === "sample" ? `sample:${event.sampleId || event.id}`
      : event.type === "email" ? `email:${event.conversationId || event.messageId || event.id}`
      : `linkedin:${event.id}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups].map(([key, items]) => ({ key, events: items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)) }))
    .sort((a, b) => Date.parse(b.events[0].occurredAt) - Date.parse(a.events[0].occurredAt));
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
  const showingMock =
    process.env.NODE_ENV !== "production" && params.get("mock") === "1";
  const [view, setView] = useState<SignalQueueView>("review");
  const [type, setType] = useState<SignalType | "all">("all");
  const [selected, setSelected] = useState<string | null>(requested);
  const [deepLinkActive, setDeepLinkActive] = useState(Boolean(requested));
  const [mobileDetail, setMobileDetail] = useState(Boolean(requested));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const queue = useMemo(
    () => filterWorkspaceQueue(data?.brands || [], view, type, now),
    [data, view, type, now],
  );
  const summary = summarize(data?.brands || [], now);
  const [lastRequested, setLastRequested] = useState(requested);
  if (lastRequested !== requested) {
    setLastRequested(requested);
    if (requested) {
      setSelected(requested);
      setMobileDetail(true);
      setDeepLinkActive(true);
    }
  }
  const selectedBrand = data?.brands.find((b) => b.id === selected);
  // A notification deep link can open a brand outside the current filters.
  const current =
    selectedBrand &&
    ((deepLinkActive && requested === selected) || queue.some((b) => b.id === selected))
      ? selectedBrand
      : queue[0];
  const onComplete = () => {
    const next = filterWorkspaceQueue(data?.brands || [], "review", "all", now)
      .find((b) => b.id !== current?.id);
    setView("review");
    setType("all");
    setDeepLinkActive(false);
    setSelected(next?.id || null);
    setMobileDetail(Boolean(next));
    if (requested) router.replace("/signals", { scroll: false });
    if (!showingMock) void refresh();
  };
  return (
    <div className="mx-auto max-w-[1480px] text-foreground">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-2xl font-bold tracking-[-.035em] text-slate-950 sm:text-[28px]">Signals</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{summary.needsReview} brands need review</p>
      </header>
      <div className="my-5 flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={(v) => { setType(v as typeof type); setDeepLinkActive(false); }}>
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
        <Button variant="ghost" size="sm" aria-pressed={view === "history"} className={view === "history" ? "font-semibold text-foreground" : "text-muted-foreground"} onClick={() => { setView(view === "history" ? "review" : "history"); setMobileDetail(false); setDeepLinkActive(false); }}>History</Button>
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
      {showingMock ? (
        <p className="-mt-3 mb-6 text-xs text-muted-foreground">
          Mock preview · local actions only
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mb-6 text-sm text-muted-foreground">
          Unable to refresh signals.{" "}
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
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Brand Queue</h2>
            </div>
            {queue.length ? (
              <div className="space-y-1">
                {queue.map((brand) => {
                  const visibleEvents = type === "all" ? brand.events : brand.events.filter((event) => event.type === type);
                  const latest = (view === "review"
                    ? visibleEvents.find((event) => !brand.reviewedEventIds?.includes(event.id))
                    : undefined) || visibleEvents[0];
                  const isSelected = current?.id === brand.id;
                  const isUnread = brand.unread;
                  return (
                    <button
                      key={brand.id}
                      onClick={() => {
                        setSelected(brand.id);
                        setMobileDetail(true);
                        setDeepLinkActive(false);
                      }}
                      aria-current={isSelected ? "true" : undefined}
                      className={`w-full rounded-md px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isSelected ? "bg-slate-200/85 shadow-sm" : isUnread ? "bg-slate-100/90 shadow-sm hover:bg-slate-200/75" : "bg-transparent hover:bg-slate-100/60"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`truncate text-sm ${isUnread || isSelected ? "font-semibold text-foreground" : "font-medium text-slate-500"}`}>{brand.name}</span>
                        {isUnread ? <span className="size-2 shrink-0 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.14)]" aria-label="Unread" /> : null}
                      </div>
                      <div className={`mt-1 flex flex-wrap gap-x-2 gap-y-0.5 ${isUnread || isSelected ? "" : "opacity-60"}`}>
                        {[...new Set(visibleEvents.map((event) => event.type))].map((signalType) => (
                          <SignalLabel key={signalType} type={signalType} />
                        ))}
                      </div>
                      <p className={`mt-1 line-clamp-2 text-xs ${isUnread || isSelected ? "text-slate-600" : "text-slate-400"}`}>{latest.summary}</p>
                      <time dateTime={latest.occurredAt} title={date(latest.occurredAt)} className={`mt-1 block text-[11px] ${isUnread || isSelected ? "text-slate-500" : "text-slate-400"}`}>
                        {relativeTime(latest.occurredAt, now)}
                      </time>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{data?.brands.length ? "No brands match this view" : "No signals yet"}</p>
            )}
          </section>
          <section
            aria-label="Brand review"
            className={!mobileDetail ? "hidden min-w-0 lg:block" : "min-w-0"}
          >
            <h2 className="mb-3 text-sm font-semibold">Brand Review</h2>
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
                    mock={showingMock}
                    now={now}
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
    </div>
  );
}
type ActivityPage = {
  activities: BrandActivity[];
  nextCursor?: string | null;
  hasMore?: boolean;
};
async function readJson<T>(url: string, message: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(message);
  try { return (await response.json()) as T; }
  catch { throw new Error(message); }
}
function loadBrand(id: string) {
  return readJson<{brand: BrandData}>(`/api/brands/${encodeURIComponent(id)}`, "Unable to load brand details");
}
function loadActivities(id: string) {
  return readJson<ActivityPage>(`/api/brands/${encodeURIComponent(id)}/activities?limit=50`, "Unable to load communication history");
}
async function loadContext(id: string) {
  const [payload, activity] = await Promise.all([
    loadBrand(id),
    loadActivities(id),
  ]);
  return {
    brand: { ...payload.brand, activities: activity.activities },
    cursor: activity.hasMore ? activity.nextCursor || null : null,
  };
}
function BrandReview({
  brand,
  onComplete,
  mock,
  now,
}: {
  brand: SignalBrand;
  onComplete: () => void;
  mock: boolean;
  now: Date;
}) {
  const { data, refresh, settle } = useSignals();
  const readOnly = !mock && data?.readOnly !== false;
  const [detail, setDetail] = useState<BrandData | null>(null);
  const [activities, setActivities] = useState<BrandActivity[]>([]);
  const [brandError, setBrandError] = useState(false);
  const [communicationError, setCommunicationError] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [communicationLoading, setCommunicationLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [composer, setComposer] = useState<Channel | null>(null);
  const [later, setLater] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const [expandedSignalKeys, setExpandedSignalKeys] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
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
    const activityRequest = mock ? Promise.resolve<ActivityPage>({ activities: [] }) : loadActivities(brand.id);
    void Promise.allSettled([loadBrand(brand.id), activityRequest]).then(([brandResult, activityResult]) => {
      if (cancelled) return;
      if (brandResult.status === "fulfilled") {
        setDetail(brandResult.value.brand);
        setBrandError(false);
      } else {
        setDetail(null);
        setBrandError(true);
      }
      setContextLoading(false);
      setActivities(activityResult.status === "fulfilled" ? activityResult.value.activities : []);
      setCommunicationError(activityResult.status === "rejected");
      setCommunicationLoading(false);
      setCursor(activityResult.status === "fulfilled" && activityResult.value.hasMore ? activityResult.value.nextCursor || null : null);
    });
    return () => {
      cancelled = true;
    };
  }, [brand.id, reloadVersion]);
  useEffect(() => {
    if (!brand.unread || readSnapshot.current === snapshot) return;
    readSnapshot.current = snapshot;
    if (mock) {
      settle(brand.id, brand.events.map((e) => e.id));
      return;
    }
    if (readOnly) return;
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
        if (!r.ok) throw new Error("Unable to update read status");
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
    mock,
  ]);
  async function complete(
    action: "review" | "later" | "handled",
    linkedTask?: string,
    activityId?: string,
  ) {
    if (mock) {
      settle(
        brand.id,
        brand.events.map((event) => event.id),
        action === "later" ? "Later" : action === "handled" ? "Handled" : "Reviewed",
        linkedTask,
      );
      toast.success(
        action === "later"
          ? "Mock follow-up task linked"
          : action === "handled"
            ? "Mock follow-up completed"
            : "Mock signal marked reviewed",
      );
      onComplete();
      return true;
    }
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
      if (!response.ok) throw new Error("Unable to save review");
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
        mock ||
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
        setActivities(fresh.activities);
        setCommunicationError(false);
        setCursor(context.cursor);
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
    if (mock) {
      const sentAt = new Date().toISOString();
      const mockMessageId = `mock-message-${Date.now()}`;
      setActivities((current) => [{
        id: mockMessageId,
        brandId: brand.id,
        contactId,
        taskId: taskId || null,
        channel,
        direction: "Outbound",
        status: "Sent",
        subject: object || null,
        cc: cc || null,
        content,
        sender: "You",
        notes: null,
        callResult: null,
        sourceUrl: null,
        threadId: threadId || null,
        messageId: mockMessageId,
        cpId: null,
        cpAtInteraction: null,
        createdAt: sentAt,
        recordedAt: sentAt,
      }, ...current]);
      toast.success("Mock message sent");
      if (later) await complete("later", "mock-follow-up-task");
      return;
    }
    if (readOnly) throw new Error("Signals is read-only.");
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
    if (!response.ok) throw new Error("Unable to send message");
    try {
      const context = await loadContext(brand.id);
      setDetail(context.brand);
      setActivities(context.brand.activities);
      setCursor(context.cursor);
      setCommunicationError(false);
    } catch {
      setCommunicationError(true);
    }
    if (later && p.taskId) await complete("later", p.taskId);
    else {
      watchedMessage.current = p.conversationId || null;
      toast.success("Message saved to the sending workflow");
    }
  }
  const contacts = detail ? toCustomerContacts(detail.contacts) : [];
  const previewContact: Contact = {
    id: "mock-test-atlas-contact",
    name: "Test KeyPerson Atlas",
    role: "Owner",
    title: "Owner",
    email: "atlas@example.com",
    phone: "+1 555 010 2026",
    linkedin: "test-fridgechannel-atlas",
    preferredChannel: "Email",
    emailValid: true,
    phoneValid: true,
  };
  const actionContacts = mock && !contacts.some((contact) => contact.email && contact.emailValid)
    ? [...contacts, previewContact]
    : contacts;
  const email = (detail?.ownerId || mock)
    ? actionContacts.find((c) => c.email && c.emailValid)
    : undefined;
  const phone = actionContacts.find((c) => dialPhoneOptions(c).length);
  const linkedin = actionContacts.find((c) => c.linkedin);
  const allSignalGroups = groupedSignals(brand.events);
  const currentSignalGroups = brand.needsReview
    ? groupedSignals(brand.events.filter((event) => !brand.reviewedEventIds?.includes(event.id)))
    : allSignalGroups;
  const visibleSignalGroups = signalsExpanded ? allSignalGroups : currentSignalGroups.slice(0, 3);
  const hasMoreSignals = allSignalGroups.reduce((total, group) => total + group.events.length, 0) >
    currentSignalGroups.slice(0, 3).reduce((total, group) => total + group.events.length, 0);
  const interactions = toInteractions(brand.id, activities, {}, detail?.tasks || []).sort(
        (a, b) =>
          Date.parse(b.recordedAt || b.createdAt) -
          Date.parse(a.recordedAt || a.createdAt),
      );
  const liveScheduledTasks =
    detail?.tasks.filter(
      (t) =>
        t.scheduledAt &&
        Date.parse(t.scheduledAt) > now.getTime() &&
        !["Completed", "Cancelled", "Failed"].includes(t.status || ""),
    ) || [];
  const scheduledTasks = liveScheduledTasks.length || !mock
    ? liveScheduledTasks
    : [{ id: "mock-follow-up-task", channel: "Email", scheduledAt: new Date(now.getTime() + 86_400_000).toISOString(), status: "Scheduled" }];
  const composeContacts = composer
    ? actionContacts
        .filter((c) => channelReachable(c, composer))
        .map((c) => ({ ...c, preferredChannel: composer }))
    : actionContacts;
  const retryContext = () => {
    setContextLoading(true);
    setCommunicationLoading(true);
    setBrandError(false);
    setCommunicationError(false);
    setReloadVersion((value) => value + 1);
  };
  const loadMoreActivities = () => {
    if (!cursor) return;
    setLoadingMore(true);
    void readJson<ActivityPage>(
      `/api/brands/${encodeURIComponent(brand.id)}/activities?limit=50&cursor=${encodeURIComponent(cursor)}`,
      "Unable to load communication history",
    ).then((page) => {
      setActivities((current) => [...new Map([...current, ...page.activities].map((activity) => [activity.id, activity])).values()]);
      setCursor(page.hasMore ? page.nextCursor || null : null);
    }).catch(() => setCommunicationError(true)).finally(() => setLoadingMore(false));
  };
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {brand.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{detail?.contacts[0]?.name ? `${detail.contacts[0].name} · ` : ""}{detail?.currentCp || brand.currentCp}</p>
          </div>
          <a href={`/customers/${encodeURIComponent(brand.id)}?returnTo=${encodeURIComponent(mock ? "/signals?mock=1" : "/signals")}&signal=${encodeURIComponent(brand.events[0]?.id||"")}${mock ? "&mock=1" : ""}`} className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">Take Action Now <ArrowUpRight className="size-4" /></a>
        </div>
        {readError ? <p role="alert" className="mt-2 text-xs text-muted-foreground">Unable to update read status</p> : null}
      </header>
      <section>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">New Signals</h3>{hasMoreSignals ? <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSignalsExpanded(!signalsExpanded)} aria-expanded={signalsExpanded}>{signalsExpanded ? "Show less" : "View all"}</button> : null}</div>
        {visibleSignalGroups.length ? <div className="space-y-3">
          {visibleSignalGroups.map(({key, events}) => {
            const latest = events[0];
            const expanded = expandedSignalKeys.has(key);
            const title = latest.type === "sample" ? `Sample ${latest.sampleId || ""} visited ${events.length} time${events.length === 1 ? "" : "s"}`
              : latest.type === "email" ? `${latest.subject && latest.subject !== "Subject unavailable" ? latest.subject : "Email"} · ${events.length} open${events.length === 1 ? "" : "s"} detected`
              : latest.summary;
            const source = safeSourceUrl(latest.sourceUrl);
            return <article key={key} className="min-w-0 py-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><SignalLabel type={latest.type}/></div>
              <p className={`mt-1 text-sm font-medium ${expanded ? "" : "line-clamp-2"}`} title={title}>{title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span>{latest.type === "sample" ? "Last activity" : latest.type === "email" ? "Last detected" : "Published"} · {relativeTime(latest.type === "email" ? latest.detectedAt : latest.type === "linkedin" ? latest.publishedAt || latest.occurredAt : latest.occurredAt, now)}</span>
                {source ? <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">View source <ArrowUpRight className="size-3"/></a> : !mock && latest.type === "linkedin" ? <span>Source unavailable</span> : null}
                {(events.length > 1 || latest.evidence || latest.type === "linkedin") ? <button type="button" className="hover:text-foreground" onClick={() => setExpandedSignalKeys((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; })} aria-expanded={expanded}>{expanded ? "Hide details" : latest.type === "sample" ? "Visit history" : "Details"}</button> : null}
              </div>
              {expanded ? <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {latest.type === "linkedin" ? <p>Published {date(latest.publishedAt)} · Detected {date(latest.detectedAt)}</p> : null}
                {latest.type === "email" ? <p>Open detection does not confirm the recipient read the email.</p> : null}
                {events.map((event) => <p key={event.id}><time dateTime={event.occurredAt}>{date(event.occurredAt)}</time>{event.evidence ? ` · ${event.evidence}` : ""}</p>)}
              </div> : null}
            </article>;
          })}
        </div> : <p className="text-sm text-muted-foreground">No signals yet</p>}
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
    </div>
  );
}
