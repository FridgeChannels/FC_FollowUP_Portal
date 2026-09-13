/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bomb, Check, CheckCircle2, MessageCircle, Phone, Search, Send, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { CallOutcome, canSeeTask, dateOnly, isClosedTaskStatus } from "@/lib/outreach-domain";
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
};

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

  useEffect(() => {
    setType(state.currentRole === "Caller" ? "Call" : "All");
    setAssignee("all");
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
        priority: item.status === "Needs Reply" || followUp?.status === "Due" ? "High" : item.status === "Waiting for Reply" ? "Low" : "Normal",
        summary: followUp?.reason || item.preview,
      };
    });
    return [...calls, ...human];
  }, [state.callTasks, state.inbox, state.followUps]);

  const tasks = useMemo(() => {
    return allTasks.filter(task => {
      const customer = state.customers.find(c => c.id === task.customerId);
      const matchesQuery = !query || customer?.name.toLowerCase().includes(query.toLowerCase()) || task.summary.toLowerCase().includes(query.toLowerCase());
      const matchesScope = canSeeTask(state, task.customerId, task.assigneeId);
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
    if (!selectedTask) return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Task not found</h1><Button variant="link" onClick={() => router.push("/tasks")}>Back to ReplyTask</Button></div></div>;
    return <TaskDetail task={selectedTask}/>;
  }

  return <div className="mx-auto max-w-[1540px]">
    <div className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight">ReplyTask</h1>
    </div>

    <div className="mb-4 flex flex-col gap-3 rounded-2xl border bg-white p-3 lg:flex-row lg:items-center">
      <div className="relative min-w-56 flex-1 lg:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brand or task…" className="pl-9"/></div>
      <Select value={type} onValueChange={value => setType(value as TaskType | "All")}><SelectTrigger className="w-full lg:w-40"><SelectValue/></SelectTrigger><SelectContent>{["All", "Call", "Reply"].map(value => <SelectItem key={value} value={value}>{value === "All" ? "All types" : value}</SelectItem>)}</SelectContent></Select>
      {manager && <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-full lg:w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All FC-Owners</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select>}
      <Select value={status} onValueChange={value => setStatus(value as typeof status)}><SelectTrigger className="w-full lg:w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Open">Open</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="All">All statuses</SelectItem></SelectContent></Select>
    </div>

    <div className="overflow-hidden rounded-2xl border bg-white">
      {tasks.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="min-w-56 pl-5">Brand</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{tasks.map(task => {
        const customer = state.customers.find(c => c.id === task.customerId);
        const overdue = isDue(task, state.simulatedDate);
        const Icon = task.type === "Call" ? Phone : MessageCircle;
        return <TableRow key={task.id} className={`cursor-pointer ${overdue ? "bg-amber-50/80 hover:bg-amber-50" : "hover:bg-violet-50/30"}`} onClick={() => router.push(`/tasks/${task.id}`)}>
          <TableCell className="pl-5"><div className="flex items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-xl ${task.type === "Call" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}><Icon className="size-4"/></span><div className="text-sm font-semibold">{customer?.name || "Unknown brand"}</div></div></TableCell>
          <TableCell><Badge variant="secondary" className="text-[10px]">{task.type}</Badge></TableCell>
          <TableCell>{overdue ? <Status value="Due"/> : <Status value={task.status}/>}</TableCell>
          <TableCell className="whitespace-nowrap text-xs text-slate-500">{dateOnly(task.dueAt)}</TableCell>
        </TableRow>;
      })}</TableBody></Table></div> : <Empty className="py-24"><EmptyHeader><EmptyMedia variant="icon"><CheckCircle2/></EmptyMedia><EmptyTitle>All caught up</EmptyTitle><EmptyDescription>No tasks match these filters.</EmptyDescription></EmptyHeader></Empty>}
    </div>
  </div>;
}

function TaskDetail({ task }: { task: UnifiedTask }) {
  const { state, can, resolveInbox, assignBrand, reassignCall } = useWorkspace();
  const router = useRouter();
  const [callResult, setCallResult] = useState(false);
  const [launch, setLaunch] = useState(false);
  const [sendMessage, setSendMessage] = useState(false);
  const [changeCP, setChangeCP] = useState(false);
  const customer = state.customers.find(c => c.id === task.customerId);
  const partnershipContext=customer?.partnershipContext;
  const contact = customer?.contacts.find(c => c.id === task.contactId) || customer?.contacts[0];
  const callTask = task.source === "call" ? state.callTasks.find(call => call.id === task.id) : undefined;
  const timeline = state.interactions.filter(item => item.customerId === task.customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!customer || !contact) return <main className="grid place-items-center bg-slate-50 text-sm text-slate-500">Brand context unavailable.</main>;
  const humanAssignees = state.users.filter(user => user.role === "FC_Owner" || user.role === "Admin");
  const callers = state.users.filter(user => user.role === "Caller");

  return <div className="mx-auto max-w-[1540px]">
    <button onClick={() => router.push("/tasks")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>ReplyTask</button>
    <main className="min-w-0 overflow-hidden rounded-2xl border bg-slate-50">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b bg-white px-5 py-4 lg:px-7">
      <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{task.type}</Badge>{isDue(task, state.simulatedDate) ? <Status value="Due"/> : <Badge variant="secondary">{task.status}</Badge>}<span className="text-xs text-slate-400">{dateOnly(task.dueAt)}</span></div><h2 className="mt-2 text-xl font-bold">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{contact.name} · {contact.role} · {customer.cp} · {customer.status}</p></div>
      <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${customer.id}`)}>Brand profile</Button>
    </header>

    <div className="grid lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="min-w-0 p-5 lg:p-7">
        <section className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-5 py-4"><h3 className="font-bold">Brand activity</h3><p className="mt-1 text-xs text-slate-500">Bomb execution and independent conversations, organized by CP stage.</p></div>
          <InteractionFeed key={`${customer.id}-${customer.cp}`} customerId={customer.id} interactions={timeline} contacts={customer.contacts} maxHeight="max-h-[480px]"/>
        </section>

      </div>

      <aside className="border-t bg-white p-5 lg:border-l lg:border-t-0">
        <div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{customer.initials}</AvatarFallback></Avatar><div><b className="text-sm">{customer.name}</b><div className="text-xs text-slate-500">{state.cps.find(cp => cp.code === customer.cp)?.goal}</div></div></div>
        {(customer.cp === "CP3" || partnershipContext) && partnershipContext && <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-[11px] font-semibold tracking-wide text-emerald-700">CP3 · Partnership context</div><div className="mt-2 text-sm font-bold text-emerald-950">{partnershipContext.headline}</div><p className="mt-2 text-xs leading-5 text-emerald-900">{partnershipContext.summary}</p><div className="mt-3 space-y-2">{partnershipContext.signals.map(signal=><div key={signal} className="rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-5 text-slate-700">{signal}</div>)}</div></section>}
        <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">FC-Owner</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4"/>{state.users.find(user => user.id === task.assigneeId)?.name || "Unassigned"}</div></div>

        {callTask && can("submitCall") && callTask.status === "Scheduled" && <Button className="mt-4 w-full" onClick={() => setCallResult(true)}><Phone className="mr-2 size-4"/>Complete call</Button>}
        {callTask && can("manageCalls") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign caller</label><Select value={callTask.callerId} onValueChange={value => show(reassignCall(callTask.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent>{callers.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}
        {task.source === "inbox" && can("assignOwner") && <div className="mt-4"><label className="text-xs font-semibold text-slate-500">Assign FC-Owner</label><Select value={task.assigneeId || "unassigned"} onValueChange={value => show(assignBrand(customer.id, value))}><SelectTrigger className="mt-2 w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{humanAssignees.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>}

        {task.source === "inbox" && <div className="mt-5 grid gap-2">
          {can("reply") && <Button variant="outline" className="justify-start" onClick={() => setSendMessage(true)}><Send className="mr-2 size-4"/>Send message</Button>}
          {can("launch") && <Button variant="outline" className="justify-start" disabled={!!customer.activeBombId || customer.status === "Bomb Running"} onClick={() => setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}
          {can("changeCP") && <Button variant="outline" className="justify-start" onClick={() => setChangeCP(true)}><Check className="mr-2 size-4"/>Change CP</Button>}
          {can("reply") && task.status !== "Resolved" && <Button variant="outline" className="justify-start" onClick={() => show(resolveInbox(task.id))}><CheckCircle2 className="mr-2 size-4"/>End task</Button>}
        </div>}
      </aside>
    </div>

    {callTask && <CallResultDialog taskId={callTask.id} open={callResult} onOpenChange={setCallResult}/>} 
    <LaunchBombDialog customerId={customer.id} open={launch} onOpenChange={setLaunch}/>
    <ReplyDialog customerId={customer.id} open={sendMessage} onOpenChange={setSendMessage}/>
    <ChangeCPDialog customerId={customer.id} open={changeCP} onOpenChange={setChangeCP}/>
  </main>
  </div>;
}

function CallResultDialog({ taskId, open, onOpenChange }: { taskId: string; open: boolean; onOpenChange: (value: boolean) => void }) {
  const { submitCallResult } = useWorkspace();
  const [outcome, setOutcome] = useState<CallOutcome>("No Answer");
  const [summary, setSummary] = useState("");
  const [recording, setRecording] = useState<"Attached" | "Upload manually" | "Unavailable">("Attached");
  const [callback, setCallback] = useState("");
  const requiresSummary = outcome === "Contact Responded" || outcome === "Connected — No Useful Response" || outcome === "Call Back Requested";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Complete call task</DialogTitle><DialogDescription>The call record is saved before the workflow moves forward.</DialogDescription></DialogHeader><Select value={outcome} onValueChange={value => setOutcome(value as CallOutcome)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Contact Responded", "Connected — No Useful Response", "No Answer", "Voicemail", "Call Back Requested", "Wrong Number", "Wrong Contact", "Other"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>{requiresSummary && <Textarea value={summary} onChange={event => setSummary(event.target.value)} placeholder="Full call notes or transcript (required)"/>}{outcome === "Call Back Requested" && <Input type="date" value={callback} onChange={event => setCallback(event.target.value)}/>}<Select value={recording} onValueChange={value => setRecording(value as typeof recording)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Attached", "Upload manually", "Unavailable"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">If the correct contact answers, the call is recorded, the Bomb stops, and a Reply Task is created for a FC_Owner. No Answer and Voicemail let the Bomb continue.</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={requiresSummary && !summary.trim()} onClick={() => { const result = submitCallResult(taskId, outcome, summary, callback ? `${callback}T09:00:00.000Z` : undefined, recording); show(result); if (result.ok) onOpenChange(false); }}>Submit result</Button></DialogFooter></DialogContent></Dialog>;
}
