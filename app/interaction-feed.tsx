"use client";

import { Fragment, useState } from "react";
import { Bomb, ChevronRight, UserRound } from "lucide-react";
import { BombInstance, Channel, Contact, CPCode, CP_CODES, Interaction, ScheduledAction } from "@/lib/outreach-domain";
import { BombExecutionPlan, formatUtcTime } from "./bomb-plan";
import { BrandReplyBox, ChannelSendBox } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CHANNELS: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];

const contactPoint = (contact: Contact, channel?: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") return contact.linkedin ? `linkedin.com/in/${contact.linkedin}` : undefined;
  if (channel === "SMS" || channel === "Phone") return contact.phone;
  return contact.email || contact.phone;
};

const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

function threadKey(item: Interaction) {
  return item.threadId || [item.contactId || "", item.channel || "", item.taskId || item.id].join(":");
}

function sourceLabel(item: Interaction): "Human" | "OmniReach" | null {
  if (item.direction === "Inbound") return null;
  if (item.creationMethod === "Manual") return "Human";
  if (item.bombInstanceId || item.creationMethod === "Automated") return "OmniReach";
  return null;
}

function SourceBadge({ source }: { source: "Human" | "OmniReach" }) {
  return (
    <Badge className={source === "Human" ? "bg-violet-100 text-[10px] text-violet-800 hover:bg-violet-100" : "bg-blue-100 text-[10px] text-blue-800 hover:bg-blue-100"}>
      {source}
    </Badge>
  );
}

function outboundStatus(item: Interaction) {
  if (item.channel === "Phone") return item.callResult || item.taskStatus || item.messageStatus || null;
  if (item.creationMethod === "Manual") return item.messageStatus || item.taskStatus || null;
  return item.taskStatus || item.messageStatus || null;
}

function SendStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Sent" || status === "Delivered" || status === "Connected" || status === "Completed" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : status === "Failed" || status === "Declined" || status === "Invalid Number" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : status === "Pending" || status === "In Progress" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
    : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={`text-[10px] ${tone}`}>{status}</Badge>;
}

function isChannelMessage(item: Interaction) {
  return (item.type === "Message" || item.type === "Phone") && !!item.channel;
}

function belongsToCp(item: Interaction, cp: CPCode) {
  return item.cp === cp;
}

export function InteractionFeed({
  interactions,
  contacts,
  customerId: customerIdProp,
  currentCp: currentCpProp,
  cpGoals,
  bombInstances,
  actions,
  maxHeight,
  onSend,
}: {
  interactions: Interaction[];
  contacts: Contact[];
  customerId?: string;
  currentCp?: CPCode;
  cpGoals?: Partial<Record<CPCode, string>>;
  maxHeight?: string;
  bombInstances?: BombInstance[];
  actions?: ScheduledAction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
}) {
  const { state } = useWorkspace();
  const customerId = customerIdProp || interactions[0]?.customerId;
  const customer = state.customers.find(item => item.id === customerId);
  const currentCp = currentCpProp || customer?.cp || "CP1";
  const [selectedCp, setSelectedCp] = useState<CPCode>(currentCp);
  const [selectedChannel, setSelectedChannel] = useState<Channel>("Email");
  const [bombOpen, setBombOpen] = useState(false);
  const currentIndex = CP_CODES.indexOf(currentCp);
  const cpInteractions = interactions.filter(item => !isChannelMessage(item) || belongsToCp(item, selectedCp));
  const planState = bombInstances ? { ...state, bombInstances, actions: actions ?? [], interactions: cpInteractions } : state;
  const channelMessages = cpInteractions.filter(item => isChannelMessage(item) && item.channel === selectedChannel);
  const bombsForCp = planState.bombInstances
    .filter(item => item.customerId === customerId && item.cp === selectedCp)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return <div className={maxHeight ? `${maxHeight} overflow-y-auto` : undefined}>
    <div className="px-5 py-4">
      <div className="flex items-center">{CP_CODES.map((cp, index) => {
        const current = cp === currentCp;
        const completed = index < currentIndex;
        const selected = cp === selectedCp;
        const selectable = index <= currentIndex;
        const reached = index < currentIndex;
        const goal = cpGoals?.[cp] || state.cps.find(item => item.code === cp)?.goal;
        return <Fragment key={cp}>
          <button type="button" disabled={!selectable} aria-pressed={selected} onClick={() => selectable && setSelectedCp(cp)} className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition ${selected ? "bg-violet-50" : selectable ? "hover:bg-slate-50" : "cursor-not-allowed opacity-55"}`}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className={`shrink-0 text-xs font-bold ${selected ? "text-violet-700" : completed ? "text-emerald-700" : "text-slate-400"}`}>{cp}</span>
              {goal && <span className={`truncate text-xs font-semibold ${selected ? "text-slate-950" : "text-slate-500"}`}>{goal}</span>}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-slate-500">{current ? "Current" : completed ? "Completed" : "Upcoming"}</div>
          </button>
          {index < CP_CODES.length - 1 && <span className="grid w-6 shrink-0 place-items-center" aria-hidden><ChevronRight className={`size-4 ${reached ? "text-emerald-500" : current ? "text-violet-400" : "text-slate-300"}`}/></span>}
        </Fragment>;
      })}</div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map(channel => {
          const count = interactions.filter(item => isChannelMessage(item) && item.channel === channel && belongsToCp(item, selectedCp)).length;
          const selected = channel === selectedChannel;
          return <button key={channel} type="button" aria-pressed={selected} onClick={() => setSelectedChannel(channel)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selected ? "bg-violet-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
            <ChannelIcon channel={channel} className="size-4" alt=""/>
            {channel}
            <span className={selected ? "text-white/80" : "text-slate-400"}>{count}</span>
          </button>;
        })}
      </div>
      {bombsForCp.length > 0 && <Button size="sm" variant="outline" onClick={() => setBombOpen(true)}><Bomb className="mr-1.5 size-3.5"/>OmniReach execution plan</Button>}
    </div>

    <ChannelTranscript
      customerId={customerId}
      messages={channelMessages}
      contacts={contacts}
      channel={selectedChannel}
      onSend={onSend}
    />

    <Dialog open={bombOpen} onOpenChange={setBombOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>OmniReach execution plan</DialogTitle>
          <DialogDescription>This plan is separate from the channel conversation. It shows scheduled steps for {selectedCp}.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          {bombsForCp.map(instance => (
            <div key={instance.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold">{instance.templateName} · V{instance.version}</div>
                <div className="flex flex-wrap gap-1.5">
                  {instance.cp && <Badge variant="outline" className="text-[10px]">{instance.cp}</Badge>}
                  <Badge className={instance.status === "Running" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}>{instance.status}</Badge>
                </div>
              </div>
              <BombExecutionPlan state={planState} instanceId={instance.id} contacts={contacts} onSend={onSend}/>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

function ChannelTranscript({
  customerId,
  messages,
  contacts,
  channel,
  onSend,
}: {
  customerId?: string;
  messages: Interaction[];
  contacts: Contact[];
  channel: Channel;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
}) {
  const contactGroups = groupByContact(messages, contacts);
  return <div>
    {!contactGroups.length ? (
      <div className="px-5 py-10 text-center text-sm text-slate-400">No {channel} conversation recorded for this CP.</div>
    ) : (
      <div className="divide-y">
        {contactGroups.map(group => (
          <ContactThreads key={group.contact?.id || "unknown"} group={group} replyPool={messages} channel={channel} onSend={onSend}/>
        ))}
      </div>
    )}
    <ChannelSendBox customerId={customerId} channel={channel} contacts={contacts} interactions={messages} onSend={onSend}/>
  </div>;
}

function groupByContact(messages: Interaction[], contacts: Contact[]) {
  const ids = [...new Set(messages.map(item => item.contactId).filter((id): id is string => !!id))];
  const orphan = messages.filter(item => !item.contactId);
  const groups = ids.map(id => ({
    contact: contacts.find(item => item.id === id),
    messages: messages.filter(item => item.contactId === id),
  }));
  if (orphan.length) groups.push({ contact: undefined, messages: orphan });
  return groups.sort((left, right) => {
    const leftTime = left.messages.map(item => item.createdAt).sort().at(-1) || "";
    const rightTime = right.messages.map(item => item.createdAt).sort().at(-1) || "";
    return rightTime.localeCompare(leftTime);
  });
}

function groupByThread(messages: Interaction[]) {
  const groups = new Map<string, Interaction[]>();
  for (const item of messages) {
    const key = threadKey(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()]
    .map(list => [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)))
    .sort((left, right) => (left[0]?.createdAt || "").localeCompare(right[0]?.createdAt || ""));
}

function ContactThreads({
  group,
  replyPool,
  channel,
  onSend,
}: {
  group: { contact?: Contact; messages: Interaction[] };
  replyPool: Interaction[];
  channel: Channel;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
}) {
  const endpoint = group.contact ? contactPoint(group.contact, channel) : undefined;
  const threads = groupByThread(group.messages);
  return <section className="px-5 py-5">
    <div className="mb-4 flex items-center gap-3">
      {group.contact ? (
        <>
          <Avatar className="size-8"><AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700">{initials(group.contact.name)}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950">{group.contact.name} <span className="font-normal text-slate-500">· {group.contact.role}</span></div>
            <div className="truncate text-xs text-slate-500">{channel}{endpoint ? ` · ${endpoint}` : ""}</div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-800"><UserRound className="size-3.5"/>Contact not linked</div>
      )}
    </div>
    <div className="space-y-6">
      {threads.map(thread => (
        <ThreadMessages key={threadKey(thread[0])} thread={thread} replyPool={replyPool} contact={group.contact} channel={channel} endpoint={endpoint} onSend={onSend}/>
      ))}
    </div>
  </section>;
}

function ThreadMessages({
  thread,
  replyPool,
  contact,
  channel,
  endpoint,
  onSend,
}: {
  thread: Interaction[];
  replyPool: Interaction[];
  contact?: Contact;
  channel: Channel;
  endpoint?: string;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
}) {
  return <div className="space-y-3">
    {thread.map(item => {
      const inbound = item.direction === "Inbound";
      const source = sourceLabel(item);
      const who = inbound
        ? `${endpoint || contact?.name || "Contact"} Reply`
        : `To ${endpoint || contact?.name || "Contact"}`;
      return <article key={item.id} className={`rounded-xl p-4 ${inbound ? "bg-rose-50/80" : "bg-slate-50"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-slate-900">{who}</div>
            {inbound ? <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge> : <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>}
            {source && <SourceBadge source={source}/>}
            {!inbound && (outboundStatus(item) ? <SendStatusBadge status={outboundStatus(item)!}/> : <Badge variant="outline" className="text-[10px] text-slate-500">No send status</Badge>)}
          </div>
          <time dateTime={item.createdAt} className="font-mono text-[11px] text-slate-500">{formatUtcTime(item.createdAt)}</time>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p>
        {inbound && contact && (
          <BrandReplyBox
            customerId={item.customerId}
            interaction={item}
            bombInstanceId={item.bombInstanceId}
            contacts={[contact]}
            interactions={replyPool}
            taskId={item.taskId}
            onSend={onSend}
          />
        )}
      </article>;
    })}
  </div>;
}
