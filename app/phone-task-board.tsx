"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Phone, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { callReviewsFromTasks, type CallReviewStatus } from "@/lib/call-review-metadata";
import { dateOnly, isCancelledTaskStatus, isClosedTaskStatus, type Contact, type Interaction } from "@/lib/outreach-domain";
import { devCallPhoneOnClient } from "@/lib/quo/dev-call-phone";
import { formatUtcTime } from "./bomb-plan";
import { ChannelIcon } from "./channel-icon";
import { QuoCallPanel } from "./quo-call-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type PhoneBoardTask = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  contactId?: string | null;
  contactPhone?: string | null;
  templateId?: string | null;
  callReviewStatus?: CallReviewStatus | null;
  remote?: boolean;
};

export type PhoneBoardScript = {
  id: string;
  name: string;
  content: string;
  status: string | null;
};

function isDone(status: string) {
  return isClosedTaskStatus(status);
}

function dialState(status: string, reviewStatus?: CallReviewStatus | null) {
  if (reviewStatus === "Awaiting Review" || reviewStatus === "Qualified") return "completed" as const;
  if (status === "Completed" || status === "Resolved") return "completed" as const;
  if (isCancelledTaskStatus(status)) return "cancelled" as const;
  if (status === "Failed") return "failed" as const;
  return "open" as const;
}

function CallActionButton({ phone, state, onCallOpening }: { phone: string; state: ReturnType<typeof dialState>; onCallOpening: () => void }) {
  const quoDial = phone ? `openphone://dial?number=${encodeURIComponent(phone)}&action=call` : "";
  if (state === "completed") {
    return <Button disabled className="bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="mr-2 size-4"/>Call completed</Button>;
  }
  if (state === "cancelled") {
    return <Button disabled variant="secondary"><Phone className="mr-2 size-4"/>Call cancelled</Button>;
  }
  if (state === "failed") {
    return <Button disabled className="bg-rose-100 text-rose-800 hover:bg-rose-100"><Phone className="mr-2 size-4"/>Call failed</Button>;
  }
  if (phone) {
    return <Button asChild><a href={quoDial} onClick={onCallOpening}><Phone className="mr-2 size-4"/>Call with Quo</a></Button>;
  }
  return <Button disabled><Phone className="mr-2 size-4"/>Call with Quo</Button>;
}

function ReviewBadge({ status }: { status?: CallReviewStatus | null }) {
  if (!status) return null;
  const className =
    status === "Qualified" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : status === "Unqualified" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : "bg-amber-100 text-amber-900 hover:bg-amber-100";
  return <Badge className={className}>{status === "Awaiting Review" ? "awaiting review" : status.toLowerCase()}</Badge>;
}

export function PhoneTaskBoard({
  phoneTasks,
  contacts,
  timeline,
  activeTaskId,
  activeScript = null,
  activeScriptLoading = false,
  headerContactName,
  showChannelTab = true,
  canReviewCalls = false,
  onPersistCallReview,
  onRefreshQuo,
  quoRefreshingCallId,
  onSelectTask,
  showDial = true,
}: {
  phoneTasks: PhoneBoardTask[];
  contacts: Contact[];
  timeline: Interaction[];
  activeTaskId?: string | null;
  activeScript?: PhoneBoardScript | null;
  activeScriptLoading?: boolean;
  headerContactName?: string;
  showChannelTab?: boolean;
  canReviewCalls?: boolean;
  onPersistCallReview?: (taskId: string, status: CallReviewStatus) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  onSelectTask?: (taskId: string) => void;
  showDial?: boolean;
}) {
  const [scriptsByTask, setScriptsByTask] = useState<Record<string, PhoneBoardScript | null>>({});
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const reviews = callReviewsFromTasks(phoneTasks);

  const tasks = useMemo(() => {
    const byId = new Map(phoneTasks.map((item) => [item.id, item]));
    return [...byId.values()].sort((left, right) =>
      (left.dueAt || "").localeCompare(right.dueAt || "") || left.id.localeCompare(right.id),
    );
  }, [phoneTasks]);

  const openPhoneTaskIds = useMemo(
    () => new Set(tasks.filter((item) => !isDone(item.status)).map((item) => item.id)),
    [tasks],
  );

  useEffect(() => {
    const remoteIds = tasks
      .filter((item) => item.remote !== false && item.templateId && item.id !== activeTaskId)
      .map((item) => item.id);
    if (!remoteIds.length) {
      setScriptsByTask({});
      setScriptsLoading(false);
      return;
    }
    let cancelled = false;
    setScriptsLoading(true);
    Promise.all(remoteIds.map(async (taskId) => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/call-script`);
        const payload = await response.json() as { script?: PhoneBoardScript | null };
        return [taskId, response.ok ? (payload.script || null) : null] as const;
      } catch {
        return [taskId, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setScriptsByTask(Object.fromEntries(entries));
    }).finally(() => {
      if (!cancelled) setScriptsLoading(false);
    });
    return () => { cancelled = true; };
  }, [tasks, activeTaskId]);

  const scriptFallback = (taskId: string): PhoneBoardScript | null => {
    const outbound = timeline
      .filter((item) => item.taskId === taskId && item.channel === "Phone" && !item.quo && item.content?.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!outbound?.content) return null;
    return { id: `fallback:${taskId}`, name: "Call script", content: outbound.content, status: outbound.taskStatus || null };
  };

  const handleReview = async (taskId: string, status: CallReviewStatus) => {
    if (!onPersistCallReview) {
      toast.error("Call review requires a Follow-up Task backed by Notion");
      return;
    }
    setReviewingTaskId(taskId);
    try {
      await onPersistCallReview(taskId, status);
      toast.success(status === "Qualified" ? "Call marked as qualified" : "Call marked as unqualified and reopened for Beril");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save call review");
    } finally {
      setReviewingTaskId(null);
    }
  };

  const body = <div className="space-y-4 p-5">
    {tasks.length ? tasks.map((item) => {
      const taskContact = contacts.find((entry) => entry.id === item.contactId) || contacts[0];
      const active = !!activeTaskId && item.id === activeTaskId;
      const script = active ? activeScript : (scriptsByTask[item.id] || scriptFallback(item.id));
      const scriptLoading = active
        ? activeScriptLoading
        : (scriptsLoading && !!item.templateId && !scriptsByTask[item.id] && !scriptFallback(item.id));
      const review = reviews[item.id];
      const quoResults = timeline.filter((entry) => {
        if (!entry.quo) return false;
        if (entry.taskId === item.id) return true;
        return !entry.taskId && openPhoneTaskIds.has(item.id) && openPhoneTaskIds.size === 1;
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return <PhoneTaskBlock
        key={item.id}
        task={item}
        contact={taskContact}
        active={active}
        script={script}
        scriptLoading={!!scriptLoading}
        reviewStatus={review?.status}
        quoResults={quoResults}
        showDial={showDial}
        canReviewCalls={canReviewCalls}
        reviewing={reviewingTaskId === item.id}
        quoRefreshingCallId={quoRefreshingCallId}
        onRefreshQuo={onRefreshQuo}
        onFocusTask={active || !onSelectTask ? undefined : () => onSelectTask(item.id)}
        onReview={(status) => void handleReview(item.id, status)}
        onCallOpening={() => {
          if (item.remote === false) return;
          void fetch(`/api/tasks/${item.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "quo-attempt" }),
            keepalive: true,
          }).catch(() => undefined);
          if (!active && onSelectTask) onSelectTask(item.id);
        }}
      />;
    }) : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No Phone tasks yet.</p>}
  </div>;

  if (!showChannelTab) return body;

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white">
          <ChannelIcon channel="Phone" className="size-4" alt=""/>
          Phone
          <span className="text-white/80">{tasks.length}</span>
        </button>
      </div>
      <div className="text-xs text-slate-500">
        {headerContactName ? `${headerContactName} · ` : ""}
        {tasks.length} call task{tasks.length === 1 ? "" : "s"}
      </div>
    </div>
    {body}
  </div>;
}

function PhoneTaskBlock({
  task,
  contact,
  active,
  script,
  scriptLoading,
  reviewStatus,
  quoResults,
  showDial,
  canReviewCalls,
  reviewing,
  onCallOpening,
  onFocusTask,
  onReview,
  onRefreshQuo,
  quoRefreshingCallId,
}: {
  task: PhoneBoardTask;
  contact?: Contact;
  active: boolean;
  script: PhoneBoardScript | null | undefined;
  scriptLoading: boolean;
  reviewStatus?: CallReviewStatus;
  quoResults: Interaction[];
  showDial: boolean;
  canReviewCalls: boolean;
  reviewing: boolean;
  onCallOpening: () => void;
  onFocusTask?: () => void;
  onReview: (status: CallReviewStatus) => void;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
}) {
  const [scriptOpen, setScriptOpen] = useState(active || !isDone(task.status));
  const phone = (devCallPhoneOnClient() || contact?.phone || task.contactPhone || "").trim();
  const actionState = dialState(task.status, reviewStatus);
  const showReviewActions = canReviewCalls && !!quoResults.length && (!reviewStatus || reviewStatus === "Awaiting Review");

  return <section className={`rounded-2xl border p-5 ${active ? "border-blue-300 bg-blue-50/70 shadow-sm" : "border-slate-200 bg-slate-50/70"}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`text-[11px] font-semibold tracking-[.14em] ${active ? "text-blue-700" : "text-slate-500"}`}>Task Description</div>
          {active ? <Badge className="bg-violet-600 text-[10px] text-white hover:bg-violet-600">Current</Badge> : null}
          <Badge variant="secondary" className="text-[10px]">{task.status}</Badge>
          {task.dueAt ? <span className="text-[11px] text-slate-400">{dateOnly(task.dueAt)}</span> : null}
          <ReviewBadge status={reviewStatus}/>
        </div>
        <h3 className={`mt-1 text-base font-bold ${active ? "text-blue-950" : "text-slate-900"}`}>
          {onFocusTask ? <button type="button" className="text-left hover:underline" onClick={onFocusTask}>{task.title || "Call this Contact"}</button> : (task.title || "Call this Contact")}
        </h3>
        <p className={`mt-1 text-sm ${active ? "text-blue-900" : "text-slate-600"}`}>{contact?.name || "Contact"} · {phone || "No phone number"}</p>
      </div>
      {showDial ? <div className="flex shrink-0"><CallActionButton phone={phone} state={actionState} onCallOpening={onCallOpening}/></div> : null}
    </div>

    <div className={`mt-5 rounded-xl border ${active ? "border-blue-100/80 bg-white/70" : "border-slate-200 bg-white"}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setScriptOpen((open) => !open)}
        aria-expanded={scriptOpen}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`text-xs font-semibold tracking-wide ${active ? "text-blue-700" : "text-slate-500"}`}>Call script</span>
          {script?.name ? <span className="truncate text-sm font-semibold text-slate-900">{script.name}</span> : null}
          {script?.status ? <Badge variant="outline" className="text-[10px]">{script.status}</Badge> : null}
        </div>
        {scriptOpen ? <ChevronDown className="size-4 shrink-0 text-slate-500"/> : <ChevronRight className="size-4 shrink-0 text-slate-500"/>}
      </button>
      {scriptOpen && <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-800">
        {scriptLoading ? <p className="text-slate-500">Loading call script…</p>
          : script ? <p className="whitespace-pre-wrap leading-6 text-slate-700">{script.content || "No content template configured."}</p>
          : <p className="text-slate-500">No Call Script is linked to this task.</p>}
        {reviewStatus === "Unqualified" ? <p className="mt-3 text-xs font-semibold text-rose-700">Recall requested · Reassigned to Beril</p>
          : reviewStatus === "Qualified" ? <p className="mt-3 text-xs font-semibold text-emerald-700">Call review completed · qualified</p>
          : reviewStatus === "Awaiting Review" ? <p className="mt-3 text-xs font-semibold text-amber-800">Connected · awaiting Account Manager review</p>
          : null}
      </div>}
    </div>

    <div className="mt-5 space-y-3">
      <div className={`text-xs font-semibold tracking-wide ${active ? "text-blue-700" : "text-slate-500"}`}>Call results</div>
      {quoResults.length ? quoResults.map((item) => {
        const callId = item.quo?.callId;
        const canRefresh = !!callId && !callId.startsWith("ACsim") && !!onRefreshQuo;
        return <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>
              {item.callResult ? <Badge variant="outline" className="text-[10px]">{item.callResult}</Badge> : null}
            </div>
            <time dateTime={item.createdAt} className="font-mono text-[11px] text-slate-500">{formatUtcTime(item.createdAt)}</time>
          </div>
          <QuoCallPanel
            compact
            data={item.quo || null}
            refreshing={quoRefreshingCallId === callId}
            onRefresh={canRefresh ? () => onRefreshQuo?.(callId!) : undefined}
          />
        </article>;
      }) : <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">No Quo call has been linked to this task yet.</p>}

      {showReviewActions ? <div className="flex flex-wrap gap-2">
        <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={reviewing} onClick={() => onReview("Qualified")}>
          <CheckCircle2 className="mr-1.5 size-3.5"/>{reviewing ? "Saving…" : "Mark as Qualified"}
        </Button>
        <Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" disabled={reviewing} onClick={() => onReview("Unqualified")}>
          <RotateCcw className="mr-1.5 size-3.5"/>{reviewing ? "Saving…" : "Unqualified & Recall"}
        </Button>
      </div> : null}
    </div>
  </section>;
}
