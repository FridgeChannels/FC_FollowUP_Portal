"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Bomb, CheckCircle2, ChevronRight, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { callReviewsFromTasks, type CallReviewStatus } from "@/lib/call-review-metadata";
import type { BrandTask } from "@/lib/brand-list";
import { BombInstance, Channel, Contact, CPCode, CP_CODES, Interaction, ScheduledAction } from "@/lib/outreach-domain";
import { BombExecutionPlan, formatUtcTime } from "./bomb-plan";
import { BrandReplyBox } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { PhoneTaskBoard } from "./phone-task-board";
import { QuoCallPanel } from "./quo-call-panel";
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

function sourceLabel(item: Interaction, bombInstances: BombInstance[]): string | null {
  if (item.direction === "Inbound") return null;
  if (item.creationMethod === "Manual") return "Human";
  if (item.bombInstanceId || item.creationMethod === "Automated") return bombInstances.find(instance => instance.id === item.bombInstanceId)?.templateName || "OmniReach";
  return null;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge className={source === "Human" ? "bg-violet-100 text-[10px] text-violet-800 hover:bg-violet-100" : "bg-blue-100 text-[10px] text-blue-800 hover:bg-blue-100"}>
      {source}
    </Badge>
  );
}

function outboundStatus(item: Interaction) {
  return item.taskStatus || null;
}

function deliveryTiming(item: Interaction) {
  const taskStatus = outboundStatus(item);
  if (taskStatus === "Cancelled" || taskStatus === "Canceled") {
    return { label: "Cancelled", at: item.scheduledAt || item.createdAt };
  }
  if (taskStatus === "Failed") {
    return { label: "Failed", at: item.createdAt };
  }
  const sent = taskStatus === "Completed" || ["Sent", "Delivered", "Connected", "Completed"].includes(item.messageStatus || "");
  if (sent) return { label: "Sent", at: item.createdAt };
  const scheduled = taskStatus === "Pending" || taskStatus === "In Progress" || item.messageStatus === "Pending";
  if (scheduled) return { label: "Scheduled", at: item.scheduledAt || item.createdAt };
  return null;
}

function SendStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Sent" || status === "Delivered" || status === "Connected" || status === "Completed" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : status === "Failed" || status === "Declined" || status === "Invalid Number" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : status === "Cancelled" || status === "Canceled" ? "bg-slate-100 text-slate-700 hover:bg-slate-100"
    : status === "Pending" || status === "In Progress" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
    : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={`text-[10px] ${tone}`}>{status === "Canceled" ? "Cancelled" : status}</Badge>;
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
  onCancelBomb,
  initialChannel,
  initialCp,
  callerPhoneOnly,
  channelHeader,
  channelHeaderCp,
  onRefreshQuo,
  quoRefreshingCallId,
  canReviewCalls = false,
  tasks = [],
  onPersistCallReview,
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
  onCancelBomb?: (instance: BombInstance) => Promise<void>;
  initialChannel?: Channel;
  initialCp?: CPCode;
  callerPhoneOnly?: boolean;
  channelHeader?: ReactNode;
  channelHeaderCp?: CPCode;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  canReviewCalls?: boolean;
  tasks?: Array<Pick<BrandTask, "id" | "channel" | "title" | "status" | "contactId" | "contactPhone" | "templateId" | "scheduledAt" | "callReviewStatus"> & { remote?: boolean }>;
  onPersistCallReview?: (taskId: string, status: CallReviewStatus) => Promise<void>;
}) {
  const { state } = useWorkspace();
  const notionReviews = callReviewsFromTasks(tasks);
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const resolveReview = (taskId?: string | null) => {
    if (!taskId) return undefined;
    return notionReviews[taskId];
  };
  const handleReviewCall = async (_interactionId: string, taskId: string | undefined, status: CallReviewStatus) => {
    if (!taskId) {
      toast.error("This call is not linked to a Follow-up Task");
      return;
    }
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
  const customerId = customerIdProp || interactions[0]?.customerId;
  const customer = state.customers.find(item => item.id === customerId);
  const currentCp = currentCpProp || customer?.cp || "CP1";
  const [selectedChannel, setSelectedChannel] = useState<Channel>(callerPhoneOnly ? "Phone" : initialChannel || "Email");
  const [bombOpen, setBombOpen] = useState(false);
  const [cancellingBombId, setCancellingBombId] = useState<string | null>(null);
  const visibleCps = CP_CODES.slice(0, 3);
  const selectedInitialCp = initialCp || currentCp;
  const selectedCpIsVisible = visibleCps.includes(selectedInitialCp as (typeof visibleCps)[number]);
  const [selectedCp, setSelectedCp] = useState<CPCode>(selectedCpIsVisible ? selectedInitialCp : visibleCps[visibleCps.length - 1]);
  const displayCurrentCp = visibleCps.includes(currentCp as (typeof visibleCps)[number]) ? currentCp : visibleCps[visibleCps.length - 1];
  const currentIndex = visibleCps.indexOf(displayCurrentCp as (typeof visibleCps)[number]);
  const cpInteractions = interactions.filter(item => !isChannelMessage(item) || belongsToCp(item, selectedCp));
  const planState = bombInstances ? { ...state, bombInstances, actions: actions ?? [], interactions: cpInteractions } : state;
  const activeChannel = callerPhoneOnly ? "Phone" : selectedChannel;
  const visibleChannels: Channel[] = callerPhoneOnly ? ["Phone"] : CHANNELS;
  const channelMessages = cpInteractions.filter(item => isChannelMessage(item) && item.channel === activeChannel);
  const bombsForCp = planState.bombInstances
    .filter(item => item.customerId === customerId && item.cp === selectedCp)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const phoneTasks = tasks
    .filter((item) => item.channel === "Phone")
    .map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status || "Pending",
      dueAt: item.scheduledAt,
      contactId: item.contactId,
      contactPhone: item.contactPhone,
      templateId: item.templateId,
      callReviewStatus: item.callReviewStatus,
      remote: item.remote !== false,
    }));
  const usePhoneTaskBoard = !callerPhoneOnly && activeChannel === "Phone" && phoneTasks.length > 0;

  return <div className={maxHeight ? `${maxHeight} overflow-y-auto` : undefined}>
    <div className="px-5 py-4">
      <div className="flex items-center">{visibleCps.map((cp, index) => {
        const current = cp === displayCurrentCp;
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
          {index < visibleCps.length - 1 && <span className="grid w-6 shrink-0 place-items-center" aria-hidden><ChevronRight className={`size-4 ${reached ? "text-emerald-500" : current ? "text-violet-400" : "text-slate-300"}`}/></span>}
        </Fragment>;
      })}</div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
      <div className="flex flex-wrap gap-1.5">
        {visibleChannels.map(channel => {
          const count = channel === "Phone" && phoneTasks.length
            ? phoneTasks.length
            : interactions.filter(item => isChannelMessage(item) && item.channel === channel && belongsToCp(item, selectedCp)).length;
          const selected = channel === activeChannel;
          return <button key={channel} type="button" aria-pressed={selected} onClick={() => setSelectedChannel(channel)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selected ? "bg-violet-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
            <ChannelIcon channel={channel} className="size-4" alt=""/>
            {channel}
            <span className={selected ? "text-white/80" : "text-slate-400"}>{count}</span>
          </button>;
        })}
      </div>
      {!callerPhoneOnly && bombsForCp.length > 0 && <Button size="sm" variant="outline" onClick={() => setBombOpen(true)}><Bomb className="mr-1.5 size-3.5"/>OmniReach execution plan</Button>}
    </div>

    {channelHeader && (!channelHeaderCp || selectedCp === channelHeaderCp) && <div className="px-5 pt-5">{channelHeader}</div>}
    {usePhoneTaskBoard ? (
      <PhoneTaskBoard
        phoneTasks={phoneTasks}
        contacts={contacts}
        timeline={cpInteractions}
        showChannelTab={false}
        canReviewCalls={canReviewCalls}
        onPersistCallReview={onPersistCallReview}
        onRefreshQuo={onRefreshQuo}
        quoRefreshingCallId={quoRefreshingCallId}
        showDial={false}
      />
    ) : (
    <ChannelTranscript
      messages={channelMessages}
      contacts={contacts}
      channel={activeChannel}
      bombInstances={planState.bombInstances}
      onSend={onSend}
      onRefreshQuo={onRefreshQuo}
      quoRefreshingCallId={quoRefreshingCallId}
      resolveReview={resolveReview}
      canReviewCalls={canReviewCalls}
      reviewingTaskId={reviewingTaskId}
      onReviewCall={handleReviewCall}
    />
    )}

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
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <div className="text-sm font-bold">{instance.templateName} · V{instance.version}</div>
                  {instance.cp && <Badge variant="outline" className="text-[10px]">{instance.cp}</Badge>}
                  <Badge className={instance.status === "Running" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}>{instance.status}</Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  {instance.status === "Running" && onCancelBomb && <Button size="sm" variant="outline" disabled={cancellingBombId === instance.id} className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={async () => {
                    if (!window.confirm(`Stop ${instance.templateName}? All remaining scheduled tasks will be cancelled.`)) return;
                    setCancellingBombId(instance.id);
                    try { await onCancelBomb(instance); setBombOpen(false); }
                    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to stop OmniReach"); }
                    finally { setCancellingBombId(null); }
                  }}>{cancellingBombId === instance.id ? "Stopping…" : "Stop OmniReach"}</Button>}
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
  messages,
  contacts,
  channel,
  bombInstances,
  onSend,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
}: {
  messages: Interaction[];
  contacts: Contact[];
  channel: Channel;
  bombInstances: BombInstance[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus) => void | Promise<void>;
}) {
  const contactGroups = groupByContact(messages, contacts);
  return <div>
    {!contactGroups.length ? (
      <div className="px-5 py-10 text-center text-sm text-slate-400">No {channel} conversation recorded for this CP.</div>
    ) : (
      <div className="divide-y">
        {contactGroups.map(group => (
          <ContactThreads key={group.contact?.id || "unknown"} group={group} replyPool={messages} channel={channel} bombInstances={bombInstances} onSend={onSend} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall}/>
        ))}
      </div>
    )}
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
  bombInstances,
  onSend,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
}: {
  group: { contact?: Contact; messages: Interaction[] };
  replyPool: Interaction[];
  channel: Channel;
  bombInstances: BombInstance[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus) => void | Promise<void>;
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
        <ThreadMessages key={threadKey(thread[0])} thread={thread} replyPool={replyPool} contact={group.contact} channel={channel} endpoint={endpoint} bombInstances={bombInstances} onSend={onSend} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall}/>
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
  bombInstances,
  onSend,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
}: {
  thread: Interaction[];
  replyPool: Interaction[];
  contact?: Contact;
  channel: Channel;
  endpoint?: string;
  bombInstances: BombInstance[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus) => void | Promise<void>;
}) {
  return <div className="space-y-3">
    {thread.map(item => {
      const inbound = item.direction === "Inbound";
      const source = sourceLabel(item, bombInstances);
      const phoneCall = channel === "Phone";
      const who = inbound
        ? phoneCall
          ? `${endpoint || contact?.name || "Contact"} call`
          : `${endpoint || contact?.name || "Contact"} Reply`
        : `To ${endpoint || contact?.name || "Contact"}`;
      const callId = item.quo?.callId;
      const canRefresh = !!callId && !callId.startsWith("ACsim") && !!onRefreshQuo;
      const timing = !inbound && !phoneCall ? deliveryTiming(item) : null;
      const callReview = phoneCall ? resolveReview(item.taskId) : undefined;
      return <article key={item.id} className={`rounded-xl p-4 ${inbound ? "bg-rose-50/80" : "bg-slate-50"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold text-slate-900">{who}</div>
            {inbound && !phoneCall ? <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge> : <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>}
            {source && <SourceBadge source={source}/>}
            {!inbound && !timing && (outboundStatus(item) ? <SendStatusBadge status={outboundStatus(item)!}/> : <Badge variant="outline" className="text-[10px] text-slate-500">No send status</Badge>)}
            {phoneCall && item.callResult ? <SendStatusBadge status={item.callResult}/> : null}
            {callReview ? <Badge className={callReview.status === "Qualified" ? "bg-emerald-100 text-[10px] text-emerald-800 hover:bg-emerald-100" : "bg-rose-100 text-[10px] text-rose-800 hover:bg-rose-100"}>{callReview.status.toLowerCase()}</Badge> : null}
          </div>
          <time dateTime={item.createdAt} className="font-mono text-[11px] text-slate-500">{formatUtcTime(item.createdAt)}</time>
        </div>
        {timing && <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span className={timing.label === "Sent" ? "font-semibold text-emerald-700" : timing.label === "Failed" ? "font-semibold text-rose-700" : timing.label === "Cancelled" ? "font-semibold text-slate-600" : "font-semibold text-amber-700"}>{timing.label}</span><time dateTime={timing.at} className="font-mono text-[11px]">{formatUtcTime(timing.at)}</time></div>}
        {!item.quo && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p>}
        {item.quo ? <div className="mt-3">
          <QuoCallPanel
            compact
            data={item.quo}
            refreshing={quoRefreshingCallId === callId}
            onRefresh={canRefresh ? () => onRefreshQuo?.(callId!) : undefined}
          />
        </div> : null}
        {phoneCall && item.quo && canReviewCalls && !callReview ? <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={reviewingTaskId===item.taskId} onClick={() => void onReviewCall(item.id, item.taskId, "Qualified")}><CheckCircle2 className="mr-1.5 size-3.5"/>{reviewingTaskId===item.taskId?"Saving…":"Mark as Qualified"}</Button><Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" disabled={reviewingTaskId===item.taskId} onClick={() => void onReviewCall(item.id, item.taskId, "Unqualified")}><RotateCcw className="mr-1.5 size-3.5"/>{reviewingTaskId===item.taskId?"Saving…":"Unqualified & Recall"}</Button></div> : null}
        {inbound && !phoneCall && contact && (
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
