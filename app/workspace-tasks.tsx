/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bomb, Check, CheckCircle2, MessageCircle, Phone, Search, Send, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import type { BrandActivity, BrandContact, BrandDetail, BrandTask, CurrentCpOption } from "@/lib/brand-list";
import { CallOutcome, canSeeTask, dateOnly, isClosedTaskStatus, type Contact, type Customer, type Interaction } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChangeCPDialog, LaunchBombDialog, ReplyDialog } from "./workspace-customer";
import { InteractionFeed } from "./interaction-feed";
import { Status } from "./workspace-pages";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  brandName?: string;
  remote?: boolean;
};

function asPriority(value?: string | null): UnifiedTask["priority"] {
  if (value === "P0" || value === "Urgent") return "Urgent";
  if (value === "P1" || value === "High") return "High";
  if (value === "P2" || value === "Low") return "Low";
  return "Normal";
}

function fromNotionTask(task: BrandTask): UnifiedTask {
  return {
    id: task.id,
    source: task.channel === "Phone" ? "call" : "inbox",
    type: task.channel === "Phone" ? "Call" : "Reply",
    customerId: task.brandId || "",
    contactId: task.contactId || undefined,
    assigneeId: task.ownerId || undefined,
    dueAt: task.scheduledAt || "",
    status: task.status || "Pending",
    priority: asPriority(task.priority),
    summary: task.title,
    brandName: task.brandName || undefined,
    remote: true,
  };
}

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);
const priorityRank: Record<UnifiedTask["priority"], number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const isDone = (task: UnifiedTask) => isClosedTaskStatus(task.status);
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

  useEffect(() => {
    let cancelled = false;
    setRemoteLoading(true);
    fetch("/api/tasks")
      .then(async response => {
        const payload = await response.json() as { tasks?: BrandTask[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Failed to load tasks");
        return (payload.tasks || []).map(fromNotionTask);
      })
      .then(items => { if (!cancelled) setRemoteTasks(items); })
      .catch(() => { if (!cancelled) setRemoteTasks([]); })
      .finally(() => { if (!cancelled) setRemoteLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const allTasks = useMemo<UnifiedTask[]>(() => {
    if (remoteTasks) return remoteTasks;
    const calls: UnifiedTask[] = state.callTasks.map(task => ({
      id: task.id,
      source: "call",
      type: "Call",
      customerId: task.customerId,
      contactId: task.contactId,
      assigneeId: task.callerId,
      dueAt: task.scheduledDate,
      status: task.status,
      priority: task.priority,
      summary: task.goal,
    }));
    const human: UnifiedTask[] = state.inbox.map(item => {
      const followUp = state.followUps.find(f => f.inboxItemId === item.id && f.status !== "Cancelled");
      return {
        id: item.id,
        source: "inbox",
        type: "Reply",
        customerId: item.customerId,
        contactId: item.contactId,
        assigneeId: item.ownerId,
        dueAt: followUp?.dueAt || item.updatedAt,
        status: item.status,
        priority: item.status === "Needs Reply" || followUp?.status === "Due" ? "High" : item.status === "Waiting for Reply" ? "Low" : "Normal",
        summary: followUp?.reason || item.preview,
      };
    });
    return [...calls, ...human];
  }, [remoteTasks, state.callTasks, state.inbox, state.followUps]);

  const tasks = useMemo(() => {
    return allTasks.filter(task => {
      const customer = state.customers.find(c => c.id === task.customerId);
      const matchesQuery = !query || customer?.name.toLowerCase().includes(query.toLowerCase()) || (task.brandName || "").toLowerCase().includes(query.toLowerCase()) || task.summary.toLowerCase().includes(query.toLowerCase());
      const matchesScope = task.remote || canSeeTask(state, task.customerId, task.assigneeId);
      const matchesType = type === "All" || task.type === type;
      const matchesAssignee = assignee === "all" || assignee === "unassigned" && !task.assigneeId || task.assigneeId === assignee;
      const matchesStatus = status === "All" || status === "Open" && !isDone(task) || status === "Completed" && isDone(task);
      return matchesQuery && matchesScope && matchesType && matchesAssignee && matchesStatus;
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
      <Select value={type} onValueChange={value => setType(value as TaskType | "All")}><SelectTrigger className="w-full lg:w-40"><SelectValue/></SelectTrigger><SelectContent>{["All", "Call", "Reply"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All types" : value}</SelectItem>)}</SelectContent></Select>
      {manager && <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All FC-Owners</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}
      <Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger className="w-full lg:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="All">All statuses</SelectItem></SelectContent></Select>
    </div>

    <div className="overflow-hidden rounded-2xl bg-white">
      {tasks.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="min-w-56 pl-5">Brand</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => {
        const customer = state.customers.find(c => c.id === task.customerId);
        const overdue = isDue(task, state.simulatedDate);
        const Icon = task.type === "Call" ? Phone : MessageCircle;
        return <TableRow key={task.id} className={`cursor-pointer ${overdue ? "bg-amber-50/80 hover:bg-amber-50" : "hover:bg-violet-50/30"}`} onClick={() => router.push(`/tasks/${task.id}`)}>
          <TableCell className="pl-5"><div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${task.type === "Call" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}><Icon className="size-4"/></span><div className="text-sm font-semibold">{customer?.name || task.brandName || "Unknown brand"}</div></div></TableCell>
          <TableCell><Badge variant="secondary" className="text-[10px]">{task.type}</Badge></TableCell>
          <TableCell>{overdue ? <Status value="Due"/> : <Status value={task.status}/>}</TableCell>
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
  const [callResult, setCallResult] = useState(false);
  const [launch, setLaunch] = useState(false);
  const [sendMessage, setSendMessage] = useState(false);
  const [changeCP, setChangeCP] = useState(false);
  const [saving, setSaving] = useState(false);
  const [owners, setOwners] = useState<Array<{id:string;name:string}>>([]);
  const [liveTask, setLiveTask] = useState(task);
  const [remote, setRemote] = useState<{ customer: Customer; contact: Contact; timeline: Interaction[]; ownerName?: string; brand?: BrandDetail; cps?: CurrentCpOption[] } | null>(null);
  const applyTaskPayload = (payload: { task?: BrandTask; activities?: BrandActivity[]; brand?: BrandDetail | null; cps?: CurrentCpOption[] }) => {
    if (!payload.task) return;
    const item = payload.task;
    const brandContacts = (payload.brand?.contacts || []).map(toTaskContact);
    const contact = brandContacts.find(entry => entry.id === item.contactId) || brandContacts[0] || {
      id: item.contactId || "unknown",
      name: item.contactName || "KeyPerson",
      role: "Other" as const,
      preferredChannel: item.channel === "Phone" || item.channel === "Email" || item.channel === "SMS" || item.channel === "WhatsApp" || item.channel === "LinkedIn" ? item.channel : "Email",
      emailValid: false,
      phoneValid: false,
    };
    const customer: Customer = {
      id: item.brandId || payload.brand?.id || task.customerId,
      name: payload.brand?.name || item.brandName || task.brandName || "Untitled brand",
      initials: payload.brand?.initials || (item.brandName || "BR").slice(0, 2).toUpperCase(),
      cp: payload.brand?.currentCp === "CP2" || payload.brand?.currentCp === "CP3" ? payload.brand.currentCp : "CP1",
      status: (payload.brand?.status || "Ready") as Customer["status"],
      source: "Follow-up ClientDB",
      ownerId: payload.brand?.ownerId || item.brandOwnerId || undefined,
      contacts: brandContacts.length ? brandContacts : [contact],
      createdAt: payload.brand?.createdAt || "",
      updatedAt: payload.brand?.lastEditedAt || "",
    };
    const timeline: Interaction[] = (payload.activities || []).map(activity => ({
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
  const localCustomer = state.customers.find(c => c.id === task.customerId);
  const customer = localCustomer || remote?.customer;
  const partnershipContext=customer?.partnershipContext;
  const contact = localCustomer?.contacts.find(c => c.id === task.contactId) || localCustomer?.contacts[0] || remote?.contact;
  const callTask = liveTask.source === "call" ? state.callTasks.find(call => call.id === liveTask.id) : undefined;
  const timeline = (remote?.timeline || state.interactions.filter(item => item.customerId === task.customerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (task.remote && !customer) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Loading task…</main>;
  if (!customer || !contact) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Brand context unavailable.</main>;
  const humanAssignees = state.users.filter(user => user.role === "FC_Owner" || user.role === "Admin");
  const callers = state.users.filter(user => user.role === "Caller");

  return <div className="mx-auto max-w-[1540px]">
    <button onClick={() => router.push("/tasks")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>ReplyTask</button>
    <main className="min-w-0 overflow-hidden rounded-2xl bg-slate-50">
    <header className="flex flex-wrap items-start justify-between gap-4 bg-white px-5 py-4 lg:px-7">
      <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{liveTask.type}</Badge>{isDue(liveTask, state.simulatedDate) ? <Status value="Due"/> : <Badge variant="secondary">{liveTask.status}</Badge>}<span className="text-xs text-slate-400">{dateOnly(liveTask.dueAt)}</span></div><h2 className="mt-2 text-xl font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{contact.name} · {contact.role} · {customer.cp} · {customer.status}</p></div>
      <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${customer.id}`)}>Brand profile</Button>
    </header>

    <div className="grid lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 p-5 lg:p-7">
        <section>
          <h3 className="mb-3 font-bold">Brand activity</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <InteractionFeed key={`${customer.id}-${customer.cp}`} customerId={customer.id} interactions={timeline} contacts={customer.contacts} maxHeight="max-h-[480px]"/>
          </div>
        </section>

      </div>

      <aside className="bg-white p-5 lg:pl-0">
        <div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{customer.initials}</AvatarFallback></Avatar><div><b className="text-sm">{customer.name}</b><div className="text-xs text-slate-500">{state.cps.find(cp => cp.code === customer.cp)?.goal}</div></div></div>
        {(customer.cp === "CP3" || partnershipContext) && partnershipContext && <section className="mt-5 rounded-xl bg-emerald-50 p-4"><div className="text-[11px] font-semibold tracking-wide text-emerald-700">CP3 · Partnership context</div><div className="mt-2 text-sm font-bold text-emerald-950">{partnershipContext.headline}</div><p className="mt-2 text-xs leading-5 text-emerald-900">{partnershipContext.summary}</p><div className="mt-3 space-y-2">{partnershipContext.signals.map(signal=><div key={signal} className="rounded-lg bg-white/70 px-2.5 py-2 text-xs leading-5 text-slate-700">{signal}</div>)}</div></section>}
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">FC-Owner</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4"/>{remote?.ownerName || state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</div></div>

        {((callTask && can("submitCall") && callTask.status === "Scheduled") || (liveTask.remote && liveTask.type === "Call" && !isDone(liveTask))) && <Button className="mt-4 w-full" disabled={saving} onClick={() => setCallResult(true)}><Phone className="mr-2 size-4"/>Complete call</Button>}
        {callTask && can("manageCalls") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={callTask.callerId} onValueChange={value => show(reassignCall(callTask.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent>{callers.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.remote && task.type === "Call" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={task.assigneeId || "unassigned"} onValueChange={value => { void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(payload); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{owners.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.source === "inbox" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign FC-Owner</label><Select value={task.assigneeId || customer.ownerId || "unassigned"} onValueChange={value => { if (!task.remote) { show(assignBrand(customer.id, value)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/brands/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId: value === "unassigned" ? null : value }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "Assign failed"); applyTaskPayload(await fetch(`/api/tasks/${task.id}`).then(item => item.json())); toast.success("Owner assigned"); } catch (error) { toast.error(error instanceof Error ? error.message : "Assign failed"); } finally { setSaving(false); } })(); }}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{(task.remote ? owners : humanAssignees).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}

        {task.source === "inbox" && <div className="mt-5 grid gap-2">
          {can("reply") && <Button variant="outline" className="justify-start" onClick={() => setSendMessage(true)}><Send className="mr-2 size-4"/>Send message</Button>}
          {can("launch") && <Button variant="outline" className="justify-start" disabled={!task.remote && (!!customer.activeBombId || customer.status === "Bomb Running")} onClick={() => setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}
          {can("changeCP") && <Button variant="outline" className="justify-start" onClick={() => setChangeCP(true)}><Check className="mr-2 size-4"/>Change CP</Button>}
          {can("reply") && !isDone(liveTask) && <Button variant="outline" className="justify-start" disabled={saving} onClick={() => { if (!task.remote) { show(resolveInbox(task.id)); return; } void (async () => { setSaving(true); try { const response = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Completed" }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Update failed"); applyTaskPayload(payload); toast.success("Task completed"); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); } finally { setSaving(false); } })(); }}><CheckCircle2 className="mr-2 size-4"/>End task</Button>}
        </div>}
      </aside>
    </div>

    {(callTask || (task.remote && task.type === "Call")) && <CallResultDialog taskId={task.id} open={callResult} onOpenChange={setCallResult} onSubmit={task.remote ? async (outcome, summary) => {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete-call", outcome, summary }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Complete call failed");
      applyTaskPayload(payload);
    } : undefined}/>} 
    <LaunchBombDialog customerId={customer.id} open={launch} onOpenChange={setLaunch} contacts={task.remote ? customer.contacts : undefined} currentCp={remote?.brand?.currentCp} previewOnly={task.remote}/>
    <ReplyDialog customerId={customer.id} open={sendMessage} onOpenChange={setSendMessage} contacts={task.remote ? customer.contacts : undefined} onSend={task.remote ? async (contactId, channel, content) => {
      const response = await fetch(`/api/brands/${customer.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, channel, content, taskId: task.id }) });
      const payload = await response.json() as { brand?: BrandDetail; error?: string };
      if (!response.ok) throw new Error(payload.error || "Send failed");
      const next = await fetch(`/api/tasks/${task.id}`).then(item => item.json());
      applyTaskPayload(next);
    } : undefined}/>
    <ChangeCPDialog customerId={customer.id} open={changeCP} onOpenChange={setChangeCP} currentCp={remote?.brand?.currentCp} cps={remote?.cps} onSave={task.remote ? async (currentCpId, evidence, note) => {
      const response = await fetch(`/api/brands/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentCpId, evidence, note }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Update failed");
      applyTaskPayload(await fetch(`/api/tasks/${task.id}`).then(item => item.json()));
    } : undefined}/>
  </main>
  </div>;
}

function CallResultDialog({ taskId, open, onOpenChange, onSubmit }: { taskId: string; open: boolean; onOpenChange: (value: boolean) => void; onSubmit?: (outcome: CallOutcome, summary: string) => Promise<void> }) {
  const { submitCallResult } = useWorkspace();
  const [outcome, setOutcome] = useState<CallOutcome>("No Answer");
  const [summary, setSummary] = useState("");
  const [recording, setRecording] = useState<"Attached" | "Upload manually" | "Unavailable">("Attached");
  const [callback, setCallback] = useState("");
  const [saving, setSaving] = useState(false);
  const requiresSummary = outcome === "Contact Responded" || outcome === "Connected — No Useful Response" || outcome === "Call Back Requested";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Complete call task</DialogTitle><DialogDescription>The call record is saved before the workflow moves forward.</DialogDescription></DialogHeader><Select value={outcome} onValueChange={value => setOutcome(value as CallOutcome)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Contact Responded", "Connected — No Useful Response", "No Answer", "Voicemail", "Call Back Requested", "Wrong Number", "Wrong Contact", "Other"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>{requiresSummary && <Textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Full call notes or transcript (required)"/>}{outcome === "Call Back Requested" && <Input type="date" value={callback} onChange={event => setCallback(event.target.value)}/>}<Select value={recording} onValueChange={value => setRecording(value as typeof recording)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Attached", "Upload manually", "Unavailable"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">If the correct contact answers, the call is recorded, the Bomb stops, and a Reply Task is created for a FC_Owner. No Answer and Voicemail let the Bomb continue.</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={saving || (requiresSummary && !summary.trim())} onClick={() => { void (async () => { if (onSubmit) { setSaving(true); try { await onSubmit(outcome, summary); toast.success("Call result saved"); onOpenChange(false); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); } finally { setSaving(false); } return; } const result = submitCallResult(taskId, outcome, summary, callback ? `${callback}T09:00:00.000Z` : undefined, recording); show(result); if (result.ok) onOpenChange(false); })(); }}>Submit result</Button></DialogFooter></DialogContent></Dialog>;
}
