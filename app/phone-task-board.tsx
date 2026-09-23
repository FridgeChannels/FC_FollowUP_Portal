"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Phone, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { callReviewsFromTasks, type CallReviewStatus } from "@/lib/call-review-metadata";
import {
  partitionRoundCalls,
  reviewRoundsForTask,
  type CallReviewRound,
  type ReviewRoundDisplay,
} from "@/lib/call-review-history";
import {
  dialPhoneOptions,
  formatDialPhoneSummary,
  quoDialHref,
  type DialPhoneOption,
} from "@/lib/dial-phones";
import { parsePhoneCallContent } from "@/lib/phone-call-content";
import { isCancelledTaskStatus, isClosedTaskStatus, type Contact, type Interaction } from "@/lib/outreach-domain";
import { devCallPhoneOnClient } from "@/lib/quo/dev-call-phone";
import { formatEasternDateTime } from "./bomb-plan";
import { ChannelIcon } from "./channel-icon";
import { QuoCallPanel } from "./quo-call-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type QuoDialOpening = {
  taskId: string;
  phone: string;
};

export type PhoneBoardTask = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  contactId?: string | null;
  contactPhone?: string | null;
  templateId?: string | null;
  callReviewStatus?: CallReviewStatus | null;
  callReviewHistory?: CallReviewRound[];
  remote?: boolean;
};

export type PhoneBoardScript = {
  id: string;
  name: string;
  content: string;
  context: string;
  script: string;
  status: string | null;
};

/** Call script copy comes from Follow-up ConversationDB Content (not TemplateDB). */
export function callScriptFromConversations(
  timeline: Interaction[],
  taskId: string,
): PhoneBoardScript | null {
  const outbound = timeline
    .filter((item) =>
      item.taskId === taskId
      && item.channel === "Phone"
      && !item.quo
      && item.direction !== "Inbound"
      && !!item.content?.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!outbound?.content) return null;
  const parsed = parsePhoneCallContent(outbound.content);
  return {
    id: outbound.id,
    name: outbound.title || "Call script",
    content: outbound.content,
    context: parsed.context,
    script: parsed.script,
    status: outbound.taskStatus || null,
  };
}

export function PhoneCallCopy({
  script,
  bodyClassName,
  labelClassName,
}: {
  script: Pick<PhoneBoardScript, "context" | "script">;
  bodyClassName: string;
  labelClassName: string;
}) {
  const context = script.context.trim();
  const copy = script.script.trim();
  if (!context && !copy) {
    return <p className={bodyClassName}>No call content yet.</p>;
  }
  if (!context) {
    return <p className={`whitespace-pre-wrap leading-6 ${bodyClassName}`}>{copy}</p>;
  }
  return (
    <div className="space-y-3">
      <div>
        <div className={labelClassName}>Call scenario</div>
        <p className={`whitespace-pre-wrap leading-6 ${bodyClassName}`}>{context}</p>
      </div>
      <div>
        <div className={labelClassName}>Suggested script</div>
        <p className={`whitespace-pre-wrap leading-6 ${bodyClassName}`}>{copy || "No call content yet."}</p>
      </div>
    </div>
  );
}

function sameNotionId(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  if (left === right) return true;
  return left.replace(/-/g, "").toLowerCase() === right.replace(/-/g, "").toLowerCase();
}

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

function DialNumberItem({ option, onCallOpening }: { option: DialPhoneOption; onCallOpening: (phone: string) => void }) {
  return (
    <DropdownMenuItem
      onSelect={() => {
        onCallOpening(option.number);
        window.location.href = quoDialHref(option.number);
      }}
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{option.label}</span>
        <span className="font-mono text-[11px] text-slate-500">{option.number}</span>
      </span>
    </DropdownMenuItem>
  );
}

export function CallWithQuoButton({
  options,
  state,
  onCallOpening,
}: {
  options: DialPhoneOption[];
  state: ReturnType<typeof dialState>;
  onCallOpening: (phone: string) => void;
}) {
  const primary = options[0];
  if (state === "completed") {
    return <Button disabled className="bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="mr-2 size-4"/>Call completed</Button>;
  }
  if (state === "cancelled") {
    return <Button disabled variant="secondary"><Phone className="mr-2 size-4"/>Call cancelled</Button>;
  }
  if (state === "failed") {
    return <Button disabled className="bg-rose-100 text-rose-800 hover:bg-rose-100"><Phone className="mr-2 size-4"/>Call failed</Button>;
  }
  if (!primary) {
    return <Button disabled><Phone className="mr-2 size-4"/>Call with Quo</Button>;
  }
  if (options.length === 1) {
    return <Button asChild><a href={quoDialHref(primary.number)} onClick={() => onCallOpening(primary.number)}><Phone className="mr-2 size-4"/>Call with Quo</a></Button>;
  }
  return (
    <div className="flex">
      <Button asChild className="rounded-r-none">
        <a href={quoDialHref(primary.number)} onClick={() => onCallOpening(primary.number)}>
          <Phone className="mr-2 size-4"/>Call with Quo
        </a>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-l-white/25 px-2" aria-label="Choose phone number">
            <ChevronDown className="size-4"/>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {options.map((option) => (
            <DialNumberItem key={option.key} option={option} onCallOpening={onCallOpening}/>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ReviewBadge({ status }: { status?: CallReviewStatus | null | "In Progress" | "Archived" }) {
  if (!status || status === "In Progress" || status === "Archived") return null;
  const className =
    status === "Qualified" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : status === "Unqualified" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : "bg-amber-100 text-amber-900 hover:bg-amber-100";
  const label = status === "Unqualified"
    ? "Unqualified · Recall needed"
    : status === "Awaiting Review"
      ? "Awaiting review"
      : status;
  return <Badge className={`rounded-full px-2 py-0.5 text-[10px] leading-none ${className}`}>{label}</Badge>;
}

function PhoneTaskStatusBadge({ status }: { status: string }) {
  const normalized = status === "Canceled" ? "Cancelled" : status;
  const className =
    normalized === "Pending" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
    : normalized === "In Progress" ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
    : normalized === "Completed" || normalized === "Resolved" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : normalized === "Cancelled" ? "bg-slate-200 text-slate-700 hover:bg-slate-200"
    : normalized === "Failed" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={`rounded-full px-2 py-0.5 text-[10px] leading-none ${className}`}>{normalized}</Badge>;
}

function phoneTaskPriority(task: PhoneBoardTask) {
  // Cancelled tasks are retained for auditability, but never interrupt the
  // active Phone work queue—even when they have a historical review label.
  if (isCancelledTaskStatus(task.status)) return 5;
  if (task.callReviewStatus === "Unqualified") return 0;
  if (task.status === "Pending") return 1;
  if (task.status === "In Progress") return 2;
  if (task.callReviewStatus === "Awaiting Review") return 3;
  return 4;
}

function formatReviewDay(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function quoCallId(item: Interaction) {
  return item.quo?.callId;
}

export function UnqualifiedRecallForm({
  reason,
  onReason,
  onCancel,
  onConfirm,
  confirming,
}: {
  reason: string;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  return <div className="space-y-3 rounded-xl border border-rose-100 bg-rose-50/70 p-4">
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700">Unqualified reason</label>
      <Textarea
        value={reason}
        onChange={(event) => onReason(event.target.value)}
        className="min-h-20 resize-none bg-white"
        placeholder="Give Caller a clear reason to retry…"
      />
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="ghost" disabled={confirming} onClick={onCancel}>Cancel</Button>
      <Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" disabled={confirming || !reason.trim()} onClick={onConfirm}>
        <RotateCcw className="mr-1.5 size-3.5"/>{confirming ? "Saving…" : "Confirm recall"}
      </Button>
    </div>
  </div>;
}

export function PhoneTaskBoard({
  phoneTasks,
  contacts,
  timeline,
  activeTaskId,
  scriptsLoading = false,
  headerContactName,
  showChannelTab = true,
  canReviewCalls = false,
  onPersistCallReview,
  onRefreshQuo,
  quoRefreshingCallId,
  onSelectTask,
  onCallOpening,
  callerReviewTaskId,
  callerReviewHasConnectedCall = false,
  callerReviewCanSubmit = false,
  onSubmitCallerReview,
  submittingCallerReview = false,
  showDial = true,
}: {
  phoneTasks: PhoneBoardTask[];
  contacts: Contact[];
  timeline: Interaction[];
  activeTaskId?: string | null;
  scriptsLoading?: boolean;
  headerContactName?: string;
  showChannelTab?: boolean;
  canReviewCalls?: boolean;
  onPersistCallReview?: (taskId: string, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onCallOpening?: (info: QuoDialOpening) => void;
  callerReviewTaskId?: string | null;
  callerReviewHasConnectedCall?: boolean;
  callerReviewCanSubmit?: boolean;
  onSubmitCallerReview?: (callId: string, note?: string) => void | Promise<void>;
  submittingCallerReview?: boolean;
  showDial?: boolean;
}) {
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const reviews = callReviewsFromTasks(phoneTasks);

  const tasks = useMemo(() => {
    const byId = new Map(phoneTasks.map((item) => [item.id, item]));
    return [...byId.values()].sort((left, right) =>
      phoneTaskPriority(left) - phoneTaskPriority(right)
      || (left.dueAt || "").localeCompare(right.dueAt || "")
      || left.id.localeCompare(right.id),
    );
  }, [phoneTasks]);

  const openPhoneTaskIds = useMemo(
    () => new Set(tasks.filter((item) => !isDone(item.status)).map((item) => item.id)),
    [tasks],
  );

  const handleReview = async (taskId: string, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => {
    if (!onPersistCallReview) {
      toast.error("Call review requires a Follow-up Task backed by Notion");
      return;
    }
    setReviewingTaskId(taskId);
    try {
      await onPersistCallReview(taskId, status, reviewReason, reviewNote);
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
      const script = callScriptFromConversations(timeline, item.id);
      const scriptLoading = scriptsLoading && !script;
      const review = reviews[item.id];
      const quoResults = timeline.filter((entry) => {
        if (!entry.quo) return false;
        if (sameNotionId(entry.taskId, item.id)) return true;
        if (entry.taskId) return false;
        // Unlinked Quo rows: attach to the sole Phone task on this board (even if Completed).
        if (tasks.length === 1 && tasks[0].id === item.id) return true;
        return openPhoneTaskIds.has(item.id) && openPhoneTaskIds.size === 1;
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
        callerReviewTaskId={callerReviewTaskId}
        callerReviewHasConnectedCall={callerReviewHasConnectedCall}
        callerReviewCanSubmit={callerReviewCanSubmit}
        onSubmitCallerReview={onSubmitCallerReview}
        submittingCallerReview={submittingCallerReview}
        onFocusTask={active || !onSelectTask ? undefined : () => onSelectTask(item.id)}
        onReview={(status, reviewReason, reviewNote) => void handleReview(item.id, status, reviewReason, reviewNote)}
        onCallOpening={(phone) => {
          if (item.remote === false) return;
          if (onCallOpening) {
            onCallOpening({ taskId: item.id, phone });
          } else {
            void fetch(`/api/tasks/${item.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "quo-attempt", phone }),
              keepalive: true,
            }).catch(() => undefined);
          }
          if (!active && onSelectTask) onSelectTask(item.id);
        }}
      />;
    }) : <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No Phone tasks for this CP.</p>}
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

function CallResultList({
  items,
  emptyLabel,
  onRefreshQuo,
  quoRefreshingCallId,
  selectable = false,
  selectedCallId,
  onSelectCall,
}: {
  items: Interaction[];
  emptyLabel: string;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  selectable?: boolean;
  selectedCallId?: string;
  onSelectCall?: (callId: string) => void;
}) {
  if (!items.length) {
    return <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">{emptyLabel}</p>;
  }
  const cards = items.map((item) => {
    const callId = item.quo?.callId;
    const selected = selectable && !!callId && selectedCallId === callId;
    const card = <article className={`rounded-xl border bg-white p-4 ${selectable && selected ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"} ${selectable && callId ? "cursor-pointer" : ""}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {selectable ? <RadioGroupItem value={callId || item.id} disabled={!callId} /> : null}
          <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>
          {item.callResult ? <Badge variant="outline" className="text-[10px]">{item.callResult}</Badge> : null}
        </div>
        <time dateTime={item.createdAt} className="font-mono text-[11px] text-slate-500">{formatEasternDateTime(item.createdAt)}</time>
      </div>
      <QuoCallPanel
        compact
        data={item.quo || null}
        refreshing={quoRefreshingCallId === callId}
        onRefresh={canRefreshQuo(callId, onRefreshQuo) ? () => onRefreshQuo?.(callId!) : undefined}
      />
    </article>;
    return selectable ? <label key={item.id} className="block">{card}</label> : <div key={item.id}>{card}</div>;
  });
  if (!selectable) return <div className="space-y-3">{cards}</div>;
  return <RadioGroup className="gap-3" value={selectedCallId || ""} onValueChange={(value) => onSelectCall?.(value)}>
    {cards}
  </RadioGroup>;
}

function canRefreshQuo(callId: string | undefined, onRefreshQuo?: (callId: string) => void) {
  return !!callId && !callId.startsWith("ACsim") && !!onRefreshQuo;
}

function ReviewDecision({ round }: { round: ReviewRoundDisplay }) {
  if (round.status !== "Unqualified" && !round.recalled && round.status !== "Qualified") {
    if (!round.callerNote) return null;
  }
  const reviewedBy = [round.reviewerName ? `Reviewed by ${round.reviewerName}` : null, formatReviewDay(round.reviewedAt)]
    .filter(Boolean)
    .join(" · ");
  return <div className="space-y-3">
    {round.recalled || round.status === "Unqualified" ? (
      <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3">
        <p className="text-xs font-semibold text-rose-800">AccountManager marked this task Unqualified</p>
        {round.reason ? <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Reason</div>
          <p className="mt-1 text-sm leading-6 text-rose-950">{round.reason}</p>
        </div> : null}
        {reviewedBy ? <p className="mt-3 text-[11px] text-rose-700">{reviewedBy}</p> : null}
      </div>
    ) : null}
    {round.status === "Qualified" ? (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-800">AccountManager marked this task Qualified</p>
        {reviewedBy ? <p className="mt-2 text-[11px] text-emerald-700">{reviewedBy}</p> : null}
      </div>
    ) : null}
    {round.callerNote ? (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Caller note</div>
        <p className="mt-1 text-sm leading-6 text-slate-800">{round.callerNote}</p>
      </div>
    ) : null}
  </div>;
}

function ReviewRoundCard({
  round,
  calls,
  current = false,
  emptyLabel,
  hint,
  onRefreshQuo,
  quoRefreshingCallId,
  selectableCalls = false,
  selectedCallId,
  onSelectCall,
  children,
}: {
  round: ReviewRoundDisplay;
  calls: Interaction[];
  current?: boolean;
  emptyLabel: string;
  hint?: ReactNode;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  selectableCalls?: boolean;
  selectedCallId?: string;
  onSelectCall?: (callId: string) => void;
  children?: ReactNode;
}) {
  const inProgress = round.status === "In Progress";
  if (current && !calls.length && !hint && !children) return null;
  const showCalls = !inProgress || calls.length > 0;
  return <article className={`rounded-xl border bg-white ${current ? "border-blue-200" : "border-slate-200"}`}>
    {current ? null : (
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-slate-700">
            {round.status === "Archived" ? "Earlier calls" : `Round ${round.round}`}
          </span>
          <ReviewBadge status={round.status}/>
          {round.reviewedAt ? <span className="text-[11px] text-slate-400">{formatReviewDay(round.reviewedAt)}</span> : null}
        </div>
      </div>
    )}
    <div className={`space-y-4 px-4 py-4 ${current ? "" : "border-t border-slate-100"}`}>
      {hint}
      {showCalls ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className={`text-xs font-semibold tracking-wide ${current ? "text-blue-700" : "text-slate-500"}`}>
              {inProgress ? "Call details" : "Call results"}
            </div>
            <span className="text-[11px] text-slate-400">{calls.length} call{calls.length === 1 ? "" : "s"}</span>
          </div>
          <CallResultList
            items={calls}
            emptyLabel={emptyLabel}
            onRefreshQuo={onRefreshQuo}
            quoRefreshingCallId={quoRefreshingCallId}
            selectable={selectableCalls}
            selectedCallId={selectedCallId}
            onSelectCall={onSelectCall}
          />
        </div>
      ) : null}
      {!inProgress && round.status !== "Archived" ? <ReviewDecision round={round}/> : null}
      {children}
    </div>
  </article>;
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
  callerReviewTaskId,
  callerReviewHasConnectedCall,
  callerReviewCanSubmit,
  onSubmitCallerReview,
  submittingCallerReview = false,
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
  onCallOpening: (phone: string) => void;
  onFocusTask?: () => void;
  onReview: (status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => void;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  callerReviewTaskId?: string | null;
  callerReviewHasConnectedCall: boolean;
  callerReviewCanSubmit: boolean;
  onSubmitCallerReview?: (callId: string, note?: string) => void | Promise<void>;
  submittingCallerReview?: boolean;
}) {
  const [scriptOpen, setScriptOpen] = useState(active || !isDone(task.status));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [recallReason, setRecallReason] = useState("");
  const [selectingCall, setSelectingCall] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [callerNote, setCallerNote] = useState("");
  const dialOptions = dialPhoneOptions(
    contact || {},
    task.contactPhone,
    devCallPhoneOnClient(),
  );
  const phoneSummary = formatDialPhoneSummary(dialOptions);
  const actionState = dialState(task.status, reviewStatus);
  const rounds = reviewRoundsForTask(task.callReviewHistory || []);
  const partitioned = partitionRoundCalls(quoResults, rounds, quoCallId, (item) => item.createdAt);
  const historyCalls = partitioned.history;
  const currentCalls = partitioned.current;
  const currentRound = rounds.current;
  const showReviewActions = canReviewCalls && reviewStatus === "Awaiting Review";
  const showCallerReview = callerReviewTaskId === task.id;
  const currentHasConnectedCall = currentCalls.some((item) => item.callResult === "Connected") || (
    !task.callReviewHistory?.length && callerReviewHasConnectedCall && currentRound.round === 1 && !currentRound.recalled
  );
  const canSubmitThisRound = showCallerReview && callerReviewCanSubmit && currentHasConnectedCall && currentRound.status === "In Progress";
  const pickingCall = selectingCall && canSubmitThisRound;
  const selectedCall = currentCalls.find((item) => item.quo?.callId === selectedCallId);
  const canConfirmSelection = selectedCall?.callResult === "Connected";
  const callerHint = pickingCall
    ? "Select one connected call to send to AccountManager."
    : currentRound.status === "Awaiting Review"
    ? "AccountManager will decide whether this task is Qualified."
    : currentRound.recalled && !currentCalls.length
      ? "Call again for this round, then submit it for review."
      : currentHasConnectedCall
        ? "You can keep calling for this task until it is complete, or submit this task for review now."
        : "Complete a connected call for this task before submitting it for review.";

  return <section className={`rounded-2xl border p-5 ${active ? "border-blue-300 bg-blue-50/70 shadow-sm" : "border-slate-200 bg-slate-50/70"}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`text-[11px] font-semibold tracking-[.14em] ${active ? "text-blue-700" : "text-slate-500"}`}>Task Description</div>
          {active ? <Badge className="bg-violet-600 text-[10px] text-white hover:bg-violet-600">Current</Badge> : null}
          <PhoneTaskStatusBadge status={task.status}/>
          {task.dueAt ? <span className="text-[11px] text-slate-400">{formatEasternDateTime(task.dueAt)}</span> : null}
          <ReviewBadge status={reviewStatus}/>
        </div>
        <h3 className={`mt-1 text-base font-bold ${active ? "text-blue-950" : "text-slate-900"}`}>
          {onFocusTask ? <button type="button" className="text-left hover:underline" onClick={onFocusTask}>{task.title || "Call this Contact"}</button> : (task.title || "Call this Contact")}
        </h3>
        <p className={`mt-1 text-sm ${active ? "text-blue-900" : "text-slate-600"}`}>{contact?.name || "Contact"} · {phoneSummary}</p>
      </div>
      {showDial ? <div className="flex shrink-0"><CallWithQuoButton options={dialOptions} state={actionState} onCallOpening={onCallOpening}/></div> : null}
    </div>

    <div className={`mt-5 rounded-xl border ${active ? "border-blue-100/80 bg-white/70" : "border-slate-200 bg-white"}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setScriptOpen((open) => !open)}
        aria-expanded={scriptOpen}
      >
        <span className={`text-xs font-semibold tracking-wide ${active ? "text-blue-700" : "text-slate-500"}`}>Call script</span>
        {scriptOpen ? <ChevronDown className="size-4 shrink-0 text-slate-500"/> : <ChevronRight className="size-4 shrink-0 text-slate-500"/>}
      </button>
      {scriptOpen && <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-800">
        {scriptLoading ? <p className="text-slate-500">Loading call script…</p>
          : script ? (
            <PhoneCallCopy
              script={script}
              bodyClassName="text-slate-700"
              labelClassName="mb-1 text-[11px] font-semibold tracking-wide text-slate-500"
            />
          )
          : <p className="text-slate-500">No call content yet.</p>}
      </div>}
    </div>

    {currentCalls.length || (showCallerReview && currentRound.recalled) ? (
    <div className="mt-5">
      <ReviewRoundCard
        current
        round={currentRound}
        calls={currentCalls}
        emptyLabel={currentRound.recalled ? "No new Quo call for this round yet." : "No Quo call has been linked to this task yet."}
        hint={showCallerReview && currentRound.status !== "Qualified" ? <p className="text-xs leading-5 text-slate-600">{callerHint}</p> : null}
        onRefreshQuo={onRefreshQuo}
        quoRefreshingCallId={quoRefreshingCallId}
        selectableCalls={pickingCall}
        selectedCallId={selectedCallId}
        onSelectCall={setSelectedCallId}
      >
        {pickingCall ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <Textarea
                value={callerNote}
                onChange={(event) => setCallerNote(event.target.value)}
                className="min-h-20 resize-none bg-white"
                placeholder="Add context for AccountManager…"
                disabled={submittingCallerReview}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={submittingCallerReview} onClick={() => { setSelectingCall(false); setSelectedCallId(""); setCallerNote(""); }}>Cancel</Button>
              <Button
                size="sm"
                className="bg-amber-500 text-white hover:bg-amber-600"
                disabled={submittingCallerReview || !canConfirmSelection}
                onClick={() => {
                  if (!selectedCallId || !canConfirmSelection) return;
                  void Promise.resolve(onSubmitCallerReview?.(selectedCallId, callerNote.trim() || undefined));
                }}
              >
                {submittingCallerReview ? "Submitting…" : "Confirm selection"}
              </Button>
            </div>
          </div>
        ) : canSubmitThisRound ? (
          <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={() => { setSelectingCall(true); setSelectedCallId(""); setCallerNote(""); }}>Submit as qualified communication</Button>
        ) : null}
        {showReviewActions ? recallOpen ? (
          <UnqualifiedRecallForm
            reason={recallReason}
            onReason={setRecallReason}
            confirming={reviewing}
            onCancel={() => { setRecallOpen(false); setRecallReason(""); }}
            onConfirm={() => onReview("Unqualified", recallReason.trim())}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={reviewing} onClick={() => onReview("Qualified")}>
              <CheckCircle2 className="mr-1.5 size-3.5"/>{reviewing ? "Saving…" : "Mark as Qualified"}
            </Button>
            <Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" disabled={reviewing} onClick={() => setRecallOpen(true)}>
              <RotateCcw className="mr-1.5 size-3.5"/>Unqualified & Recall
            </Button>
          </div>
        ) : null}
      </ReviewRoundCard>
    </div>
    ) : null}

    {historyCalls.length ? (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
        >
          <span className="text-xs font-semibold tracking-wide text-slate-500">Review history</span>
          <span className="flex items-center gap-2 text-[11px] text-slate-400">
            {historyCalls.length} round{historyCalls.length === 1 ? "" : "s"}
            {historyOpen ? <ChevronDown className="size-4 text-slate-500"/> : <ChevronRight className="size-4 text-slate-500"/>}
          </span>
        </button>
        {historyOpen ? <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          {historyCalls.map(({ round, calls }) => (
            <ReviewRoundCard
              key={`${round.round}-${round.reviewedAt || round.submittedAt || "past"}`}
              round={round}
              calls={calls}
              emptyLabel="No Quo call was linked to this round."
              onRefreshQuo={onRefreshQuo}
              quoRefreshingCallId={quoRefreshingCallId}
            />
          ))}
        </div> : null}
      </div>
    ) : null}
  </section>;
}
