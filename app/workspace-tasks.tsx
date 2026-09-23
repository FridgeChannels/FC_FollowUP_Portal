/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enUS } from "date-fns/locale";
import {
  ArrowLeft, CalendarClock, Check, CheckCircle2, MessageCircle, Phone, Search, Send, UserRound,
} from "lucide-react";
import { type DateRange } from "react-day-picker";
import { toast } from "sonner";
import type { BrandActivity, BrandContact, BrandDetail, BrandTask, CurrentCpOption } from "@/lib/brand-list";
import { listApplicableCps } from "@/lib/brand-list";
import { brandHasActiveOmniReach } from "@/lib/notion/reply-inbox";
import { canSeeTask, compareInteractionSort, dateOnly, isCancelledTaskStatus, isClosedTaskStatus, type Contact, type CPCode, type Customer, type Interaction } from "@/lib/outreach-domain";
import { buildInteractionCpFallbacks, resolveInteractionDisplayCp } from "@/lib/interaction-cp";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_TASK_PAGE_SIZE } from "@/lib/notion/owner-filter";
import { ChangeCPDialog, LaunchBombDialog, LaunchOmniReachButton, ReplyDialog, ACTIVE_OMNIREACH_BLOCK_REASON } from "./workspace-customer";
import { InteractionFeed } from "./interaction-feed";
import { CallWithQuoButton, callScriptFromConversations, PhoneCallCopy, type QuoDialOpening } from "./phone-task-board";
import { Status } from "./workspace-pages";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dialPhoneOptions, formatDialPhoneSummary } from "@/lib/dial-phones";
import { devCallPhoneOnClient } from "@/lib/quo/dev-call-phone";
import { partitionRoundCalls, reviewRoundsForTask, type CallReviewRound } from "@/lib/call-review-history";
import { taskStatusForCallReview, type CallReviewMetadata, type CallReviewStatus } from "@/lib/call-review-metadata";
import { useSession } from "./use-session";

type TaskType = "Call" | "Reply";
type UnifiedTask = {
  id: string;
  source: "call" | "inbox";
  type: TaskType;
  customerId: string;
  contactId?: string;
  assigneeId?: string;
  dueAt: string;
  status: string;
  priority: "Urgent" | "High" | "Normal" | "Low";
  summary: string;
  notes?: string | null;
  brandName?: string;
  contactPhone?: string | null;
  templateId?: string | null;
  cp?: Customer["cp"];
  remote?: boolean;
  callReviewStatus?: CallReviewStatus | null;
  callReviewReason?: string | null;
  callQualifiedAt?: string | null;
  callReviewHistory?: CallReviewRound[];
};

type TaskPayload = {
  task?: BrandTask;
  activities?: BrandActivity[];
  brand?: BrandDetail | null;
  cps?: CurrentCpOption[];
  error?: string;
};

function asPriority(value?: string | null): UnifiedTask["priority"] {
  if (value === "P0" || value === "Urgent") return "Urgent";
  if (value === "P1" || value === "High") return "High";
  if (value === "P2" || value === "Low") return "Low";
  return "Normal";
}

function taskCp(value?: string | null): Customer["cp"] | undefined {
  return ["CP1", "CP2", "CP3", "CP4", "CP5", "CP6"].includes(value || "")
    ? value as Customer["cp"]
    : undefined;
}

function fromNotionTask(task: BrandTask): UnifiedTask {
  const priority = asPriority(task.priority);
  return {
    id: task.id,
    source: task.channel === "Phone" ? "call" : "inbox",
    type: task.channel === "Phone" ? "Call" : "Reply",
    customerId: task.brandId || "",
    contactId: task.contactId || undefined,
    assigneeId: task.ownerId || undefined,
    dueAt: task.lastInboundAt || task.scheduledAt || "",
    status: task.inboxStatus || task.status || "Pending",
    priority: task.inboxStatus === "Needs Reply" && priority !== "Urgent" ? "High" : priority,
    summary: task.inboxStatus && task.preview ? task.preview : task.title,
    notes: task.notes,
    brandName: task.brandName || undefined,
    contactPhone: task.contactPhone || undefined,
    templateId: task.templateId,
    cp: taskCp(task.sourceBombCp),
    remote: true,
    callReviewStatus: task.callReviewStatus || null,
    callReviewReason: task.callReviewReason || null,
    callQualifiedAt: task.callQualifiedAt || null,
    callReviewHistory: task.callReviewHistory,
  };
}

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);
const priorityRank: Record<UnifiedTask["priority"], number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const isDone = (task: UnifiedTask) => isClosedTaskStatus(task.status);
type CallReviewView = Pick<CallReviewMetadata, "status" | "recallRequested"> & { taskId?: string | null };
const reviewFromNotion = (task: { id: string; callReviewStatus?: CallReviewStatus | null }): CallReviewView | undefined =>
  task.callReviewStatus
    ? { taskId: task.id, status: task.callReviewStatus, recallRequested: task.callReviewStatus === "Unqualified" }
    : undefined;
const taskWithCallReview = (task: UnifiedTask, review?: CallReviewView) => review ? { ...task, status: taskStatusForCallReview(task.status, review) } : task;
const CallReviewBadge = ({ review }: { review?: CallReviewView }) => {
  if (!review) return null;
  const className =
    review.status === "Qualified" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : review.status === "Unqualified" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : "bg-amber-100 text-amber-900 hover:bg-amber-100";
  const label = review.status === "Awaiting Review" ? "awaiting review" : review.status.toLowerCase();
  return <Badge className={className}>{label}</Badge>;
};
const isDue = (task: UnifiedTask, now: string) => {
  if (isDone(task)) return false;
  if (task.source === "inbox" && task.status === "Waiting for Reply") return false;
  return dateOnly(task.dueAt) <= dateOnly(now);
};

function parseDateOnly(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnlyLabel(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function dueDateRangeLabel(from: string, to: string) {
  if (from && to && from !== to) return `${formatDateOnlyLabel(from)} – ${formatDateOnlyLabel(to)}`;
  if (from) return formatDateOnlyLabel(from) || "Due date";
  if (to) return `Until ${formatDateOnlyLabel(to)}`;
  return "Due date";
}

function matchesDueRange(task: UnifiedTask, from: string, to: string) {
  if (!from && !to) return true;
  const day = dateOnly(task.dueAt);
  if (!day) return false;
  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

/** Caller ReplyTask is brand-scoped: keep the first (already sorted) Phone row per brand. */
function dedupeCallerTasksByBrand(tasks: UnifiedTask[]): UnifiedTask[] {
  const seen = new Set<string>();
  const result: UnifiedTask[] = [];
  for (const task of tasks) {
    const key = task.customerId || task.brandName || task.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(task);
  }
  return result;
}

export function TasksPage({ selectedId }: { selectedId?: string }) {
  const { state } = useWorkspace();
  const router = useRouter();
  const manager = state.currentRole === "Admin";
  const [type, setType] = useState<TaskType | "All">(state.currentRole === "Caller" ? "Call" : "All");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<"Open" | "Completed" | "All">("Open");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [query, setQuery] = useState("");
  const isCaller = state.currentRole === "Caller";
  const hasDueDateFilter = Boolean(dueFrom || dueTo);
  const dueDateSelected: DateRange | undefined =
    dueFrom || dueTo
      ? { from: parseDateOnly(dueFrom), to: parseDateOnly(dueTo || dueFrom) }
      : undefined;
  const [remoteTasks, setRemoteTasks] = useState<UnifiedTask[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [detailTask, setDetailTask] = useState<UnifiedTask | null>(null);

  useEffect(() => {
    setType(state.currentRole === "Caller" ? "Call" : "All");
    setAssignee("all");
    setDueFrom("");
    setDueTo("");
  }, [state.currentRole]);

  const taskListQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (manager && assignee === "unassigned") params.set("owner", "unassigned");
    params.set(
      "status",
      status === "Completed" ? "completed" : status === "All" ? "all" : "open",
    );
    if (isCaller && dueFrom) params.set("dueFrom", dueFrom);
    if (isCaller && dueTo) params.set("dueTo", dueTo);
    params.set("limit", String(DEFAULT_TASK_PAGE_SIZE));
    return params.toString();
  }, [manager, assignee, status, isCaller, dueFrom, dueTo]);

  useEffect(() => {
    let cancelled = false;
    setRemoteLoading(true);
    setNextCursor(null);
    setHasMore(false);
    fetch(`/api/tasks?${taskListQuery}`)
      .then(async response => {
        const payload = await response.json() as {
          tasks?: BrandTask[];
          nextCursor?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load tasks");
        const items = (payload.tasks || []).map(fromNotionTask);
        const more = Boolean(payload.hasMore && payload.nextCursor && items.length >= DEFAULT_TASK_PAGE_SIZE);
        return {
          items,
          nextCursor: more ? (payload.nextCursor || null) : null,
          hasMore: more,
        };
      })
      .then(result => {
        if (cancelled) return;
        setRemoteTasks(result.items);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      })
      .catch(() => {
        if (cancelled) return;
        setRemoteTasks([]);
        setNextCursor(null);
        setHasMore(false);
      })
      .finally(() => { if (!cancelled) setRemoteLoading(false); });
    return () => { cancelled = true; };
  }, [taskListQuery]);

  const loadMoreTasks = () => {
    if (!nextCursor || loadingMore || remoteLoading) return;
    setLoadingMore(true);
    const params = new URLSearchParams(taskListQuery);
    params.set("cursor", nextCursor);
    fetch(`/api/tasks?${params.toString()}`)
      .then(async response => {
        const payload = await response.json() as {
          tasks?: BrandTask[];
          nextCursor?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load tasks");
        const items = (payload.tasks || []).map(fromNotionTask);
        const more = Boolean(payload.hasMore && payload.nextCursor && items.length >= DEFAULT_TASK_PAGE_SIZE);
        return {
          items,
          nextCursor: more ? (payload.nextCursor || null) : null,
          hasMore: more,
        };
      })
      .then(result => {
        setRemoteTasks(prev => [...(prev || []), ...result.items]);
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      })
      .catch(() => {
        /* keep existing list */
      })
      .finally(() => {
        setLoadingMore(false);
      });
  };

  const allTasks = useMemo<UnifiedTask[]>(() => (remoteTasks ?? []).map(task => taskWithCallReview(task, reviewFromNotion(task))), [remoteTasks]);

  const tasks = useMemo(() => {
    const filtered = allTasks.filter(task => {
      const customer = state.customers.find(c => c.id === task.customerId);
      const matchesQuery = !query || customer?.name.toLowerCase().includes(query.toLowerCase()) || (task.brandName || "").toLowerCase().includes(query.toLowerCase()) || task.summary.toLowerCase().includes(query.toLowerCase());
      const matchesScope = task.remote || canSeeTask(state, task.customerId, task.assigneeId);
      const matchesType = type === "All" || task.type === type;
      const matchesAssignee = assignee === "all" || (assignee === "unassigned" ? !task.assigneeId : task.assigneeId === assignee);
      const matchesStatus = status === "All" || status === "Open" && !isDone(task) || status === "Completed" && isDone(task);
      const matchesReplyOpen = !(task.remote && status === "Open" && task.type === "Reply" && task.status !== "Needs Reply" && task.status !== "Waiting for Reply");
      const matchesDue = !isCaller || matchesDueRange(task, dueFrom, dueTo);
      return matchesQuery && matchesScope && matchesType && matchesAssignee && matchesStatus && matchesReplyOpen && matchesDue;
    }).sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      const aDue = isDue(a, state.simulatedDate);
      const bDue = isDue(b, state.simulatedDate);
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
      return a.dueAt.localeCompare(b.dueAt);
    });
    // Caller queue is brand-level: one list row per Follow-up Client.
    return isCaller ? dedupeCallerTasksByBrand(filtered) : filtered;
  }, [allTasks, state, query, type, assignee, status, isCaller, dueFrom, dueTo]);

  const selectedFromList = selectedId ? allTasks.find(task => task.id === selectedId) : undefined;
  const selectedTask = selectedFromList || detailTask || undefined;

  // Deep-link / refresh: mount TaskDetail immediately with a stub (no second full-page fetch).
  useEffect(() => {
    if (!selectedId) {
      setDetailTask(null);
      return;
    }
    if (selectedFromList) {
      setDetailTask(null);
      return;
    }
    setDetailTask((prev) => (prev?.id === selectedId ? prev : stubTaskFromId(selectedId, state.currentRole)));
  }, [selectedId, selectedFromList, state.currentRole]);

  if (selectedId) {
    if (!selectedTask) return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading task…</div>;
    return <TaskDetail task={selectedTask}/>;
  }

  return <div className="mx-auto max-w-[1540px]">
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">ReplyTask</h1>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-3 lg:flex-row lg:items-center">
      <div className="relative min-w-56 flex-1 lg:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brand or task…" className="pl-9"/></div>
      {state.currentRole !== "Caller" && <Select value={type} onValueChange={value => setType(value as TaskType | "All")}><SelectTrigger className="w-full lg:w-40"><SelectValue/></SelectTrigger><SelectContent>{["All", "Call", "Reply"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All types" : value}</SelectItem>)}</SelectContent></Select>}
      {manager && <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All AccountManagers</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}
      {isCaller && <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={`w-full justify-start font-normal lg:w-[16.5rem] ${hasDueDateFilter ? "" : "text-muted-foreground"}`}
            >
              <CalendarClock className="size-4 text-slate-400"/>
              {dueDateRangeLabel(dueFrom, dueTo)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0" lang="en">
            <Calendar
              mode="range"
              locale={enUS}
              numberOfMonths={1}
              selected={dueDateSelected}
              defaultMonth={dueDateSelected?.from || dueDateSelected?.to}
              onSelect={(range) => {
                const from = range?.from ? formatDateOnly(range.from) : "";
                const to = range?.to ? formatDateOnly(range.to) : from;
                setDueFrom(from);
                setDueTo(to);
              }}
              formatters={{
                formatCaption: (date) =>
                  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date),
                formatWeekdayName: (date) =>
                  new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
                formatMonthDropdown: (date) =>
                  new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
              }}
            />
          </PopoverContent>
        </Popover>
        {hasDueDateFilter ? (
          <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={() => { setDueFrom(""); setDueTo(""); }}>
            Clear
          </Button>
        ) : null}
      </div>}
      <Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger className="w-full lg:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="All">All statuses</SelectItem></SelectContent></Select>
    </div>

    <div className="overflow-hidden rounded-2xl bg-white">
      {remoteLoading ? <div className="px-5 py-16 text-sm text-slate-500">Loading tasks…</div> : tasks.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="min-w-56 pl-5">Brand</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => {
        const customer = state.customers.find(c => c.id === task.customerId);
        const overdue = isDue(task, state.simulatedDate);
        const Icon = task.type === "Call" ? Phone : MessageCircle;
        return <TableRow key={task.id} className={`cursor-pointer ${overdue ? "bg-amber-50/80 hover:bg-amber-50" : "hover:bg-violet-50/30"}`} onClick={() => router.push(`/tasks/${task.id}`)}>
          <TableCell className="pl-5"><div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${task.type === "Call" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}><Icon className="size-4"/></span><div className="text-sm font-semibold">{customer?.name || task.brandName || "Unknown brand"}</div></div></TableCell>
          <TableCell><div className="flex flex-wrap items-center gap-1.5">{overdue ? <Status value="Due"/> : <Status value={task.status}/>}<CallReviewBadge review={reviewFromNotion(task)}/></div></TableCell>
          <TableCell className="whitespace-nowrap text-xs text-slate-500">{dateOnly(task.dueAt)}</TableCell>
        </TableRow>;
      })}</TableBody></Table>
        {hasMore && nextCursor && (remoteTasks?.length || 0) >= DEFAULT_TASK_PAGE_SIZE ? (
          <div className="border-t border-slate-100 p-3">
            <Button variant="outline" size="sm" className="w-full" disabled={loadingMore || remoteLoading} onClick={loadMoreTasks}>
              {loadingMore ? <span className="inline-flex items-center gap-2"><Spinner className="size-3.5"/>Loading…</span> : "Load more"}
            </Button>
          </div>
        ) : null}
      </div> : <Empty className="py-24"><EmptyHeader><EmptyMedia variant="icon"><CheckCircle2/></EmptyMedia><EmptyTitle>All caught up</EmptyTitle><EmptyDescription>No tasks match these filters.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  </div>;
}

function toTaskContact(item: BrandContact): Contact {
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    title: item.title || undefined,
    contactRole: item.contactRole || undefined,
    email: item.email || undefined,
    phone: item.phone || undefined,
    directPhone: item.directPhone || undefined,
    officePhone: item.officePhone || undefined,
    whatsapp: item.whatsapp || undefined,
    linkedin: item.linkedin || undefined,
    preferredChannel: item.email ? "Email" : item.linkedin ? "LinkedIn" : "Phone",
    emailValid: item.emailValid,
    phoneValid: item.phoneValid,
  };
}

function stubTaskFromId(id: string, role: string): UnifiedTask {
  const isCaller = role === "Caller";
  return {
    id,
    source: isCaller ? "call" : "inbox",
    type: isCaller ? "Call" : "Reply",
    customerId: "",
    dueAt: "",
    status: "Pending",
    priority: "Normal",
    summary: "Loading…",
    remote: true,
    callReviewStatus: null,
  };
}

function shellFromTask(task: UnifiedTask): {
  customer: Customer;
  contact: Contact;
  timeline: Interaction[];
  ownerName?: string;
  brand?: BrandDetail;
  cps?: CurrentCpOption[];
} {
  const phone = task.contactPhone || undefined;
  const contact: Contact = {
    id: task.contactId || "unknown",
    name: "KeyPerson",
    role: "Other",
    phone,
    preferredChannel: "Phone",
    emailValid: false,
    phoneValid: !!phone,
  };
  const name = task.brandName || "Untitled brand";
  const customer: Customer = {
    id: task.customerId || task.id,
    name,
    initials: name.slice(0, 2).toUpperCase(),
    cp: "CP1",
    status: "Ready",
    source: "Follow-up ClientDB",
    contacts: [contact],
    createdAt: "",
    updatedAt: "",
  };
  return { customer, contact, timeline: [] };
}

const QUO_POLL_INTERVAL_MS = 10_000;
const QUO_POLL_WINDOW_MS = 3 * 60_000;

function taskPollUrl(taskId: string) {
  return `/api/tasks/${encodeURIComponent(taskId)}?lite=1`;
}

function timelineQuoCallId(timeline: Interaction[], taskId?: string) {
  return timeline.find((item) => (!taskId || item.taskId === taskId) && item.quo?.callId)?.quo?.callId;
}

function quoArtifactsMissing(timeline: Interaction[], callId: string) {
  return !timeline.some((item) => {
    const quo = item.quo;
    if (!quo || quo.callId !== callId) return false;
    const hasRecording = !!(quo.recordings?.length || quo.call?.recordings?.length || quo.call?.media?.some((media) => !!media.url));
    const hasSummary = !!(quo.summary?.summary?.length);
    const hasTranscript = !!(quo.transcript?.dialogue?.length);
    return hasRecording && hasSummary && hasTranscript;
  });
}

function shouldPollCallTask(input: {
  remote: boolean;
  type: UnifiedTask["type"];
  status: string;
  callReviewStatus?: CallReviewStatus | null;
  timeline: Interaction[];
  taskId: string;
  quoPollUntil: number;
}) {
  if (!input.remote || input.type !== "Call") return false;

  const awaitingReview = input.callReviewStatus === "Awaiting Review";
  const callId = timelineQuoCallId(input.timeline, input.taskId);
  if (awaitingReview && callId && !callId.startsWith("ACsim") && quoArtifactsMissing(input.timeline, callId)) {
    return true;
  }

  if (Date.now() >= input.quoPollUntil) return false;
  if (input.timeline.some((item) => item.taskId === input.taskId && item.quo)) return false;
  if (input.callReviewStatus === "Awaiting Review" || input.callReviewStatus === "Qualified") return false;
  if (isClosedTaskStatus(input.status)) return false;
  return true;
}

function TaskDetail({ task }: { task: UnifiedTask }) {
  const { state, can, resolveInbox, assignBrand, reassignCall } = useWorkspace();
  const { user } = useSession();
  const router = useRouter();
  const [launch, setLaunch] = useState(false);
  const [sendMessage, setSendMessage] = useState(false);
  const [changeCP, setChangeCP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [owners, setOwners] = useState<Array<{id:string;name:string}>>([]);
  const [liveTask, setLiveTask] = useState(task);
  const [quoRefreshingCallId, setQuoRefreshingCallId] = useState<string | null>(null);
  const [quoPollUntil, setQuoPollUntil] = useState(0);
  const autoRefreshedQuoCallId = useRef<string | null>(null);
  const [remote, setRemote] = useState<{ customer: Customer; contact: Contact; timeline: Interaction[]; ownerName?: string; brand?: BrandDetail; cps?: CurrentCpOption[] } | null>(
    () => (task.remote ? shellFromTask(task) : null),
  );
  const [detailHydrated, setDetailHydrated] = useState(false);
  const applyTaskPayload = (payload: { task?: BrandTask; activities?: BrandActivity[]; brand?: BrandDetail | null; cps?: CurrentCpOption[] }) => {
    if (!payload.task) return;
    const item = payload.task;
    const brandContacts = (payload.brand?.contacts || []).map(toTaskContact);
    const matched = brandContacts.find(entry => entry.id === item.contactId) || brandContacts[0];
    const phone = matched?.phone || item.contactPhone || undefined;
    const preferredChannel =
      item.channel === "Phone" || item.channel === "Email" || item.channel === "SMS" || item.channel === "WhatsApp" || item.channel === "LinkedIn"
        ? (item.channel as Contact["preferredChannel"])
        : ("Email" as const);
    const contact: Contact = matched
      ? { ...matched, phone, phoneValid: matched.phoneValid || !!phone }
      : {
      id: item.contactId || "unknown",
      name: item.contactName || "KeyPerson",
      role: "Other",
      phone,
      preferredChannel,
      emailValid: false,
      phoneValid: !!phone,
    };
    const customer: Customer = {
      id: item.brandId || payload.brand?.id || task.customerId,
      name: payload.brand?.name || item.brandName || task.brandName || "Untitled brand",
      initials: payload.brand?.initials || (item.brandName || "BR").slice(0, 2).toUpperCase(),
      cp: ["CP1", "CP2", "CP3", "CP4", "CP5", "CP6"].includes(payload.brand?.currentCp || "") ? payload.brand!.currentCp as Customer["cp"] : "CP1",
      status: (payload.brand?.status || "Ready") as Customer["status"],
      source: "Follow-up ClientDB",
      ownerId: payload.brand?.ownerId || item.brandOwnerId || undefined,
      contacts: brandContacts.length ? brandContacts : [contact],
      createdAt: payload.brand?.createdAt || "",
      updatedAt: payload.brand?.lastEditedAt || "",
    };
    const activities = payload.activities || [];
    const fallbacks = buildInteractionCpFallbacks(
      activities.map((activity) => ({
        threadId: activity.threadId,
        taskId: activity.taskId,
        direction: activity.direction,
        stampedCp: activity.cpAtInteraction || undefined,
        sortAt: activity.scheduledAt || activity.recordedAt || activity.createdAt || "",
      })),
    );
    const taskById = new Map((payload.brand?.tasks || []).map(item => [item.id, item]));
    if (payload.task) taskById.set(payload.task.id, payload.task);
    const timeline: Interaction[] = activities.map(activity => ({
      id: activity.id,
      customerId: customer.id,
      contactId: activity.contactId || undefined,
      type: activity.channel === "Phone" ? "Phone" : "Message",
      channel: activity.channel === "Phone" || activity.channel === "Email" || activity.channel === "SMS" || activity.channel === "WhatsApp" || activity.channel === "LinkedIn" ? activity.channel : undefined,
      direction: activity.direction || undefined,
      title: activity.subject || activity.channel || "Conversation",
      content: activity.content,
      cc: activity.cc || undefined,
      createdAt: activity.createdAt || "",
      recordedAt: activity.recordedAt || "",
      // Inbound shares the outbound Task — do not inherit Task Scheduled At for sorting.
      scheduledAt: activity.scheduledAt
        || (activity.direction === "Outbound" && activity.taskId
          ? taskById.get(activity.taskId)?.scheduledAt
          : undefined)
        || undefined,
      outcome: activity.callResult as Interaction["outcome"],
      callResult: activity.callResult || undefined,
      quo: activity.quo || null,
      attachments: activity.attachments,
      cp: resolveInteractionDisplayCp(activity.cpAtInteraction || undefined, activity, fallbacks),
      taskId: activity.taskId || undefined,
      threadId: activity.threadId || undefined,
      taskStatus: (activity.taskId ? taskById.get(activity.taskId)?.status : undefined) || undefined,
    }));
    setRemote({ customer, contact, timeline, ownerName: item.ownerName || payload.brand?.ownerName || undefined, brand: payload.brand || undefined, cps: payload.cps });
    setLiveTask(fromNotionTask(item));
    setDetailHydrated(true);
  };
  useEffect(() => {
    setLiveTask(task);
    autoRefreshedQuoCallId.current = null;
    if (task.remote && !detailHydrated) setRemote(shellFromTask(task));
  }, [task, detailHydrated]);
  useEffect(() => {
    if (!task.remote) {
      setRemote(null);
      setDetailHydrated(true);
      return;
    }
    setRemote(shellFromTask(task));
    setDetailHydrated(false);
    let cancelled = false;
    fetch(`/api/tasks/${task.id}`)
      .then(async response => {
        const payload = await response.json() as { task?: BrandTask; activities?: BrandActivity[]; brand?: BrandDetail; cps?: CurrentCpOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Task not found");
        return payload;
      })
      .then(payload => { if (!cancelled) applyTaskPayload(payload); })
      .catch(() => {
        if (cancelled) return;
        setDetailHydrated(true);
      });
    return () => { cancelled = true; };
  }, [task.id, task.remote]);
  useEffect(() => {
    if (!task.remote || !can("assignOwner")) return;
    let cancelled = false;
    fetch("/api/owners")
      .then(async response => {
        const payload = await response.json() as { owners?: Array<{id:string;name:string}> };
        if (!response.ok) throw new Error("Failed to load owners");
        return payload.owners || [];
      })
      .then(items => { if (!cancelled) setOwners(items); })
      .catch(() => { if (!cancelled) setOwners([]); });
    return () => { cancelled = true; };
  }, [task.remote, task.id]);
  useEffect(() => {
    if (!task.remote || task.type !== "Call") return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      const timeline = remote?.timeline || [];
      if (!shouldPollCallTask({
        remote: !!task.remote,
        type: task.type,
        status: liveTask.status,
        callReviewStatus: liveTask.callReviewStatus,
        timeline,
        taskId: task.id,
        quoPollUntil,
      })) return;
      inFlight = true;
      try {
        const response = await fetch(taskPollUrl(task.id));
        if (!response.ok) return;
        const payload = await response.json() as TaskPayload;
        if (!cancelled) applyTaskPayload(payload);
      } catch {
        // Quo webhook may still be processing; next tick retries.
      } finally {
        inFlight = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, QUO_POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [task.id, task.remote, task.type, liveTask.status, liveTask.callReviewStatus, quoPollUntil, remote?.timeline]);
  const localCustomer = state.customers.find(c => c.id === task.customerId);
  const customer = localCustomer || remote?.customer;
  const partnershipContext=customer?.partnershipContext;
  const contact = localCustomer?.contacts.find(c => c.id === task.contactId) || localCustomer?.contacts[0] || remote?.contact;
  const callTask = liveTask.source === "call" ? state.callTasks.find(call => call.id === liveTask.id) : undefined;
  const taskReview = reviewFromNotion(liveTask);
  const reviewedTask = taskWithCallReview(liveTask, taskReview);
  const persistCallReview = async (taskId: string, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => {
    const response = await fetch(`/api/tasks/${taskId}/call-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewReason, reviewNote }),
    });
    const payload = await response.json() as TaskPayload;
    if (!response.ok) throw new Error(payload.error || "Unable to save call review");
    applyTaskPayload(await fetch(taskPollUrl(task.id)).then(item => item.json()) as TaskPayload);
  };
  const baseTimeline = remote?.timeline || state.interactions.filter(item => item.customerId === task.customerId).map(item => ({ ...item, cp: item.cp || customer?.cp }));
  const timeline = [...baseTimeline].sort((a, b) => compareInteractionSort(b, a));
  const callScript = callScriptFromConversations(timeline, liveTask.id);
  const callScriptLoading = task.remote && !detailHydrated;
  const refreshQuo = async (callId: string, options?: { silent?: boolean }) => {
    if (!task.remote || quoRefreshingCallId) return;
    setQuoRefreshingCallId(callId);
    try {
      const response = await fetch(`/api/tasks/${task.id}/quo?callId=${encodeURIComponent(callId)}`);
      const payload = await response.json() as { data?: import("@/lib/quo/types").QuoCallData | null; errors?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to refresh Quo data");
      const next = await fetch(taskPollUrl(task.id));
      applyTaskPayload(await next.json() as TaskPayload);
      if (options?.silent) return;
      if (payload.errors?.length) toast.warning(`Quo refresh completed with ${payload.errors.length} unavailable section${payload.errors.length === 1 ? "" : "s"}`);
      else toast.success("Quo data refreshed");
    } catch (error) {
      if (!options?.silent) toast.error(error instanceof Error ? error.message : "Unable to refresh Quo data");
    } finally {
      setQuoRefreshingCallId(null);
    }
  };
  useEffect(() => {
    if (!task.remote || liveTask.callReviewStatus !== "Awaiting Review" || !remote?.timeline.length) return;
    const callId = timelineQuoCallId(remote.timeline, liveTask.id);
    if (!callId || callId.startsWith("ACsim")) return;
    if (autoRefreshedQuoCallId.current === callId) return;
    if (!quoArtifactsMissing(remote.timeline, callId)) return;
    autoRefreshedQuoCallId.current = callId;
    const timer = window.setTimeout(() => {
      void refreshQuo(callId, { silent: true });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [task.remote, liveTask.callReviewStatus, remote?.timeline]);
  if (!customer || !contact) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Brand context unavailable.</main>;
  const humanAssignees = state.users.filter(user => user.role === "AccountManager" || user.role === "Admin");
  const callers = state.users.filter(user => user.role === "Caller");
  const callerPhoneOnly = user?.role === "Caller" || state.currentRole === "Caller";
  const canReviewCalls = task.remote && !callerPhoneOnly && can("reply");
  const reviewHistory = liveTask.callReviewHistory || [];
  const currentRoundCalls = partitionRoundCalls(
    timeline.filter((item) =>
      item.taskId === liveTask.id
      && item.channel === "Phone"
      && !!item.quo,
    ),
    reviewRoundsForTask(reviewHistory),
    (item) => item.quo?.callId,
    (item) => item.createdAt,
  ).current;
  const hasConnectedCall = currentRoundCalls.some((item) => item.callResult === "Connected");
  const awaitingAccountManagerReview = liveTask.callReviewStatus === "Awaiting Review";
  const recalledByAccountManager = liveTask.callReviewStatus === "Unqualified";
  const canSubmitCallerReview = callerPhoneOnly
    && !!task.remote
    && liveTask.type === "Call"
    && !awaitingAccountManagerReview
    && liveTask.callReviewStatus !== "Qualified"
    && (recalledByAccountManager || !isDone(liveTask))
    && hasConnectedCall;
  const submitCallerReview = async (callId: string, note?: string) => {
    if (!task.remote || !canSubmitCallerReview) return;
    setSubmittingReview(true);
    try {
      const response = await fetch(`/api/tasks/${task.id}/submit-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, note: note?.trim() || undefined }),
      });
      const payload = await response.json() as TaskPayload;
      if (!response.ok) throw new Error(payload.error || "Unable to submit call review");
      applyTaskPayload(payload);
      toast.success("Submitted for AccountManager review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit call review");
    } finally {
      setSubmittingReview(false);
    }
  };
  const reviewTasks = [
    ...(remote?.brand?.tasks || []),
    ...(liveTask.callReviewStatus || liveTask.type === "Call" ? [{
      id: liveTask.id,
      channel: liveTask.type === "Call" ? "Phone" : undefined,
      title: liveTask.summary,
      status: liveTask.status,
      contactId: liveTask.contactId,
      contactPhone: liveTask.contactPhone,
      scheduledAt: liveTask.dueAt,
      callReviewStatus: liveTask.callReviewStatus,
      callReviewHistory: liveTask.callReviewHistory,
      remote: true,
    }] : []),
  ];
  const onCallOpening = (info?: Partial<QuoDialOpening>) => {
    if (!task.remote) return;
    const taskId = info?.taskId || liveTask.id;
    setQuoPollUntil(Date.now() + QUO_POLL_WINDOW_MS);
    void fetch(`/api/tasks/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quo-attempt", phone: info?.phone }),
      keepalive: true,
    }).then(async (response) => {
      if (response.ok) applyTaskPayload(await response.json() as TaskPayload);
    }).catch(() => undefined);
  };
  const callBrief = reviewedTask.type === "Call" && !callerPhoneOnly
    ? <CallBrief
        script={callScript}
        scriptLoading={callScriptLoading}
        task={reviewedTask}
        contact={contact}
        completed={isDone(reviewedTask)}
        review={taskReview}
        onCallOpening={onCallOpening}
      />
    : null;
  const callerPhoneTasks = (() => {
    // Brand-level board: all Phone tasks; InteractionFeed filters by Conversation CP.
    const fromBrand = (remote?.brand?.tasks || [])
      .filter((item) => item.channel === "Phone")
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status || "Pending",
        dueAt: item.scheduledAt,
        contactId: item.contactId,
        contactPhone: item.contactPhone,
        templateId: item.templateId,
        scheduledAt: item.scheduledAt,
        callReviewStatus: item.callReviewStatus,
        callReviewHistory: item.callReviewHistory,
        channel: "Phone" as const,
        remote: true,
      }));
    const mappedLive = {
      id: liveTask.id,
      title: liveTask.summary,
      status: liveTask.status,
      dueAt: liveTask.dueAt,
      contactId: liveTask.contactId,
      contactPhone: liveTask.contactPhone,
      templateId: liveTask.templateId,
      scheduledAt: liveTask.dueAt,
      callReviewStatus: liveTask.callReviewStatus,
      callReviewHistory: liveTask.callReviewHistory,
      channel: "Phone" as const,
      remote: true,
    };
    return fromBrand.some((item) => item.id === liveTask.id) ? fromBrand : [mappedLive, ...fromBrand];
  })();
  const callerCpGoals = Object.fromEntries(
    (remote?.cps?.length ? remote.cps : listApplicableCps())
      .filter((item) => /^CP[1-3]$/.test(item.name))
      .map((item) => [item.name, item.fullName]),
  ) as Partial<Record<CPCode, string>>;

  return <div className="mx-auto max-w-[1540px]">
    <button onClick={() => router.push("/tasks")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>ReplyTask</button>
    <main className="min-w-0 overflow-hidden rounded-2xl bg-white">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 lg:px-7">
      <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{reviewedTask.type}</Badge>{isDue(reviewedTask, state.simulatedDate) ? <Status value="Due"/> : <Badge variant="secondary">{reviewedTask.status}</Badge>}<CallReviewBadge review={taskReview}/><span className="text-xs text-slate-400">{dateOnly(reviewedTask.dueAt)}</span></div><h2 className="mt-2 text-xl font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{contact.name} · {contact.role} · {customer.cp} · {customer.status}{callerPhoneOnly && <> · Account Manager: {remote?.ownerName || state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</>}</p></div>
      {callerPhoneOnly ? null : <Button variant="outline" size="sm" disabled={!customer.id} onClick={() => router.push(`/customers/${encodeURIComponent(customer.id)}`)}>Brand profile</Button>}
    </header>

    <div className={callerPhoneOnly ? "grid" : "grid lg:grid-cols-[minmax(0,1fr)_290px]"}>
      <div className="min-w-0 p-5 lg:p-7">
        {callerPhoneOnly && reviewedTask.type === "Call" ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <InteractionFeed
              key={`${customer.id}-${customer.cp}`}
              callerPhoneOnly
              customerId={customer.id}
              currentCp={customer.cp}
              cpGoals={callerCpGoals}
              interactions={timeline}
              contacts={customer.contacts}
              tasks={callerPhoneTasks}
              loading={!detailHydrated}
              scriptsLoading={callScriptLoading}
              activeTaskId={liveTask.id}
              headerContactName={contact.name}
              onSelectTask={(taskId) => router.push(`/tasks/${encodeURIComponent(taskId)}`)}
              onCallOpening={onCallOpening}
              callerReviewTaskId={liveTask.id}
              callerReviewHasConnectedCall={hasConnectedCall}
              callerReviewCanSubmit={canSubmitCallerReview}
              onSubmitCallerReview={(callId, note) => void submitCallerReview(callId, note)}
              submittingCallerReview={submittingReview}
              onRefreshQuo={task.remote ? refreshQuo : undefined}
              quoRefreshingCallId={quoRefreshingCallId}
            />
            </div>
          </div>
        ) : (
          <>
            {callBrief}
            <section>
              <h3 className="mb-3 font-bold">Brand activity</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <InteractionFeed
                key={`${customer.id}-${customer.cp}-${liveTask.type}`}
                customerId={customer.id}
                currentCp={customer.cp}
                interactions={timeline}
                contacts={customer.contacts}
                tasks={reviewTasks}
                maxHeight="max-h-[640px]"
                initialChannel={liveTask.type === "Call" ? "Phone" : undefined}
                canReviewCalls={canReviewCalls}
                onPersistCallReview={task.remote ? persistCallReview : undefined}
                onRefreshQuo={task.remote ? refreshQuo : undefined}
                quoRefreshingCallId={quoRefreshingCallId}
              />
              </div>
            </section>
          </>
        )}
      </div>

      {!callerPhoneOnly && <aside className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0 lg:p-6">
        <div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{customer.initials}</AvatarFallback></Avatar><div><b className="text-sm">{customer.name}</b><div className="text-xs text-slate-500">{state.cps.find(cp => cp.code === customer.cp)?.goal}</div></div></div>
        {(customer.cp === "CP3" || partnershipContext) && partnershipContext && <section className="mt-5 rounded-xl bg-emerald-50 p-4"><div className="text-[11px] font-semibold tracking-wide text-emerald-700">CP3 · Partnership context</div><div className="mt-2 text-sm font-bold text-emerald-950">{partnershipContext.headline}</div><p className="mt-2 text-xs leading-5 text-emerald-900">{partnershipContext.summary}</p><div className="mt-3 space-y-2">{partnershipContext.signals.map(signal=><div key={signal} className="rounded-lg bg-white/70 px-2.5 py-2 text-xs leading-5 text-slate-700">{signal}</div>)}</div></section>}
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">AccountManager</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4"/>{remote?.ownerName || state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</div></div>

        {callTask && can("manageCalls") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={callTask.callerId} onValueChange={value => show(reassignCall(callTask.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent>{callers.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.remote && task.type === "Call" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={task.assigneeId || "unassigned"} onValueChange={value => { void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json() as TaskPayload; if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(payload); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{owners.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.source === "inbox" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign AccountManager</label><Select value={task.assigneeId || customer.ownerId || "unassigned"} onValueChange={value => { if (!task.remote) { show(assignBrand(customer.id, value)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/brands/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(await fetch(`/api/tasks/${task.id}`).then(item => item.json())); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{(task.remote ? owners : humanAssignees).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}

        {task.source === "inbox" && <div className="mt-5 grid gap-2">
          {can("reply") && <Button variant="outline" className="justify-start" onClick={() => setSendMessage(true)}><Send className="mr-2 size-4"/>Send message</Button>}
          {can("launch") && <LaunchOmniReachButton className="justify-start w-full" disabled={task.remote ? brandHasActiveOmniReach(remote?.brand?.tasks || []) : (!!customer.activeBombId || customer.status === "Bomb Running")} disabledReason={ACTIVE_OMNIREACH_BLOCK_REASON} onClick={() => setLaunch(true)} />}
          {can("changeCP") && <Button variant="outline" className="justify-start" onClick={() => setChangeCP(true)}><Check className="mr-2 size-4"/>Change CP</Button>}
          {can("reply") && !isDone(liveTask) && <Button variant="outline" className="justify-start" disabled={saving} onClick={() => { if (!task.remote) { show(resolveInbox(task.id)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Completed" }) }); const payload = await response.json() as TaskPayload; if (!response.ok) throw new Error(payload.error || "Update failed"); applyTaskPayload(payload); toast.success("Task completed"); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); } finally { setSaving(false); } })(); }}><CheckCircle2 className="mr-2 size-4"/>End task</Button>}
        </div>}
      </aside>}
    </div>

    <LaunchBombDialog customerId={customer.id} open={launch} onOpenChange={setLaunch} contacts={task.remote ? customer.contacts : undefined} currentCp={remote?.brand?.currentCp} companyName={remote?.brand?.name || customer.name} productDescription={remote?.brand?.productDescription} matchedCategory={remote?.brand?.matchedCategory} followupExhibition={remote?.brand?.followupExhibition} previewOnly={task.remote} hasActiveOmniReach={task.remote ? brandHasActiveOmniReach(remote?.brand?.tasks || []) : (!!customer.activeBombId || customer.status === "Bomb Running")}/>
    <ReplyDialog customerId={customer.id} open={sendMessage} onOpenChange={setSendMessage} contacts={task.remote ? customer.contacts : undefined} onSend={task.remote ? async (contactId, channel, content, object, deliveryMode, attachments, cc) => {
      const response = await fetch(`/api/brands/${customer.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, channel, content, object, cc: channel === "Email" ? cc : undefined, taskId: task.id, deliveryMode, attachments }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Send failed");
      const nextResponse = await fetch(`/api/tasks/${task.id}`);
      applyTaskPayload(await nextResponse.json() as TaskPayload);
    } : undefined}/>
    <ChangeCPDialog customerId={customer.id} open={changeCP} onOpenChange={setChangeCP} currentCp={remote?.brand?.currentCp} cps={remote?.cps} onSave={task.remote ? async (currentCpId, evidence, note) => {
      const response = await fetch(`/api/brands/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentCpId, evidence, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Update failed");
      const nextResponse = await fetch(`/api/tasks/${task.id}`);
      applyTaskPayload(await nextResponse.json() as TaskPayload);
    } : undefined}/>
  </main>
  </div>;
}

function CallBrief({ task, contact, completed, onCallOpening, script = null, scriptLoading = false, review }: { task: UnifiedTask; contact: Contact; completed: boolean; onCallOpening: (info?: Partial<QuoDialOpening>) => void; script?: ReturnType<typeof callScriptFromConversations>; scriptLoading?: boolean; review?: CallReviewView }) {
  const dialOptions = dialPhoneOptions(contact, task.contactPhone, devCallPhoneOnClient());
  const cancelled = isCancelledTaskStatus(task.status);
  const failed = task.status === "Failed";
  const actionState = completed && !cancelled && !failed
    ? "completed"
    : cancelled
      ? "cancelled"
      : failed
        ? "failed"
        : "open";
  return <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold tracking-[.14em] text-blue-700">Caller brief</div>
        <h3 className="mt-1 text-base font-bold text-blue-950">{task.summary || "Call this Contact"}</h3>
        <p className="mt-1 text-sm text-blue-900">{contact.name} · {formatDialPhoneSummary(dialOptions)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <CallWithQuoButton
          options={dialOptions}
          state={actionState}
          onCallOpening={(phone) => onCallOpening({ phone })}
        />
      </div>
    </div>
    {(scriptLoading || script || review) && <div className="mt-4 text-sm text-blue-950">
      {scriptLoading ? <p className="text-sm text-blue-800">Loading call script…</p> : script ? (
        <PhoneCallCopy
          script={script}
          bodyClassName="text-sm text-blue-950/85"
          labelClassName="mb-1 text-[11px] font-semibold tracking-wide text-blue-700"
        />
      ) : null}
      {review?.recallRequested ? <p className="mt-3 text-xs font-semibold text-rose-700">Recall requested · Reassigned to Beril</p>
        : review?.status === "Qualified" ? <p className="mt-3 text-xs font-semibold text-emerald-700">Call review completed · qualified</p>
        : review?.status === "Awaiting Review" ? <p className="mt-3 text-xs font-semibold text-amber-800">Connected · awaiting Account Manager review</p>
        : null}
    </div>}
  </section>;
}
