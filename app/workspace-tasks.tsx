/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, CheckCircle2, MessageCircle, Phone, Search, Send, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { BrandActivity, BrandContact, BrandDetail, BrandTask, CurrentCpOption } from "@/lib/brand-list";
import { brandHasActiveOmniReach } from "@/lib/notion/reply-inbox";
import { canSeeTask, dateOnly, isClosedTaskStatus, type Contact, type Customer, type Interaction } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChangeCPDialog, LaunchBombDialog, LaunchOmniReachButton, ReplyDialog, ACTIVE_OMNIREACH_BLOCK_REASON } from "./workspace-customer";
import { InteractionFeed } from "./interaction-feed";
import { PhoneTaskBoard } from "./phone-task-board";
import { Status } from "./workspace-pages";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { devCallPhoneOnClient } from "@/lib/quo/dev-call-phone";
import { taskStatusForCallReview, type CallReviewMetadata, type CallReviewStatus } from "@/lib/call-review-metadata";

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
};

type TaskPayload = {
  task?: BrandTask;
  activities?: BrandActivity[];
  brand?: BrandDetail | null;
  cps?: CurrentCpOption[];
  error?: string;
};

type CallScript = {
  id: string;
  name: string;
  content: string;
  status: string | null;
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
const CallReviewBadge = ({ review }: { review?: CallReviewView }) => review ? <Badge className={review.status === "Qualified" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-rose-100 text-rose-800 hover:bg-rose-100"}>{review.status.toLowerCase()}</Badge> : null;
const isDue = (task: UnifiedTask, now: string) => {
  if (isDone(task)) return false;
  if (task.source === "inbox" && task.status === "Waiting for Reply") return false;
  return dateOnly(task.dueAt) <= dateOnly(now);
};

export function TasksPage({ selectedId }: { selectedId?: string }) {
  const { state } = useWorkspace();
  const router = useRouter();
  const manager = state.currentRole === "Admin";
  const [type, setType] = useState<TaskType | "All">(state.currentRole === "Caller" ? "Call" : "All");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<"Open" | "Completed" | "All">("Open");
  const [query, setQuery] = useState("");
  const [remoteTasks, setRemoteTasks] = useState<UnifiedTask[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);

  useEffect(() => {
    setType(state.currentRole === "Caller" ? "Call" : "All");
    setAssignee("all");
  }, [state.currentRole]);

  const taskOwnerQuery = manager && assignee === "unassigned" ? "?owner=unassigned" : "";
  useEffect(() => {
    let cancelled = false;
    setRemoteLoading(true);
    fetch(`/api/tasks${taskOwnerQuery}`)
      .then(async response => {
        const payload = await response.json() as { tasks?: BrandTask[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load tasks");
        return (payload.tasks || []).map(fromNotionTask);
      })
      .then(items => { if (!cancelled) setRemoteTasks(items); })
      .catch(() => { if (!cancelled) setRemoteTasks([]); })
      .finally(() => { if (!cancelled) setRemoteLoading(false); });
    return () => { cancelled = true; };
  }, [taskOwnerQuery]);

  const allTasks = useMemo<UnifiedTask[]>(() => (remoteTasks ?? []).map(task => taskWithCallReview(task, reviewFromNotion(task))), [remoteTasks]);

  const tasks = useMemo(() => {
    return allTasks.filter(task => {
      const customer = state.customers.find(c => c.id === task.customerId);
      const matchesQuery = !query || customer?.name.toLowerCase().includes(query.toLowerCase()) || (task.brandName || "").toLowerCase().includes(query.toLowerCase()) || task.summary.toLowerCase().includes(query.toLowerCase());
      const matchesScope = task.remote || canSeeTask(state, task.customerId, task.assigneeId);
      const matchesType = type === "All" || task.type === type;
      const matchesAssignee = assignee === "all" || (assignee === "unassigned" ? !task.assigneeId : task.assigneeId === assignee);
      const matchesStatus = status === "All" || status === "Open" && !isDone(task) || status === "Completed" && isDone(task);
      const matchesReplyOpen = !(task.remote && status === "Open" && task.type === "Reply" && task.status !== "Needs Reply" && task.status !== "Waiting for Reply");
      return matchesQuery && matchesScope && matchesType && matchesAssignee && matchesStatus && matchesReplyOpen;
    }).sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      const aDue = isDue(a, state.simulatedDate);
      const bDue = isDue(b, state.simulatedDate);
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
      return a.dueAt.localeCompare(b.dueAt);
    });
  }, [allTasks, state, query, type, assignee, status]);

  const selectedTask = selectedId ? allTasks.find(task => task.id === selectedId) : undefined;

  if (selectedId) {
    if (remoteLoading && !selectedTask) return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading task…</div>;
    if (!selectedTask) return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Task not found</h1><Button variant="link" onClick={() => router.push("/tasks")}>Back to ReplyTask</Button></div></div>;
    return <TaskDetail task={selectedTask}/>;
  }

  return <div className="mx-auto max-w-[1540px]">
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">ReplyTask</h1>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-white p-3 lg:flex-row lg:items-center">
      <div className="relative min-w-56 flex-1 lg:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brand or task…" className="pl-9"/></div>
      {state.currentRole !== "Caller" && <Select value={type} onValueChange={value => setType(value as TaskType | "All")}><SelectTrigger className="w-full lg:w-40"><SelectValue/></SelectTrigger><SelectContent>{["All", "Call", "Reply"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All types" : value}</SelectItem>)}</SelectContent></Select>}
      {manager && <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All FC-Owners</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}
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
      })}</TableBody></Table></div> : <Empty className="py-24"><EmptyHeader><EmptyMedia variant="icon"><CheckCircle2/></EmptyMedia><EmptyTitle>All caught up</EmptyTitle><EmptyDescription>No tasks match these filters.</EmptyDescription></EmptyHeader></Empty>}
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
    whatsapp: item.phone || undefined,
    linkedin: item.linkedin || undefined,
    preferredChannel: item.email ? "Email" : item.linkedin ? "LinkedIn" : "Phone",
    emailValid: item.emailValid,
    phoneValid: item.phoneValid,
  };
}

function TaskDetail({ task }: { task: UnifiedTask }) {
  const { state, can, resolveInbox, assignBrand, reassignCall } = useWorkspace();
  const router = useRouter();
  const [launch, setLaunch] = useState(false);
  const [sendMessage, setSendMessage] = useState(false);
  const [changeCP, setChangeCP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [owners, setOwners] = useState<Array<{id:string;name:string}>>([]);
  const [liveTask, setLiveTask] = useState(task);
  const [quoRefreshingCallId, setQuoRefreshingCallId] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ customer: Customer; contact: Contact; timeline: Interaction[]; ownerName?: string; brand?: BrandDetail; cps?: CurrentCpOption[] } | null>(null);
  const [callScript, setCallScript] = useState<CallScript | null>(null);
  const [callScriptLoading, setCallScriptLoading] = useState(false);
  const applyTaskPayload = (payload: { task?: BrandTask; activities?: BrandActivity[]; brand?: BrandDetail | null; cps?: CurrentCpOption[] }) => {
    if (!payload.task) return;
    const item = payload.task;
    const brandContacts = (payload.brand?.contacts || []).map(toTaskContact);
    const matched = brandContacts.find(entry => entry.id === item.contactId) || brandContacts[0];
    const phone = matched?.phone || item.contactPhone || undefined;
    const contact = matched
      ? { ...matched, phone, phoneValid: matched.phoneValid || !!phone }
      : {
      id: item.contactId || "unknown",
      name: item.contactName || "KeyPerson",
      role: "Other" as const,
      phone,
      preferredChannel: item.channel === "Phone" || item.channel === "Email" || item.channel === "SMS" || item.channel === "WhatsApp" || item.channel === "LinkedIn" ? item.channel : "Email",
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
    const threadInboundCp = new Map<string, NonNullable<BrandActivity["cpAtInteraction"]>>();
    const threadCp = new Map<string, NonNullable<BrandActivity["cpAtInteraction"]>>();
    const taskCp = new Map<string, NonNullable<BrandActivity["cpAtInteraction"]>>();
    const chronological = [...activities].sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || ""));
    for (const activity of chronological) {
      if (!activity.cpAtInteraction) continue;
      if (activity.threadId) {
        if (activity.direction === "Inbound" && !threadInboundCp.has(activity.threadId)) {
          threadInboundCp.set(activity.threadId, activity.cpAtInteraction);
        }
        if (!threadCp.has(activity.threadId)) threadCp.set(activity.threadId, activity.cpAtInteraction);
      }
      if (activity.taskId && !taskCp.has(activity.taskId)) taskCp.set(activity.taskId, activity.cpAtInteraction);
    }
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
      createdAt: activity.createdAt || "",
      outcome: activity.callResult as Interaction["outcome"],
      callResult: activity.callResult || undefined,
      quo: activity.quo || null,
      cp: (activity.threadId ? threadInboundCp.get(activity.threadId) : undefined) || activity.cpAtInteraction || (activity.threadId ? threadCp.get(activity.threadId) : undefined) || (activity.taskId ? taskCp.get(activity.taskId) : undefined) || (activity.quo ? customer.cp : undefined),
      taskId: activity.taskId || undefined,
      threadId: activity.threadId || undefined,
      messageStatus: activity.status || undefined,
      taskStatus: (activity.taskId ? taskById.get(activity.taskId)?.status : undefined) || undefined,
    }));
    setRemote({ customer, contact, timeline, ownerName: item.ownerName || payload.brand?.ownerName || undefined, brand: payload.brand || undefined, cps: payload.cps });
    setLiveTask(fromNotionTask(item));
  };
  useEffect(() => { setLiveTask(task); }, [task]);
  useEffect(() => {
    if (!task.remote) { setRemote(null); return; }
    let cancelled = false;
    fetch(`/api/tasks/${task.id}`)
      .then(async response => {
        const payload = await response.json() as { task?: BrandTask; activities?: BrandActivity[]; brand?: BrandDetail; cps?: CurrentCpOption[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Task not found");
        return payload;
      })
      .then(payload => { if (!cancelled) applyTaskPayload(payload); })
      .catch(() => { if (!cancelled) setRemote(null); });
    return () => { cancelled = true; };
  }, [task.id, task.remote, task.customerId, task.brandName]);
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
    if (state.currentRole !== "Caller" || task.type !== "Call" || !task.remote || !liveTask.templateId) {
      setCallScript(null);
      setCallScriptLoading(false);
      return;
    }
    let cancelled = false;
    setCallScriptLoading(true);
    fetch(`/api/tasks/${task.id}/call-script`)
      .then(async (response) => {
        const payload = await response.json() as { script?: CallScript | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load call scripts");
        return payload.script || null;
      })
      .then((script) => { if (!cancelled) setCallScript(script); })
      .catch(() => { if (!cancelled) setCallScript(null); })
      .finally(() => { if (!cancelled) setCallScriptLoading(false); });
    return () => { cancelled = true; };
  }, [state.currentRole, task.id, task.remote, task.type, liveTask.templateId]);
  useEffect(() => {
    if (!task.remote || task.type !== "Call" || isDone(liveTask)) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/tasks/${task.id}`);
        if (!response.ok) return;
        const payload = await response.json() as TaskPayload;
        if (!cancelled) applyTaskPayload(payload);
      } catch {
        // The Quo webhook may still be processing; the next poll retries safely.
      } finally {
        inFlight = false;
      }
    };
    const interval = window.setInterval(() => { void poll(); }, 10000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [task.id, task.remote, task.type, liveTask.status]);
  const localCustomer = state.customers.find(c => c.id === task.customerId);
  const customer = localCustomer || remote?.customer;
  const partnershipContext=customer?.partnershipContext;
  const contact = localCustomer?.contacts.find(c => c.id === task.contactId) || localCustomer?.contacts[0] || remote?.contact;
  const callTask = liveTask.source === "call" ? state.callTasks.find(call => call.id === liveTask.id) : undefined;
  const taskReview = reviewFromNotion(liveTask);
  const reviewedTask = taskWithCallReview(liveTask, taskReview);
  const persistCallReview = async (taskId: string, status: CallReviewStatus) => {
    const response = await fetch(`/api/tasks/${taskId}/call-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json() as TaskPayload;
    if (!response.ok) throw new Error(payload.error || "Unable to save call review");
    applyTaskPayload(await fetch(`/api/tasks/${task.id}`).then(item => item.json()) as TaskPayload);
  };
  const baseTimeline = remote?.timeline || state.interactions.filter(item => item.customerId === task.customerId).map(item => ({ ...item, cp: item.cp || customer?.cp }));
  const timeline = [...baseTimeline].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const refreshQuo = async (callId: string) => {
    if (!task.remote || quoRefreshingCallId) return;
    setQuoRefreshingCallId(callId);
    try {
      const response = await fetch(`/api/tasks/${task.id}/quo?callId=${encodeURIComponent(callId)}`);
      const payload = await response.json() as { data?: import("@/lib/quo/types").QuoCallData | null; errors?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to refresh Quo data");
      const next = await fetch(`/api/tasks/${task.id}`);
      applyTaskPayload(await next.json() as TaskPayload);
      if (payload.errors?.length) toast.warning(`Quo refresh completed with ${payload.errors.length} unavailable section${payload.errors.length === 1 ? "" : "s"}`);
      else toast.success("Quo data refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to refresh Quo data");
    } finally {
      setQuoRefreshingCallId(null);
    }
  };
  if (task.remote && !customer) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Loading task…</main>;
  if (!customer || !contact) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Brand context unavailable.</main>;
  const humanAssignees = state.users.filter(user => user.role === "AccountManager" || user.role === "Admin");
  const callers = state.users.filter(user => user.role === "Caller");
  const callerPhoneOnly = state.currentRole === "Caller";
  const canReviewCalls = task.remote && !callerPhoneOnly && can("reply");
  const reviewTasks = [
    ...(remote?.brand?.tasks || []),
    ...(liveTask.callReviewStatus || liveTask.type === "Call" ? [{ id: liveTask.id, callReviewStatus: liveTask.callReviewStatus }] : []),
  ];
  const onCallOpening = () => {
    if (!task.remote) return;
    void fetch(`/api/tasks/${task.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quo-attempt" }),
      keepalive: true,
    }).catch(() => undefined);
  };
  const callBrief = reviewedTask.type === "Call" && !callerPhoneOnly
    ? <CallBrief script={callScript} scriptLoading={callScriptLoading} task={reviewedTask} contact={contact} completed={isDone(reviewedTask)} review={taskReview} onCallOpening={onCallOpening} />
    : null;

  return <div className="mx-auto max-w-[1540px]">
    <button onClick={() => router.push("/tasks")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>ReplyTask</button>
    <main className="min-w-0 overflow-hidden rounded-2xl bg-white">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 lg:px-7">
      <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{reviewedTask.type}</Badge>{isDue(reviewedTask, state.simulatedDate) ? <Status value="Due"/> : <Badge variant="secondary">{reviewedTask.status}</Badge>}<CallReviewBadge review={taskReview}/><span className="text-xs text-slate-400">{dateOnly(reviewedTask.dueAt)}</span></div><h2 className="mt-2 text-xl font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{contact.name} · {contact.role} · {customer.cp} · {customer.status}{callerPhoneOnly && <> · Account Manager: {remote?.ownerName || state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</>}</p></div>
      {state.currentRole !== "Caller" && <Button variant="outline" size="sm" disabled={!customer.id} onClick={() => router.push(`/customers/${encodeURIComponent(customer.id)}`)}>Brand profile</Button>}
    </header>

    <div className={callerPhoneOnly ? "grid" : "grid lg:grid-cols-[minmax(0,1fr)_290px]"}>
      <div className="min-w-0 p-5 lg:p-7">
        {callerPhoneOnly && reviewedTask.type === "Call" ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <PhoneTaskBoard
            activeTaskId={liveTask.id}
            headerContactName={contact.name}
            contacts={customer.contacts}
            phoneTasks={(() => {
              const contactId = liveTask.contactId || contact.id;
              const fromBrand = (remote?.brand?.tasks || [])
                .filter((item) => item.channel === "Phone" && (!contactId || !item.contactId || item.contactId === contactId))
                .map((item) => ({
                  id: item.id,
                  title: item.title,
                  status: item.status || "Pending",
                  dueAt: item.scheduledAt,
                  contactId: item.contactId,
                  contactPhone: item.contactPhone,
                  templateId: item.templateId,
                  callReviewStatus: item.callReviewStatus,
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
                callReviewStatus: liveTask.callReviewStatus,
                remote: true,
              };
              return fromBrand.some((item) => item.id === liveTask.id) ? fromBrand : [mappedLive, ...fromBrand];
            })()}
            timeline={timeline}
            activeScript={callScript}
            activeScriptLoading={callScriptLoading}
            quoRefreshingCallId={quoRefreshingCallId}
            onRefreshQuo={task.remote ? refreshQuo : undefined}
            onSelectTask={(taskId) => router.push(`/tasks/${encodeURIComponent(taskId)}`)}
            showDial
          />
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
                initialCp={undefined}
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
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">FC-Owner</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4"/>{remote?.ownerName || state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</div></div>

        {callTask && can("manageCalls") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={callTask.callerId} onValueChange={value => show(reassignCall(callTask.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent>{callers.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.remote && task.type === "Call" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={task.assigneeId || "unassigned"} onValueChange={value => { void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json() as TaskPayload; if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(payload); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{owners.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.source === "inbox" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign FC-Owner</label><Select value={task.assigneeId || customer.ownerId || "unassigned"} onValueChange={value => { if (!task.remote) { show(assignBrand(customer.id, value)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/brands/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(await fetch(`/api/tasks/${task.id}`).then(item => item.json())); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{(task.remote ? owners : humanAssignees).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}

        {task.source === "inbox" && <div className="mt-5 grid gap-2">
          {can("reply") && <Button variant="outline" className="justify-start" onClick={() => setSendMessage(true)}><Send className="mr-2 size-4"/>Send message</Button>}
          {can("launch") && <LaunchOmniReachButton className="justify-start w-full" disabled={task.remote ? brandHasActiveOmniReach(remote?.brand?.tasks || []) : (!!customer.activeBombId || customer.status === "Bomb Running")} disabledReason={ACTIVE_OMNIREACH_BLOCK_REASON} onClick={() => setLaunch(true)} />}
          {can("changeCP") && <Button variant="outline" className="justify-start" onClick={() => setChangeCP(true)}><Check className="mr-2 size-4"/>Change CP</Button>}
          {can("reply") && !isDone(liveTask) && <Button variant="outline" className="justify-start" disabled={saving} onClick={() => { if (!task.remote) { show(resolveInbox(task.id)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Completed" }) }); const payload = await response.json() as TaskPayload; if (!response.ok) throw new Error(payload.error || "Update failed"); applyTaskPayload(payload); toast.success("Task completed"); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); } finally { setSaving(false); } })(); }}><CheckCircle2 className="mr-2 size-4"/>End task</Button>}
        </div>}
      </aside>}
    </div>

    <LaunchBombDialog customerId={customer.id} open={launch} onOpenChange={setLaunch} contacts={task.remote ? customer.contacts : undefined} currentCp={remote?.brand?.currentCp} companyName={remote?.brand?.name || customer.name} productDescription={remote?.brand?.productDescription} matchedCategory={remote?.brand?.matchedCategory} followupExhibition={remote?.brand?.followupExhibition} previewOnly={task.remote} hasActiveOmniReach={task.remote ? brandHasActiveOmniReach(remote?.brand?.tasks || []) : (!!customer.activeBombId || customer.status === "Bomb Running")}/>
    <ReplyDialog customerId={customer.id} open={sendMessage} onOpenChange={setSendMessage} contacts={task.remote ? customer.contacts : undefined} onSend={task.remote ? async (contactId, channel, content, object) => {
      const response = await fetch(`/api/brands/${customer.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, channel, content, object, taskId: task.id }) });
      const payload = await response.json() as { brand?: BrandDetail; error?: string };
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

function CallBrief({ task, contact, completed, onCallOpening, script = null, scriptLoading = false, review }: { task: UnifiedTask; contact: Contact; completed: boolean; onCallOpening: () => void; script?: CallScript | null; scriptLoading?: boolean; review?: CallReviewView }) {
  const phone = (devCallPhoneOnClient() || contact.phone || task.contactPhone || "").trim();
  return <section className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold tracking-[.14em] text-blue-700">Caller brief</div>
        <h3 className="mt-1 text-base font-bold text-blue-950">{task.summary || "Call this Contact"}</h3>
        <p className="mt-1 text-sm text-blue-900">{contact.name} · {phone || "No phone number"}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{completed ? <Button disabled className="bg-emerald-600 text-white hover:bg-emerald-600"><CheckCircle2 className="mr-2 size-4"/>Call completed</Button> : phone ? <Button asChild><a href={`openphone://dial?number=${encodeURIComponent(phone)}&action=call`} onClick={onCallOpening}><Phone className="mr-2 size-4"/>Call with Quo</a></Button> : <Button disabled><Phone className="mr-2 size-4"/>Call with Quo</Button>}</div>
    </div>
    {(scriptLoading || script || review) && <div className="mt-4 text-sm text-blue-950">
      {scriptLoading ? <p className="text-sm text-blue-800">Loading call script…</p> : script ? <div><div className="flex flex-wrap items-center gap-2 font-semibold"><span>{script.name}</span>{script.status && <Badge variant="outline" className="border-blue-200 bg-white/60 text-[10px] text-blue-800">{script.status}</Badge>}</div><p className="mt-1 whitespace-pre-wrap leading-6 text-blue-950/85">{script.content || "No content template configured."}</p></div> : null}
      {review?.recallRequested ? <p className="mt-3 text-xs font-semibold text-rose-700">Recall requested · Reassigned to Beril</p> : review?.status === "Qualified" ? <p className="mt-3 text-xs font-semibold text-emerald-700">Call review completed · qualified</p> : null}
    </div>}
  </section>;
}

