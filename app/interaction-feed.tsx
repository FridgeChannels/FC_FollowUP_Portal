"use client";

import { useState, type ReactNode } from "react";
import { Bomb, CheckCircle2, ChevronLeft, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { CallReviewRound } from "@/lib/call-review-history";
import { callReviewsFromTasks, type CallReviewStatus } from "@/lib/call-review-metadata";
import { getDisplayTimeZone } from "@/lib/display-time";
import { BombInstance, Channel, Contact, CPCode, CP_CODES, Interaction, ScheduledAction, compareInteractionSort, interactionSortAt, interactionSortMs } from "@/lib/outreach-domain";
import { BombExecutionPlan, formatEasternDateTime } from "./bomb-plan";
import { BrandReplyBox, inboundNeedsComposer } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { PhoneTaskBoard, UnqualifiedRecallForm, type QuoDialOpening } from "./phone-task-board";
import { QuoCallPanel } from "./quo-call-panel";
import { useWorkspace } from "./workspace-store";
import { MessageMediaPreview, MessageMediaThumbnails } from "./message-media";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const CHANNELS: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];

const contactPoint = (contact: Contact, channel?: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") {
    const handle = contact.linkedin
      ?.trim()
      .replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, "")
      .replace(/\/$/, "");
    return handle ? `linkedin.com/in/${handle}` : undefined;
  }
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

/** Email subject from title; skip placeholders and content that already embeds Subject. */
function emailSubjectLabel(item: Interaction) {
  if (item.channel !== "Email") return null;
  const subject = item.title?.trim();
  if (!subject || subject === "Email" || subject === "Conversation") return null;
  if (/^Subject:\s*/i.test(item.content.trim())) return null;
  return subject;
}

function emailCcLabel(item: Interaction) {
  if (item.channel !== "Email") return null;
  const cc = item.cc?.trim();
  return cc || null;
}

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge className={source === "Human" ? "bg-violet-100 text-[10px] text-violet-800 hover:bg-violet-100" : "bg-blue-100 text-[10px] text-blue-800 hover:bg-blue-100"}>
      {source}
    </Badge>
  );
}

function ThreadMedia({ attachments }: { attachments: NonNullable<Interaction["attachments"]> }) {
  const [preview, setPreview] = useState<NonNullable<Interaction["attachments"]>[number] | null>(null);
  return (
    <>
      <MessageMediaThumbnails attachments={attachments} onPreview={setPreview} />
      <MessageMediaPreview item={preview} onOpenChange={(open) => { if (!open) setPreview(null); }} />
    </>
  );
}

function outboundStatus(item: Interaction) {
  return item.taskStatus || null;
}

function deliveryTiming(item: Interaction) {
  const taskStatus = outboundStatus(item);
  if (!taskStatus) return null;
  const label = taskStatus === "Canceled" ? "Cancelled" : taskStatus;
  const at = interactionSortAt(item) || null;
  return { label, at };
}

function scheduledAtLabel(item: Interaction) {
  return item.direction !== "Inbound" && item.scheduledAt
    ? `Scheduled · ${formatEasternDateTime(item.scheduledAt)}`
    : null;
}

function SendStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Sent" || status === "Delivered" || status === "Connected" || status === "Completed" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
    : status === "Failed" || status === "Declined" || status === "Invalid Number" ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
    : status === "Cancelled" || status === "Canceled" ? "bg-slate-200 text-slate-700 hover:bg-slate-200"
    : status === "Pending" ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
    : status === "In Progress" ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
    : status === "Received" ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
    : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  return <Badge className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] leading-none ${tone}`}>{status === "Canceled" ? "Cancelled" : status}</Badge>;
}

function isChannelMessage(item: Interaction) {
  return (item.type === "Message" || item.type === "Phone") && !!item.channel;
}

function belongsToCp(item: Interaction, cp: CPCode, fallbackCp?: CPCode) {
  if (item.cp === cp) return true;
  // Legacy Quo rows may lack a CP stamp; show them on the brand's current CP tab.
  if (!item.cp && item.channel === "Phone" && item.quo && fallbackCp === cp) return true;
  return false;
}

function sameNotionId(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  if (left === right) return true;
  return left.replace(/-/g, "").toLowerCase() === right.replace(/-/g, "").toLowerCase();
}

/** Phone tasks that have at least one Conversation stamped with this CP. */
function phoneTaskIdsForCp(
  interactions: Interaction[],
  cp: CPCode,
  fallbackCp?: CPCode,
  tasks: Array<{ id: string; channel?: string | null; callReviewStatus?: string | null }> = [],
) {
  const ids = new Set<string>();
  for (const item of interactions) {
    if (item.channel === "Phone" && item.taskId && belongsToCp(item, cp, fallbackCp)) ids.add(item.taskId);
  }
  // Ensure Connected/awaiting-review Phone tasks stay visible on the brand's current CP
  // even when Conversation CP stamps disagree (e.g. Quo stamped CP4, script stamped CP3).
  if (fallbackCp === cp) {
    for (const task of tasks) {
      if (task.channel === "Phone" && (task.callReviewStatus === "Awaiting Review" || task.callReviewStatus === "Unqualified")) ids.add(task.id);
    }
  }
  return ids;
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
  loading = false,
  activeTaskId,
  headerContactName,
  onSelectTask,
  onCallOpening,
  callerReviewTaskId,
  callerReviewHasConnectedCall = false,
  callerReviewCanSubmit = false,
  onSubmitCallerReview,
  submittingCallerReview = false,
  scriptsLoading = false,
}: {
  interactions: Interaction[];
  contacts: Contact[];
  customerId?: string;
  currentCp?: CPCode;
  cpGoals?: Partial<Record<CPCode, string>>;
  maxHeight?: string;
  bombInstances?: BombInstance[];
  actions?: ScheduledAction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelBomb?: (instance: BombInstance) => Promise<void>;
  initialChannel?: Channel;
  initialCp?: CPCode;
  callerPhoneOnly?: boolean;
  channelHeader?: ReactNode;
  channelHeaderCp?: CPCode;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  canReviewCalls?: boolean;
  tasks?: Array<{
    id: string;
    channel?: string | null;
    title?: string;
    status?: string | null;
    contactId?: string | null;
    contactPhone?: string | null;
    templateId?: string | null;
    scheduledAt?: string | null;
    callReviewStatus?: CallReviewStatus | null;
    callReviewHistory?: CallReviewRound[];
    remote?: boolean;
  }>;
  onPersistCallReview?: (taskId: string, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => Promise<void>;
  loading?: boolean;
  activeTaskId?: string | null;
  headerContactName?: string;
  onSelectTask?: (taskId: string) => void;
  onCallOpening?: (info: QuoDialOpening) => void;
  callerReviewTaskId?: string | null;
  callerReviewHasConnectedCall?: boolean;
  callerReviewCanSubmit?: boolean;
  onSubmitCallerReview?: (callId: string, note?: string) => void | Promise<void>;
  submittingCallerReview?: boolean;
  scriptsLoading?: boolean;
}) {
  const { state } = useWorkspace();
  const notionReviews = callReviewsFromTasks(tasks);
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const resolveReview = (taskId?: string | null) => {
    if (!taskId) return undefined;
    return notionReviews[taskId];
  };
  const handleReviewCall = async (_interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => {
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
      await onPersistCallReview(taskId, status, reviewReason, reviewNote);
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
  // Brand may be on CP4+; the strip only goes to CP3, so treat CP3 as the current tab.
  const displayCurrentCp = visibleCps.includes(currentCp as (typeof visibleCps)[number])
    ? currentCp
    : visibleCps[visibleCps.length - 1];
  const currentIndex = visibleCps.indexOf(displayCurrentCp as (typeof visibleCps)[number]);
  const taskIdsForCp = phoneTaskIdsForCp(interactions, selectedCp, displayCurrentCp, tasks);
  if (activeTaskId) taskIdsForCp.add(activeTaskId);
  const phoneTasks = tasks
    .filter((item) => item.channel === "Phone" && [...taskIdsForCp].some((id) => sameNotionId(id, item.id)))
    .map((item) => ({
      id: item.id,
      title: item.title || "Phone task",
      status: item.status || "Pending",
      dueAt: item.scheduledAt,
      contactId: item.contactId || null,
      contactPhone: item.contactPhone || null,
      templateId: item.templateId || null,
      callReviewStatus: item.callReviewStatus,
      callReviewHistory: item.callReviewHistory,
      remote: item.remote !== false,
    }));
  const phoneBoardTaskIds = phoneTasks.map((item) => item.id);
  const cpInteractions = interactions.filter((item) => {
    if (!isChannelMessage(item)) return true;
    // Strict: only show messages stamped for this CP tab.
    if (belongsToCp(item, selectedCp, displayCurrentCp)) return true;
    // Task detail: keep Phone rows linked to the focused task even without a CP stamp.
    if (activeTaskId && item.channel === "Phone" && sameNotionId(item.taskId, activeTaskId)) return true;
    // Keep Quo/Phone rows for tasks shown on this board even when Conversation CP
    // differs from the selected tab (e.g. brand is CP4 but script was stamped CP3).
    if (
      item.channel === "Phone"
      && item.taskId
      && phoneBoardTaskIds.some((id) => sameNotionId(id, item.taskId))
    ) {
      return true;
    }
    return false;
  });
  const planState = bombInstances ? { ...state, bombInstances, actions: actions ?? [], interactions: cpInteractions } : state;
  const activeChannel = callerPhoneOnly ? "Phone" : selectedChannel;
  const visibleChannels: Channel[] = callerPhoneOnly ? ["Phone"] : CHANNELS;
  const channelMessages = cpInteractions.filter(item => isChannelMessage(item) && item.channel === activeChannel);
  // Newest OmniReach launch first (startedAt = creation/launch time).
  const bombsForCp = planState.bombInstances
    .filter(item => item.customerId === customerId && item.cp === selectedCp)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  const usePhoneTaskBoard = activeChannel === "Phone" && (callerPhoneOnly || phoneTasks.length > 0);

  return <div className={`w-full min-w-0 ${maxHeight ? `${maxHeight} overflow-y-auto` : ""}`}>
    <div className="px-5 py-4">
      <div className="grid grid-cols-3 gap-2">{visibleCps.map((cp, index) => {
        const current = cp === displayCurrentCp;
        const completed = index < currentIndex;
        const selected = cp === selectedCp;
        const selectable = index <= currentIndex;
        const goal = cpGoals?.[cp] || state.cps.find(item => item.code === cp)?.goal;
        return <button key={cp} type="button" disabled={!selectable} aria-pressed={selected} onClick={() => selectable && setSelectedCp(cp)} className={`min-w-0 rounded-xl px-3 py-2 text-left transition ${current ? "bg-violet-600 shadow-[0_8px_20px_rgb(124_58_237/25%)]" : selected ? "bg-violet-50 ring-1 ring-violet-200" : selectable ? "hover:bg-slate-50" : "cursor-not-allowed opacity-55"}`}>
            <div className="flex min-w-0 items-baseline gap-2">
              <span className={`shrink-0 text-xs font-bold ${current ? "text-white" : selected ? "text-violet-700" : completed ? "text-emerald-700" : "text-slate-400"}`}>{cp}</span>
              {goal && <span className={`min-w-0 truncate text-xs font-semibold ${current ? "text-white" : selected ? "text-slate-950" : "text-slate-500"}`}>{goal}</span>}
            </div>
            <div className={`mt-0.5 truncate text-[10px] ${current ? "font-semibold text-violet-100" : "text-slate-500"}`}>{current ? "Current CP" : completed ? "Completed" : "Upcoming"}</div>
          </button>;
      })}</div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
      <div className="flex flex-wrap gap-1.5">
        {visibleChannels.map(channel => {
          const channelItems = interactions.filter(item =>
            isChannelMessage(item) && item.channel === channel && belongsToCp(item, selectedCp, displayCurrentCp),
          );
          const count = channel === "Phone" && phoneTasks.length
            ? phoneTasks.length
            : channelItems.length;
          // Phone notifications represent calls that are waiting for an Account Manager
          // decision. Historical call events stay in the timeline, but must not keep the
          // channel marked after they are qualified or recalled.
          const needsReply = !loading && (channel === "Phone"
            ? channelItems.some(item => resolveReview(item.taskId)?.status === "Awaiting Review")
            : channelItems.some(item => inboundNeedsComposer(state, item, interactions)));
          const selected = channel === activeChannel;
          return <button key={channel} type="button" aria-pressed={selected} disabled={loading} onClick={() => setSelectedChannel(channel)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${selected ? "bg-violet-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"} ${loading ? "opacity-70" : ""}`}>
            <ChannelIcon channel={channel} className="size-4" alt=""/>
            {channel}
            <span className={`inline-flex items-center gap-1 ${selected ? "text-white/80" : "text-slate-400"}`}>
              {loading ? "…" : count}
              {needsReply ? (
                <span
                  className={`size-1.5 shrink-0 rounded-full ${selected ? "bg-rose-200" : "bg-rose-500"}`}
                  aria-label="Reply needed"
                />
              ) : null}
            </span>
          </button>;
        })}
      </div>
      {!callerPhoneOnly && bombsForCp.length > 0 && <Button size="sm" variant="outline" onClick={() => setBombOpen(true)}><Bomb className="mr-1.5 size-3.5"/>OmniReach execution plan</Button>}
    </div>

    {channelHeader && (!channelHeaderCp || selectedCp === channelHeaderCp) && <div className="px-5 pt-5">{channelHeader}</div>}
    {loading ? (
      <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
        <Spinner className="size-4 text-slate-400" />
        Loading {activeChannel} activity…
      </div>
    ) : usePhoneTaskBoard ? (
      <PhoneTaskBoard
        phoneTasks={phoneTasks}
        contacts={contacts}
        timeline={cpInteractions}
        showChannelTab={false}
        canReviewCalls={canReviewCalls}
        onPersistCallReview={onPersistCallReview}
        onRefreshQuo={onRefreshQuo}
        quoRefreshingCallId={quoRefreshingCallId}
        showDial={!!callerPhoneOnly}
        activeTaskId={activeTaskId}
        headerContactName={headerContactName}
        onSelectTask={onSelectTask}
        onCallOpening={onCallOpening}
        callerReviewTaskId={callerReviewTaskId}
        callerReviewHasConnectedCall={callerReviewHasConnectedCall}
        callerReviewCanSubmit={callerReviewCanSubmit}
        onSubmitCallerReview={onSubmitCallerReview}
        submittingCallerReview={submittingCallerReview}
        scriptsLoading={scriptsLoading}
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
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{instance.templateName} · V{instance.version}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {instance.cp && <Badge variant="outline" className="text-[10px]">{instance.cp}</Badge>}
                    <Badge className={instance.status === "Running" ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}>{instance.status}</Badge>
                    {instance.startedAt ? (
                      <span className="text-[11px] text-slate-500">{formatEasternDateTime(instance.startedAt)}</span>
                    ) : null}
                  </div>
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
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => void | Promise<void>;
}) {
  const [selectedThread, setSelectedThread] = useState<{ channel: Channel; key: string } | null>(null);
  const contactGroups = groupByContact(messages, contacts);
  const threads = groupByThread(messages);
  const activeThread = selectedThread?.channel === channel
    ? threads.find((thread) => threadKey(thread[0]!) === selectedThread.key)
    : undefined;

  if (channel !== "Phone") {
    if (!threads.length) {
      return <div className="px-5 py-10 text-center text-sm text-slate-400">No {channel} conversation recorded for this CP.</div>;
    }
    if (activeThread) {
      const contact = contacts.find((item) => item.id === activeThread[0]?.contactId);
      return (
        <ConversationDetail
          thread={activeThread}
          contact={contact}
          channel={channel}
          replyPool={messages}
          bombInstances={bombInstances}
          onBack={() => setSelectedThread(null)}
          onSend={onSend}
          onRefreshQuo={onRefreshQuo}
          quoRefreshingCallId={quoRefreshingCallId}
          resolveReview={resolveReview}
          canReviewCalls={canReviewCalls}
          reviewingTaskId={reviewingTaskId}
          onReviewCall={onReviewCall}
        />
      );
    }
    return <ConversationInbox threads={threads} contacts={contacts} channel={channel} onOpen={(thread) => setSelectedThread({ channel, key: threadKey(thread[0]!) })} />;
  }

  return <div className="w-full min-w-0">
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
    const leftTime = left.messages.reduce((latest, item) => Math.max(latest, interactionSortMs(item)), 0);
    const rightTime = right.messages.reduce((latest, item) => Math.max(latest, interactionSortMs(item)), 0);
    return rightTime - leftTime;
  });
}

function groupByThread(messages: Interaction[], order: "latest" | "oldest" = "latest") {
  const groups = new Map<string, Interaction[]>();
  for (const item of messages) {
    const key = threadKey(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()]
    .map(list => [...list].sort(compareInteractionSort))
    .sort((left, right) => {
      if (order === "oldest") return compareInteractionSort(left[0]!, right[0]!);

      // The inbox is driven by the final interaction. A cancelled final action is
      // retained for auditability but always stays below active conversations.
      const leftLatest = latestThreadInteraction(left);
      const rightLatest = latestThreadInteraction(right);
      const cancellationDelta = Number(isCancelledInteraction(leftLatest)) - Number(isCancelledInteraction(rightLatest));
      if (cancellationDelta) return cancellationDelta;
      return compareInteractionSort(rightLatest, leftLatest);
    });
}

function latestThreadInteraction(thread: Interaction[]) {
  return thread.at(-1)!;
}

function isCancelledInteraction(item: Interaction) {
  const status = outboundStatus(item);
  return status === "Cancelled" || status === "Canceled";
}

function inboxSubject(thread: Interaction[], channel: Channel) {
  const latest = latestThreadInteraction(thread);
  return emailSubjectLabel(latest)
    || (latest.title && latest.title !== channel && latest.title !== "Conversation" ? latest.title : null)
    || `${channel} conversation`;
}

function inboxActivityTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = getDisplayTimeZone();
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

/** The inbox always summarizes the conversation's final interaction. */
function inboxActivitySummary(item: Interaction) {
  const actualAt = item.recordedAt || interactionSortAt(item);
  if (item.direction === "Inbound") {
    return { status: "Received", time: actualAt ? inboxActivityTime(actualAt) : null };
  }

  const rawStatus = outboundStatus(item);
  const status = rawStatus === "Canceled" ? "Cancelled" : rawStatus;
  const scheduledAt = item.scheduledAt;
  const beforeSend = status === "Pending" || status === "In Progress" || (status === "Cancelled" && !item.recordedAt);
  const displayAt = beforeSend ? scheduledAt || actualAt : actualAt;
  const label = status === "Completed" ? "Sent" : status || "Updated";
  return {
    status: label,
    time: displayAt ? `${beforeSend && scheduledAt ? "Scheduled for " : ""}${inboxActivityTime(displayAt)}` : null,
  };
}

function ConversationInbox({
  threads,
  contacts,
  channel,
  onOpen,
}: {
  threads: Interaction[][];
  contacts: Contact[];
  channel: Channel;
  onOpen: (thread: Interaction[]) => void;
}) {
  const visibleThreads = threads.slice(0, 50);
  return (
    <section aria-label={`${channel} conversations`} className="w-full min-w-0">
      <div className="px-5 py-3 text-xs text-slate-500">
        {visibleThreads.length} of {threads.length} conversations
      </div>
      <div>
        {visibleThreads.map((thread) => {
          const latest = latestThreadInteraction(thread);
          const contact = contacts.find((item) => item.id === latest.contactId);
          const needsReply = thread.some((item) => item.direction === "Inbound" && item.replyStatus === "Needs Reply");
          const sender = contact?.name || "Contact not linked";
          const preview = latest.content?.replace(/\s+/g, " ").trim() || (latest.attachments?.length ? "Attachment" : "No message content");
          const latestSummary = inboxActivitySummary(latest);
          return (
            <button
              key={threadKey(thread[0]!)}
              type="button"
              onClick={() => onOpen(thread)}
              className={`flex min-h-20 w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50 ${needsReply ? "bg-violet-50/40" : ""}`}
            >
              {contact ? <Avatar className="mt-0.5 size-9 shrink-0"><AvatarFallback className="bg-slate-100 text-[10px] font-bold text-slate-700">{initials(contact.name)}</AvatarFallback></Avatar> : <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><UserRound className="size-4" /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className={`truncate text-sm ${needsReply ? "font-bold text-slate-950" : "font-medium text-slate-800"}`}>{sender}, me</span>
                  {thread.length > 1 ? <span className="shrink-0 text-xs text-slate-500">{thread.length}</span> : null}
                  <div className="ml-auto flex max-w-[58%] shrink items-center justify-end gap-1.5 text-right">
                    <SendStatusBadge status={latestSummary.status} />
                    {latestSummary.time ? <span className="min-w-0 text-[10px] leading-4 text-slate-500">{latestSummary.time}</span> : null}
                  </div>
                </div>
                <div className={`mt-1 truncate text-sm ${needsReply ? "font-semibold text-slate-900" : "text-slate-700"}`}>{inboxSubject(thread, channel)}</div>
                <p className="mt-1 truncate text-sm text-slate-500">{preview}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ConversationDetail({
  thread,
  contact,
  channel,
  replyPool,
  bombInstances,
  onBack,
  onSend,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
}: {
  thread: Interaction[];
  contact?: Contact;
  channel: Channel;
  replyPool: Interaction[];
  bombInstances: BombInstance[];
  onBack: () => void;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => void | Promise<void>;
}) {
  const [expandAll, setExpandAll] = useState(false);
  const endpoint = contact ? contactPoint(contact, channel) : undefined;
  return (
    <section aria-label={`${channel} conversation detail`} className="w-full min-w-0">
      <div className="flex items-center justify-between gap-2 px-5 py-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-slate-700" onClick={onBack}><ChevronLeft className="mr-1 size-4" />Back</Button>
        <span className="text-xs text-slate-500">{thread.length} {thread.length === 1 ? "message" : "messages"}</span>
        <Button variant="ghost" size="sm" className="-mr-2 text-slate-700" onClick={() => setExpandAll((value) => !value)}>{expandAll ? "Collapse all" : "Expand all"}</Button>
      </div>
      <div className="px-5 pb-5 pt-2">
        <h3 className="break-words text-base font-semibold text-slate-950">{inboxSubject(thread, channel)}</h3>
        {contact ? <p className="mt-1 truncate text-sm text-slate-500">{contact.name}{endpoint ? ` · ${endpoint}` : ""}</p> : null}
      </div>
      <div className="px-5 pb-5">
        <ThreadMessages thread={thread} replyPool={replyPool} contact={contact} channel={channel} endpoint={endpoint} bombInstances={bombInstances} collapseOlder expandAll={expandAll} onSend={onSend} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall} />
      </div>
    </section>
  );
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
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => void | Promise<void>;
}) {
  const endpoint = group.contact ? contactPoint(group.contact, channel) : undefined;
  const threads = groupByThread(group.messages, "oldest");
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
  collapseOlder = false,
  expandAll = false,
}: {
  thread: Interaction[];
  replyPool: Interaction[];
  contact?: Contact;
  channel: Channel;
  endpoint?: string;
  bombInstances: BombInstance[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string) => void | Promise<void>;
  collapseOlder?: boolean;
  expandAll?: boolean;
}) {
  const [recallTaskId, setRecallTaskId] = useState<string | null>(null);
  const [recallReason, setRecallReason] = useState("");
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [collapsedLatestIds, setCollapsedLatestIds] = useState<Set<string>>(() => new Set());
  const latestId = thread.at(-1)?.id;
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
      const scheduledAt = !phoneCall ? scheduledAtLabel(item) : null;
      const callReview = phoneCall ? resolveReview(item.taskId) : undefined;
      const emailSubject = emailSubjectLabel(item);
      const emailCc = emailCcLabel(item);
      const occurredAt = interactionSortAt(item);
      const messageBubbleClass = phoneCall
        ? "w-full min-w-0 overflow-hidden rounded-xl bg-slate-50 p-4"
        : `w-full min-w-0 max-w-[88%] overflow-hidden rounded-2xl p-4 ${inbound ? "rounded-tl-md bg-blue-50" : "rounded-tr-md bg-violet-50"}`;
      const initiallyExpanded = item.id === latestId;
      const expanded = !collapseOlder || expandAll || expandedMessageIds.has(item.id) || (initiallyExpanded && !collapsedLatestIds.has(item.id));
      const toggleExpanded = () => {
        if (!collapseOlder || expandAll) return;
        if (initiallyExpanded) {
          setCollapsedLatestIds((previous) => {
            const next = new Set(previous);
            if (expanded) next.add(item.id); else next.delete(item.id);
            return next;
          });
          return;
        }
        setExpandedMessageIds((previous) => {
          const next = new Set(previous);
          if (expanded) next.delete(item.id); else next.add(item.id);
          return next;
        });
      };
      return <article key={item.id} className={`flex min-w-0 ${phoneCall ? "" : inbound ? "justify-start" : "justify-end"}`}>
        <div className={messageBubbleClass}>
        <button type="button" onClick={toggleExpanded} className={`flex w-full flex-wrap items-start justify-between gap-2 text-left ${collapseOlder && !expandAll ? "cursor-pointer" : "cursor-default"}`} aria-expanded={expanded}>
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <div className="break-words text-xs font-semibold text-slate-900">{who}</div>
            {inbound && !phoneCall ? <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge> : <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>}
            {source ? <SourceBadge source={source} /> : null}
            {!inbound && !timing && (outboundStatus(item) ? <SendStatusBadge status={outboundStatus(item)!}/> : <Badge variant="outline" className="text-[10px] text-slate-500">No send status</Badge>)}
            {phoneCall && item.callResult ? <SendStatusBadge status={item.callResult}/> : null}
            {callReview ? <Badge className={callReview.status === "Qualified" ? "bg-emerald-100 text-[10px] text-emerald-800 hover:bg-emerald-100" : callReview.status === "Awaiting Review" ? "bg-amber-100 text-[10px] text-amber-900 hover:bg-amber-100" : "bg-rose-100 text-[10px] text-rose-800 hover:bg-rose-100"}>{callReview.status.toLowerCase()}</Badge> : null}
          </div>
          {occurredAt ? <time dateTime={occurredAt} className="font-mono text-[11px] text-slate-500">{formatEasternDateTime(occurredAt)}</time> : null}
        </button>
        {!expanded ? <><p className="mt-2 truncate text-sm text-slate-500">{item.content || (item.attachments?.length ? "Attachment" : "No message content")}</p>{timing ? <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-500"><SendStatusBadge status={timing.label} />{scheduledAt ? <span className="truncate">{scheduledAt}</span> : null}</div> : null}</> : <>
        {timing && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <SendStatusBadge status={timing.label} />
            {scheduledAt ? <time dateTime={item.scheduledAt} className="truncate font-mono text-[11px]">{scheduledAt}</time> : timing.at ? <time dateTime={timing.at} className="font-mono text-[11px]">{formatEasternDateTime(timing.at)}</time> : null}
          </div>
        )}
        {!item.quo && (
          <div className="mt-2 space-y-1">
            {emailSubject && (
              <p className="break-words text-sm text-slate-900">
                <span className="font-medium text-slate-500">Subject:</span> {emailSubject}
              </p>
            )}
            {emailCc && (
              <p className="break-words text-sm text-slate-900">
                <span className="font-medium text-slate-500">CC:</span> {emailCc}
              </p>
            )}
            {item.content ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content}</p> : null}
            {item.attachments?.length ? (
              <div className="pt-1">
                <ThreadMedia attachments={item.attachments} />
              </div>
            ) : null}
          </div>
        )}
        {item.quo ? <div className="mt-3">
          <QuoCallPanel
            compact
            data={item.quo}
            refreshing={quoRefreshingCallId === callId}
            onRefresh={canRefresh ? () => onRefreshQuo?.(callId!) : undefined}
          />
        </div> : null}
        {phoneCall && item.quo && canReviewCalls && callReview?.status === "Awaiting Review" ? recallTaskId === (item.taskId || item.id) ? <div className="mt-4"><UnqualifiedRecallForm reason={recallReason} onReason={setRecallReason} confirming={reviewingTaskId===item.taskId} onCancel={() => { setRecallTaskId(null); setRecallReason(""); }} onConfirm={() => { void Promise.resolve(onReviewCall(item.id, item.taskId, "Unqualified", recallReason.trim())).then(() => { setRecallTaskId(null); setRecallReason(""); }); }}/></div> : <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={reviewingTaskId===item.taskId} onClick={() => void onReviewCall(item.id, item.taskId, "Qualified")}><CheckCircle2 className="mr-1.5 size-3.5"/>{reviewingTaskId===item.taskId?"Saving…":"Mark as Qualified"}</Button><Button size="sm" className="bg-rose-600 text-white hover:bg-rose-700" disabled={reviewingTaskId===item.taskId} onClick={() => { setRecallTaskId(item.taskId || item.id); setRecallReason(""); }}><RotateCcw className="mr-1.5 size-3.5"/>Unqualified & Recall</Button></div> : null}
        </>}
        {/* Keep Needs Reply composer visible even when older bubbles are collapsed
            (e.g. a newer OmniReach Pending message became the thread "latest"). */}
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
        </div>
      </article>;
    })}
  </div>;
}
