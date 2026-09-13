/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bomb, CalendarClock, Check, CheckCircle2, MessageCircle,
  Phone, Search, Send, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { CallOutcome, Channel, dateOnly } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChangeCPDialog, CreateCallDialog, FollowUpDialog, LaunchBombDialog } from "./workspace-customer";
import { InteractionFeed } from "./interaction-feed";

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
};

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);
const priorityRank: Record<UnifiedTask["priority"], number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const isDone = (task: UnifiedTask) => ["Completed", "Resolved", "Cancelled"].includes(task.status);

export function TasksPage({ selectedId }: { selectedId?: string }) {
  const { state } = useWorkspace();
  const router = useRouter();
  const manager = state.currentRole === "Admin" || state.currentRole === "Outreach Manager";
  const [view, setView] = useState<"Mine" | "All">(manager ? "All" : "Mine");
  const [type, setType] = useState<TaskType | "All">(state.currentRole === "Caller" ? "Call" : "All");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<"Open" | "Completed" | "All">("Open");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(selectedId);

  useEffect(() => {
    const isManager = state.currentRole === "Admin" || state.currentRole === "Outreach Manager";
    setView(isManager ? "All" : "Mine");
    setType(state.currentRole === "Caller" ? "Call" : "All");
    setAssignee("all");
    setActive(undefined);
  }, [state.currentRole]);

  const allTasks = useMemo<UnifiedTask[]>(() => {
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
        priority: item.status === "Needs Reply" || followUp?.status === "Due" ? "High" : item.status === "Waiting for Contact" ? "Low" : "Normal",
        summary: followUp?.reason || item.preview,
      };
    });
    return [...calls, ...human];
  }, [state.callTasks, state.inbox, state.followUps]);

  const tasks = useMemo(() => {
    return allTasks.filter(task => {
      const customer = state.customers.find(c => c.id === task.customerId);
      const matchesQuery = !query || customer?.name.toLowerCase().includes(query.toLowerCase()) || task.summary.toLowerCase().includes(query.toLowerCase());
      const matchesView = view === "All" || task.assigneeId === state.currentUserId;
      const matchesType = type === "All" || task.type === type;
      const matchesAssignee = assignee === "all" || assignee === "unassigned" && !task.assigneeId || task.assigneeId === assignee;
      const matchesStatus = status === "All" || status === "Open" && !isDone(task) || status === "Completed" && isDone(task);
      return matchesQuery && matchesView && matchesType && matchesAssignee && matchesStatus;
    }).sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
      return a.dueAt.localeCompare(b.dueAt);
    });
  }, [allTasks, state.customers, state.currentUserId, query, view, type, assignee, status]);

  useEffect(() => {
    if (selectedId) setActive(selectedId);
    else if (!active || !tasks.some(task => task.id === active)) setActive(tasks[0]?.id);
  }, [selectedId, active, tasks]);

  const selectedTask = allTasks.find(task => task.id === active);
  const mineCount = allTasks.filter(task => !isDone(task) && task.assigneeId === state.currentUserId).length;

  return <div className="mx-auto max-w-[1540px]">
    <div className="mb-5">
      <div className="text-xs font-semibold uppercase tracking-[.14em] text-violet-600">One queue for every human action</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Tasks</h1>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-white p-3 lg:flex-row lg:items-center">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {(["Mine", "All"] as const).map(option => <button key={option} onClick={() => setView(option)} className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${view === option ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>{option === "Mine" ? `My Tasks (${mineCount})` : "All Tasks"}</button>)}
      </div>
      <div className="relative min-w-56 flex-1 lg:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brand or task…" className="pl-9"/></div>
      <Select value={type} onValueChange={value => setType(value as TaskType | "All")}><SelectTrigger className="w-full lg:w-40"><SelectValue/></SelectTrigger><SelectContent>{["All", "Call", "Reply"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All types" : value}</SelectItem>)}</SelectContent></Select>
      {manager && <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All assignees</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}
      <Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger className="w-full lg:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="All">All statuses</SelectItem></SelectContent></Select>
    </div>

    <div className="grid min-h-[680px] overflow-hidden rounded-2xl border bg-white lg:grid-cols-[370px_1fr]">
      <aside className="max-h-[680px] overflow-y-auto border-r">
        {tasks.length ? <div className="divide-y">{tasks.map(task => {
          const customer = state.customers.find(c => c.id === task.customerId);
          const assigneeName = state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned";
          const Icon = task.type === "Call" ? Phone : MessageCircle;
          return <button key={task.id} onClick={() => { setActive(task.id); router.push(`/tasks/${task.id}`); }} className={`w-full p-4 text-left transition ${active === task.id ? "bg-violet-50" : "hover:bg-slate-50"}`}>
            <div className="flex items-start gap-3"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${task.type === "Call" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}><Icon className="size-4"/></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><b className="truncate text-sm">{customer?.name}</b><Badge variant={task.priority === "Urgent" ? "destructive" : "secondary"} className="text-[10px]">{task.type}</Badge></span><span className="mt-1 block truncate text-xs text-slate-600">{task.summary}</span><span className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><span>{dateOnly(task.dueAt)}</span><span>{assigneeName}</span></span></span></div>
          </button>;
        })}</div> : <Empty className="py-24"><EmptyHeader><EmptyMedia variant="icon"><CheckCircle2/></EmptyMedia><EmptyTitle>All caught up</EmptyTitle><EmptyDescription>No tasks match these filters.</EmptyDescription></EmptyHeader></Empty>}
      </aside>
      {selectedTask ? <TaskDetail task={selectedTask}/> : <main className="grid place-items-center bg-slate-50"><div className="text-center text-slate-500"><CheckCircle2 className="mx-auto mb-3 size-9"/><p className="font-semibold">No task selected</p><p className="mt-1 text-xs">Choose a task from the queue.</p></div></main>}
    </div>
  </div>;
}

function TaskDetail({ task }: { task: UnifiedTask }) {
  const { state, can, sendHumanReply, resolveInbox, assignBrand, reassignCall } = useWorkspace();
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("Email");
  const [message, setMessage] = useState("");
  const [callResult, setCallResult] = useState(false);
  const [follow, setFollow] = useState(false);
  const [createCall, setCreateCall] = useState(false);
  const [launch, setLaunch] = useState(false);
  const [changeCP, setChangeCP] = useState(false);
  const customer = state.customers.find(c => c.id === task.customerId);
  const contact = customer?.contacts.find(c => c.id === task.contactId) || customer?.contacts[0];
  const callTask = task.source === "call" ? state.callTasks.find(call => call.id === task.id) : undefined;
  const timeline = state.interactions.filter(item => item.customerId === task.customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!customer || !contact) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Brand context unavailable.</main>;
  const available = (["Email", "SMS", "WhatsApp", "LinkedIn"] as Channel[]).filter(value => value === "Email" ? contact.email && contact.emailValid : value === "SMS" ? contact.phone && contact.phoneValid : value === "WhatsApp" ? contact.whatsapp : contact.linkedin);
  const effectiveChannel = available.includes(channel) ? channel : available[0];
  const humanAssignees = state.users.filter(user => user.role === "Human Responder" || user.role === "Outreach Manager");
  const callers = state.users.filter(user => user.role === "Caller");

  return <main className="min-w-0 bg-slate-50">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b bg-white px-5 py-4 lg:px-7">
      <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{task.type}</Badge><Badge variant="secondary">{task.status}</Badge><span className="text-xs text-slate-400">Due {dateOnly(task.dueAt)}</span></div><h2 className="mt-2 text-xl font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{contact.name} · {contact.role} · {customer.cp} · {customer.status}</p></div>
      <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${customer.id}`)}>Brand profile</Button>
    </header>

    <div className="grid lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 p-5 lg:p-7">
        {callTask && <div className="mb-5 grid gap-3 md:grid-cols-2"><section className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Call goal</div><p className="mt-2 text-sm leading-6">{callTask.goal}</p></section><section className="rounded-xl bg-slate-950 p-4 text-white"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested script</div><p className="mt-2 text-sm leading-6 text-slate-200">{callTask.script}</p></section></div>}

        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-5 py-4"><h3 className="font-bold">Conversation & activity</h3><p className="mt-1 text-xs text-slate-500">Every Contact, channel and complete exchange in one timeline.</p></div>
          <InteractionFeed interactions={timeline} contacts={customer.contacts} maxHeight="max-h-[480px]"/>
        </section>

        {task.source === "inbox" && can("reply") && task.status !== "Resolved" && <section className="mt-4 rounded-xl border bg-white p-4"><div className="mb-2 flex items-center justify-between gap-3"><Select value={effectiveChannel} onValueChange={value => setChannel(value as Channel)}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Channel"/></SelectTrigger><SelectContent>{available.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><span className="text-xs text-slate-400">Reply to {contact.name}</span></div><div className="flex gap-2"><Textarea value={message} onChange={event => setMessage(event.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…"/><Button className="h-20 px-5" disabled={!message.trim() || !effectiveChannel} onClick={() => { const result = sendHumanReply(customer.id, contact.id, effectiveChannel, message); show(result); if (result.ok) setMessage(""); }}><Send className="size-4"/></Button></div></section>}
      </div>

      <aside className="border-t bg-white p-5 lg:border-l lg:border-t-0">
        <div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{customer.initials}</AvatarFallback></Avatar><div><b className="text-sm">{customer.name}</b><div className="text-xs text-slate-500">{state.cps.find(cp => cp.code === customer.cp)?.goal}</div></div></div>
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Task owner</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4"/>{state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</div></div>

        {callTask && can("submitCall") && callTask.status === "Scheduled" && <Button className="mt-4 w-full" onClick={() => setCallResult(true)}><Phone className="mr-2 size-4"/>Complete call</Button>}
        {callTask && can("manageCalls") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={callTask.callerId} onValueChange={value => show(reassignCall(callTask.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent>{callers.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.source === "inbox" && can("editBrand") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign responder</label><Select value={task.assigneeId || "unassigned"} onValueChange={value => show(assignBrand(customer.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{humanAssignees.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}

        {task.source === "inbox" && <div className="mt-5 grid gap-2">
          {can("reply") && <Button variant="outline" className="justify-start" onClick={() => setFollow(true)}><CalendarClock className="mr-2 size-4"/>Schedule follow-up</Button>}
          {can("createCall") && <Button variant="outline" className="justify-start" onClick={() => setCreateCall(true)}><Phone className="mr-2 size-4"/>Create call task</Button>}
          {can("launch") && <Button variant="outline" className="justify-start" onClick={() => setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}
          {can("changeCP") && <Button variant="outline" className="justify-start" onClick={() => setChangeCP(true)}><Check className="mr-2 size-4"/>Change CP</Button>}
          {can("reply") && task.status !== "Resolved" && <Button variant="outline" className="justify-start" onClick={() => show(resolveInbox(task.id))}><CheckCircle2 className="mr-2 size-4"/>Resolve task</Button>}
        </div>}
      </aside>
    </div>

    {callTask && <CallResultDialog taskId={callTask.id} open={callResult} onOpenChange={setCallResult}/>} 
    <FollowUpDialog customerId={customer.id} open={follow} onOpenChange={setFollow}/>
    <CreateCallDialog customerId={customer.id} open={createCall} onOpenChange={setCreateCall}/>
    <LaunchBombDialog customerId={customer.id} open={launch} onOpenChange={setLaunch}/>
    <ChangeCPDialog customerId={customer.id} open={changeCP} onOpenChange={setChangeCP}/>
  </main>;
}

function CallResultDialog({ taskId, open, onOpenChange }: { taskId: string; open: boolean; onOpenChange: (value: boolean) => void }) {
  const { submitCallResult } = useWorkspace();
  const [outcome, setOutcome] = useState<CallOutcome>("No Answer");
  const [summary, setSummary] = useState("");
  const [recording, setRecording] = useState<"Attached" | "Upload manually" | "Unavailable">("Attached");
  const [callback, setCallback] = useState("");
  const requiresSummary = outcome === "Contact Responded" || outcome === "Connected — No Useful Response" || outcome === "Call Back Requested";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Complete call task</DialogTitle><DialogDescription>The call record is saved before the workflow moves forward.</DialogDescription></DialogHeader><Select value={outcome} onValueChange={value => setOutcome(value as CallOutcome)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Contact Responded", "Connected — No Useful Response", "No Answer", "Voicemail", "Call Back Requested", "Wrong Number", "Wrong Contact", "Other"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>{requiresSummary && <Textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Full call notes or transcript (required)"/>}{outcome === "Call Back Requested" && <Input type="date" value={callback} onChange={event => setCallback(event.target.value)}/>}<Select value={recording} onValueChange={value => setRecording(value as typeof recording)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Attached", "Upload manually", "Unavailable"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">If the correct contact answers, the call is recorded, the Bomb stops, and a Reply Task is created for a Human Responder. No Answer and Voicemail let the Bomb continue.</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={requiresSummary && !summary.trim()} onClick={() => { const result = submitCallResult(taskId, outcome, summary, callback ? `${callback}T09:00:00.000Z` : undefined, recording); show(result); if (result.ok) onOpenChange(false); }}>Submit result</Button></DialogFooter></DialogContent></Dialog>;
}
