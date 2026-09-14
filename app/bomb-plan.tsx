"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Channel, Contact, Interaction, ScheduledAction, User, WorkspaceState, dateOnly } from "@/lib/outreach-domain";
import { BrandReplyBox } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const formatUtcTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")} UTC`;
};

const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

const contactPoint = (contact: Contact, channel: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") return contact.linkedin ? `linkedin.com/in/${contact.linkedin}` : undefined;
  if (channel === "SMS" || channel === "Phone") return contact.phone;
  return contact.email || contact.phone;
};

export const findBombInstance = (state: WorkspaceState, interaction: Interaction) => {
  if (interaction.bombInstanceId) return state.bombInstances.find(item => item.id === interaction.bombInstanceId);
  const candidates = state.bombInstances.filter(item => item.customerId === interaction.customerId);
  const byTime = candidates.filter(item => item.startedAt === interaction.createdAt || dateOnly(item.startedAt) === dateOnly(interaction.createdAt));
  return byTime.find(item => interaction.content.includes(item.templateName)) || byTime[0] || candidates[0];
};

const openStatuses = new Set(["Scheduled", "Sending"]);
const doneStatuses = new Set(["Sent", "Delivered", "Completed"]);

export const currentActionIndex = (actions: ScheduledAction[]) => {
  const current = actions.findIndex(action => openStatuses.has(action.status));
  if (current >= 0) return current;
  const lastDone = [...actions].map((action, index) => ({ action, index })).reverse().find(item => doneStatuses.has(item.action.status));
  return lastDone?.index ?? -1;
};

export const pinnedBombInstanceId = (state: WorkspaceState, customerId?: string) => {
  if (!customerId) return;
  const customer = state.customers.find(item => item.id === customerId);
  if (customer?.activeBombId) return customer.activeBombId;
  return state.bombInstances.find(item => item.customerId === customerId && (item.status === "Running" || item.status === "Paused"))?.id;
};

export function BombExecutionPlan({
  state,
  instanceId,
  contacts,
  tone = "default",
  onSend,
}: {
  state: WorkspaceState;
  instanceId: string;
  contacts: Contact[];
  tone?: "default" | "success";
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string) => Promise<void>;
}) {
  const [expandedId, setExpandedId] = useState<string>();
  const instance = state.bombInstances.find(item => item.id === instanceId);
  const contact = contacts.find(item => item.id === instance?.targetContactId) || contacts[0];
  const actions = state.actions.filter(item => item.bombInstanceId === instanceId).sort((a,b)=>a.actualDate.localeCompare(b.actualDate));
  if (!actions.length) return null;
  const current = currentActionIndex(actions);
  const running = instance?.status === "Running" || instance?.status === "Paused";

  return <ol className="space-y-0">
    {actions.map((action, index) => {
      const call = state.callTasks.find(task => task.id === action.callTaskId);
      const caller = state.users.find(user => user.id === call?.callerId);
      const skipped = action.status === "Skipped" || action.status === "Cancelled";
      const isCurrent = running && index === current && openStatuses.has(action.status);
      const isPast = index < current || doneStatuses.has(action.status) || skipped;
      const numberClass = isCurrent ? "bg-violet-600 text-white" : tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700";
      const lineClass = isCurrent ? "bg-violet-300" : tone === "success" ? "bg-emerald-200" : "bg-slate-200";
      const expanded = expandedId === action.id;
      const related = state.interactions.filter(interaction => interaction.direction === "Inbound" && interaction.channel === action.channel && (interaction.taskId === action.id || interaction.bombInstanceId === instanceId));
      const hasInbound = related.some(interaction => interaction.direction === "Inbound");
      return <li key={action.id} className="flex gap-3">
        <div className="flex w-7 shrink-0 flex-col items-center">
          <span className={`grid size-7 place-items-center rounded-full text-[11px] font-bold ${numberClass}`}>{index + 1}</span>
          {index < actions.length - 1 && <span className={`mt-1 w-px flex-1 min-h-6 ${lineClass}`}/>}
        </div>
        <div className={`mb-3 min-w-0 flex-1 rounded-xl px-3 py-3 ${isCurrent ? "bg-violet-50" : skipped ? "bg-slate-50/70 opacity-55" : "bg-slate-50/80"}`}>
          <button type="button" className="w-full text-left" onClick={()=>setExpandedId(expanded?undefined:action.id)} aria-expanded={expanded}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><ChannelIcon channel={action.channel} className="size-6"/><span className="text-sm font-semibold text-slate-950">{action.channel}</span>{isCurrent && <Badge className="bg-violet-600 text-[10px] text-white">Current</Badge>}</div>
            <div className="flex items-center gap-2"><Badge variant={skipped ? "secondary" : isCurrent ? "default" : "outline"} className="text-[10px]">{hasInbound?"Replied":isCurrent ? "In progress" : action.status}</Badge><ChevronDown className={`size-4 text-slate-400 transition-transform ${expanded?"rotate-180":""}`}/></div>
          </div>
          <time dateTime={action.actualDate} className="mt-1.5 block font-mono text-xs text-slate-500">{formatUtcTime(action.actualDate)}</time>
          <PlanPeople contact={contact} channel={action.channel} caller={skipped ? undefined : caller} action={action}/>
          {skipped && <p className="mt-2 text-xs text-amber-800">{action.note || "Channel unavailable"}</p>}
          </button>
          {expanded&&<div className="mt-3 pt-3"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Sent content</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{action.content||"No written content for this step."}</p></div>}
          {related.filter(item=>item.direction==="Inbound").map(item=><div key={item.id} className="mt-3"><div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">This is a reply</div><div className="mt-0.5 text-[11px] font-medium text-rose-600">from {contact?.name}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p></div><BrandReplyBox customerId={action.customerId} interaction={item} bombInstanceId={instanceId} contacts={contacts} interactions={state.interactions} actions={actions} taskId={action.id} onSend={onSend}/></div>)}
        </div>
      </li>;
    })}
  </ol>;
}

export function CurrentBombPlan({
  state,
  customerId,
  contacts,
}: {
  state: WorkspaceState;
  customerId?: string;
  contacts: Contact[];
}) {
  const instanceId = pinnedBombInstanceId(state, customerId);
  if (!instanceId) return null;
  const instance = state.bombInstances.find(item => item.id === instanceId);
  const actions = state.actions.filter(item => item.bombInstanceId === instanceId).sort((a,b)=>a.actualDate.localeCompare(b.actualDate));
  if (!instance || !actions.length) return null;
  const current = currentActionIndex(actions);
  const currentAction = current >= 0 ? actions[current] : undefined;
  const stage = currentAction && openStatuses.has(currentAction.status)
    ? `Current stage · Step ${current + 1} · ${currentAction.channel}`
    : instance.status === "Paused" ? "Bomb paused" : "All scheduled steps are complete";

  return <div className="bg-slate-50/80 px-5 py-4">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">This bomb · execution plan</div>
        <div className="mt-1 text-sm font-bold text-slate-950">{instance.templateName} · Version {instance.version}</div>
      </div>
      <Badge className={currentAction && openStatuses.has(currentAction.status) ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}>{stage}</Badge>
    </div>
    <BombExecutionPlan state={state} instanceId={instanceId} contacts={contacts}/>
  </div>;
}

function PlanPeople({ contact, channel, caller, action }: { contact?: Contact; channel: Channel; caller?: User; action: ScheduledAction }) {
  if (!contact) return null;
  const endpoint = contactPoint(contact, channel);
  return <div className="mt-2 space-y-2">
    <div className="flex items-center gap-2.5">
      <Avatar className="size-7"><AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700">{initials(contact.name)}</AvatarFallback></Avatar>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-900">{contact.name} <span className="font-normal text-slate-500">· {contact.role}</span></div>
        <div className="truncate text-[11px] text-slate-500">{endpoint || "No channel detail"}</div>
      </div>
    </div>
    {action.channel === "Phone" && caller && <div className="flex items-center gap-2.5 pl-0.5">
      <Avatar className="size-7"><AvatarFallback className="bg-violet-100 text-[10px] font-bold text-violet-800">{caller.initials}</AvatarFallback></Avatar>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-900">{caller.name}</div>
        <div className="text-[11px] text-slate-500">Assigned caller</div>
      </div>
    </div>}
  </div>;
}
