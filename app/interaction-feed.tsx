"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bomb, CheckCheck, CheckCircle2, ChevronLeft, MailOpen, Reply, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import type { CallReviewRound } from "@/lib/call-review-history";
import { callerSubmittedPhoneCallIds, callReviewsFromTasks, type CallReviewResolution, type CallReviewStatus } from "@/lib/call-review-metadata";
import { getDisplayTimeZone } from "@/lib/display-time";
import { BombInstance, Channel, Contact, CPCode, CP_CODES, Interaction, ScheduledAction, compareInteractionSort, interactionSortAt, interactionSortMs } from "@/lib/outreach-domain";
import { BombExecutionPlan, formatEasternDateTime } from "./bomb-plan";
import { BrandReplyBox, ThreadSendBox, inboundNeedsComposer } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { PhoneTaskBoard, UnqualifiedReviewDialog, type QuoDialOpening } from "./phone-task-board";
import { QuoCallPanel } from "./quo-call-panel";
import { useWorkspace } from "./workspace-store";
import { MessageMediaPreview, MessageMediaThumbnails } from "./message-media";
import { EmailHtmlBody } from "./email-html-body";
import { htmlToPlainText, looksLikeEmailHtml } from "@/lib/email-html";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useSignals } from "./signals-store";
import { EmailOpenActivity } from "./brand-detail-signals";
import type { SignalEvent, SignalsPayload } from "@/lib/signals/model";
import { emailSignalMatchesInteraction } from "@/lib/signals/match";

const CHANNELS: Channel[] = ["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"];

function emailEventsFor(item: Interaction, data: SignalsPayload | null): SignalEvent[] {
  return (data?.brands.find(brand=>brand.id===item.customerId)?.events||[]).filter(event=>emailSignalMatchesInteraction(event,item));
}
function emailOpenSummary(events: SignalEvent[]) {
  if(!events.length)return null;
  const latest=events.reduce((a,b)=>Date.parse(a.detectedAt)>Date.parse(b.detectedAt)?a:b);
  return <span className="inline-flex items-center gap-1 text-[#B45309]"><MailOpen className="size-3"/>Open detected · Last detected {inboxActivityTime(latest.detectedAt)}</span>;
}

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

function sourceLabel(item: Interaction): string {
  if (item.bombInstanceId || item.creationMethod === "Automated") return "OmniReach";
  return "Human";
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

function messagePreviewText(item: Interaction) {
  if (!item.content?.trim()) return item.attachments?.length ? "Attachment" : "No message content";
  if (item.channel === "Email" && looksLikeEmailHtml(item.content)) {
    return htmlToPlainText(item.content) || (item.attachments?.length ? "Attachment" : "No message content");
  }
  return item.content.replace(/\s+/g, " ").trim();
}

function activityTimelineSummary(item: Interaction) {
  const channel = item.channel || "Message";
  const title = item.title?.trim();
  const subject = emailSubjectLabel(item);
  if (subject) return subject;
  if (channel === "Phone" && item.callResult) return `Call · ${item.callResult}`;
  if (title && title !== channel && title !== "Conversation") return title;
  const preview = messagePreviewText(item);
  if (preview !== "No message content") return preview;
  return item.direction === "Inbound" ? `${channel} reply received` : `${channel} sent`;
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
  onCancelPending,
  initialChannel,
  showAllChannels = false,
  showCpSelector = true,
  initialCp,
  focusedInteractionId,
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
  highlightedCallId,
  headerContactName,
  onSelectTask,
  onCallOpening,
  callerReviewTaskId,
  callerReviewHasConnectedCall = false,
  callerReviewCanSubmit = false,
  onSubmitCallerReview,
  submittingCallerReview = false,
  scriptsLoading = false,
  onMarkReplyRead,
}: {
  interactions: Interaction[];
  contacts: Contact[];
  customerId?: string;
  currentCp?: CPCode;
  cpGoals?: Partial<Record<CPCode, string>>;
  maxHeight?: string;
  bombInstances?: BombInstance[];
  actions?: ScheduledAction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, scheduledAt?: string, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelBomb?: (instance: BombInstance) => Promise<void>;
  onCancelPending?: (taskId: string) => Promise<void>;
  initialChannel?: Channel;
  showAllChannels?: boolean;
  showCpSelector?: boolean;
  initialCp?: CPCode;
  focusedInteractionId?: string;
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
  onPersistCallReview?: (taskId: string, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => Promise<void>;
  loading?: boolean;
  activeTaskId?: string | null;
  highlightedCallId?: string | null;
  headerContactName?: string;
  onSelectTask?: (taskId: string) => void;
  onCallOpening?: (info: QuoDialOpening) => void;
  callerReviewTaskId?: string | null;
  callerReviewHasConnectedCall?: boolean;
  callerReviewCanSubmit?: boolean;
  onSubmitCallerReview?: (callId: string, note?: string) => void | Promise<void>;
  submittingCallerReview?: boolean;
  scriptsLoading?: boolean;
  onMarkReplyRead?: (interactionId: string) => Promise<void>;
}) {
  const { state } = useWorkspace();
  const notionReviews = callReviewsFromTasks(tasks);
  const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);
  const resolveReview = (taskId?: string | null) => {
    if (!taskId) return undefined;
    return notionReviews[taskId];
  };
  const handleReviewCall = async (_interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => {
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
      await onPersistCallReview(taskId, status, reviewReason, reviewNote, resolution);
      toast.success(status === "Qualified" ? "Call marked as qualified" : resolution === "Stop task" ? "Call marked as unqualified and task stopped" : "Call marked as unqualified and recalled for Beril");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save call review");
    } finally {
      setReviewingTaskId(null);
    }
  };
  const customerId = customerIdProp || interactions[0]?.customerId;
  const customer = state.customers.find(item => item.id === customerId);
  const currentCp = currentCpProp || customer?.cp || "CP1";
  const [selectedChannel, setSelectedChannel] = useState<Channel | "All">(callerPhoneOnly ? "Phone" : initialChannel || (showAllChannels ? "All" : "Email"));
  const [bombOpen, setBombOpen] = useState(false);
  const [cancellingBombId, setCancellingBombId] = useState<string | null>(null);
  const visibleCps = CP_CODES;
  const selectedInitialCp = initialCp || currentCp;
  const selectedCpIsVisible = visibleCps.includes(selectedInitialCp as (typeof visibleCps)[number]);
  const [selectedCp, setSelectedCp] = useState<CPCode>(selectedCpIsVisible ? selectedInitialCp : visibleCps[visibleCps.length - 1]);
  const displayCurrentCp = visibleCps.includes(currentCp as (typeof visibleCps)[number])
    ? currentCp
    : visibleCps[0];
  const currentIndex = currentCp === "Nurture"
    ? visibleCps.length - 1
    : visibleCps.indexOf(displayCurrentCp as (typeof visibleCps)[number]);
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
  const submittedPhoneCallIds = callerSubmittedPhoneCallIds(tasks);
  const allChannelMessages = cpInteractions.filter((item) =>
    isChannelMessage(item)
    && (item.channel !== "Phone" || (!!item.quo?.callId && submittedPhoneCallIds.has(item.quo.callId))),
  );
  const planState = bombInstances ? { ...state, bombInstances, actions: actions ?? [], interactions: cpInteractions } : state;
  const activeChannel = callerPhoneOnly ? "Phone" : selectedChannel;
  const visibleChannels: Channel[] = callerPhoneOnly ? ["Phone"] : CHANNELS;
  const channelMessages = activeChannel === "All"
    ? allChannelMessages
    : cpInteractions.filter((item) => isChannelMessage(item) && item.channel === activeChannel);
  // Newest OmniReach launch first (startedAt = creation/launch time).
  const bombsForCp = planState.bombInstances
    .filter(item => item.customerId === customerId && item.cp === selectedCp)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  const usePhoneTaskBoard = activeChannel === "Phone" && (callerPhoneOnly || phoneTasks.length > 0);
  const cpLabel = (cp: CPCode) => {
    const name = cpGoals?.[cp] || state.cps.find(item => item.code === cp)?.goal;
    return name ? `${cp} · ${name}` : cp;
  };

  return <div className={`w-full min-w-0 ${maxHeight ? `${maxHeight} overflow-y-auto` : ""}`}>
    {showCpSelector && <div className="flex min-w-0 items-center px-5 py-3">
      <Select value={selectedCp} onValueChange={(value)=>setSelectedCp(value as CPCode)}>
        <SelectTrigger size="sm" aria-label="View conversations by CP" className="w-full max-w-lg sm:w-auto sm:min-w-72"><SelectValue/></SelectTrigger>
        <SelectContent>{visibleCps.map((cp,index)=><SelectItem key={cp} value={cp} disabled={index>currentIndex}>{cpLabel(cp)}</SelectItem>)}</SelectContent>
      </Select>
    </div>}

    <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${showCpSelector ? "border-t border-slate-200" : ""}`}>
      <div className="flex flex-wrap gap-1.5">
        {showAllChannels && !callerPhoneOnly && <button type="button" aria-pressed={activeChannel === "All"} disabled={loading} onClick={() => setSelectedChannel("All")} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${activeChannel === "All" ? "bg-violet-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"} ${loading ? "opacity-70" : ""}`}>
          All
          <span className={activeChannel === "All" ? "text-white/80" : "text-slate-400"}>{loading ? "…" : allChannelMessages.length}</span>
        </button>}
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
      {!callerPhoneOnly && bombsForCp.length > 0 && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setBombOpen(true)}><Bomb className="mr-1.5 size-3.5"/>OmniReach execution plan</Button>}
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
        highlightedCallId={highlightedCallId}
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
      key={`${selectedCp}-${activeChannel}`}
      messages={channelMessages}
      contacts={contacts}
      channel={activeChannel}
      onSend={onSend}
     
      onCancelPending={onCancelPending}
      onRefreshQuo={onRefreshQuo}
      quoRefreshingCallId={quoRefreshingCallId}
      resolveReview={resolveReview}
      canReviewCalls={canReviewCalls}
      reviewingTaskId={reviewingTaskId}
      onReviewCall={handleReviewCall}
      onMarkReplyRead={onMarkReplyRead}
      focusedInteractionId={focusedInteractionId}
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
  onSend,
  onCancelPending,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
  onMarkReplyRead,
  focusedInteractionId,
}: {
  messages: Interaction[];
  contacts: Contact[];
  channel: Channel | "All";
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, scheduledAt?: string, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelPending?: (taskId: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => void | Promise<void>;
  onMarkReplyRead?: (interactionId: string) => Promise<void>;
  focusedInteractionId?: string;
}) {
  const [selectedThread, setSelectedThread] = useState<{ channel: Channel; key: string; interactionId?: string } | null>(null);
  const focused=messages.find(item=>item.id===focusedInteractionId);
  const focusedKey=focused?threadKey(focused):null;
  useEffect(()=>{
    if(!focusedInteractionId||!focused?.channel||!focusedKey)return;
    const timer=setTimeout(()=>setSelectedThread({channel:focused.channel!,key:focusedKey,interactionId:focused.id}),0);
    return ()=>clearTimeout(timer);
  },[focusedInteractionId,focused?.id,focused?.channel,focusedKey]);
  const contactGroups = groupByContact(messages, contacts);
  const threads = groupByThread(messages);
  const activeThread = selectedThread && (channel === "All" || selectedThread.channel === channel)
    ? groupByThread(messages.filter((item) => item.channel === selectedThread.channel)).find((thread) => threadKey(thread[0]!) === selectedThread.key)
    : undefined;

  if (activeThread && selectedThread) {
      const contact = contacts.find((item) => item.id === activeThread[0]?.contactId);
      return (
        <ConversationDetail
          thread={activeThread}
          contact={contact}
          contacts={contacts}
          channel={selectedThread.channel}
          focusedInteractionId={selectedThread.interactionId}
          replyPool={messages}
          onBack={() => setSelectedThread(null)}
          onSend={onSend}
          onCancelPending={onCancelPending}
          onRefreshQuo={onRefreshQuo}
          quoRefreshingCallId={quoRefreshingCallId}
          resolveReview={resolveReview}
          canReviewCalls={canReviewCalls}
          reviewingTaskId={reviewingTaskId}
          onReviewCall={onReviewCall}
          onMarkReplyRead={onMarkReplyRead}
        />
      );
  }

  if (channel === "All") {
    return <section aria-label="All channel activity" className="w-full min-w-0 px-5 py-5">
      {!messages.length ? <div className="py-5 text-center text-sm text-slate-400">No conversation recorded for this CP.</div> : <ActivityTimeline items={[...messages].sort((left, right) => compareInteractionSort(right, left))} onOpen={(item) => setSelectedThread({channel: item.channel!, key: threadKey(item), interactionId: item.id})} />}
    </section>;
  }

  if (channel !== "Phone") {
    if (!threads.length) {
      return <div className="px-5 py-10 text-center text-sm text-slate-400">No {channel} conversation recorded for this CP.</div>;
    }
    return <ConversationInbox threads={threads} contacts={contacts} channel={channel} onOpen={(thread) => setSelectedThread({ channel, key: threadKey(thread[0]!) })} />;
  }

  return <div className="w-full min-w-0">
    {!contactGroups.length ? (
      <div className="px-5 py-10 text-center text-sm text-slate-400">No {channel} conversation recorded for this CP.</div>
    ) : (
      <div className="divide-y">
        {contactGroups.map(group => (
          <ContactThreads key={group.contact?.id || "unknown"} group={group} replyPool={messages} channel={channel} onSend={onSend} onCancelPending={onCancelPending} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall} onMarkReplyRead={onMarkReplyRead}/>
        ))}
      </div>
    )}
  </div>;
}

export function ActivityTimeline({ items, onOpen, formatTime = formatEasternDateTime, showEmailOpens = true }: { items: Interaction[]; onOpen?: (item: Interaction) => void; formatTime?: (value: string) => string; showEmailOpens?: boolean }) {
  const {data:signalData}=useSignals();
  return <ol className="relative space-y-1 before:pointer-events-none before:absolute before:bottom-3 before:left-[11px] before:top-3 before:z-0 before:w-px before:bg-slate-300/80">
    {items.map((item) => {
      const channel = item.channel || "Email";
      const occurredAt = interactionSortAt(item);
      const direction = item.direction === "Inbound" ? "Reply" : item.direction === "Outbound" ? "Sent" : "Activity";
      const source = sourceLabel(item);
      const content = <>
        <span className="absolute left-0 top-4 z-10 grid size-6 place-items-center rounded-full border border-slate-200/80 bg-white/90 text-muted-foreground ring-4 ring-white/80">
          <ChannelIcon channel={channel} className="size-3.5" alt="" />
        </span>
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-foreground">{activityTimelineSummary(item)}</p>
            {source ? <SourceBadge source={source} /> : null}
          </div>
          {occurredAt ? <time dateTime={occurredAt} title={new Date(occurredAt).toLocaleString()} className="shrink-0 text-[11px] text-muted-foreground">{formatTime(occurredAt)}</time> : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{channel} · {direction}</p>
        {showEmailOpens&&emailEventsFor(item,signalData).length?<p className="mt-0.5 text-xs">{emailOpenSummary(emailEventsFor(item,signalData))}</p>:null}
      </>;
      return <li key={item.id} className="relative min-w-0">
        {onOpen ? <button type="button" onClick={() => onOpen(item)} className="relative block w-full min-w-0 rounded-lg py-2 pl-8 pr-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" aria-label={`Open ${channel} activity: ${activityTimelineSummary(item)}${occurredAt ? ` · ${formatTime(occurredAt)}` : ""}`}>{content}</button>
          : <div className="relative block w-full min-w-0 py-2 pl-8 pr-2 text-left">{content}</div>}
      </li>;
    })}
  </ol>;
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

function groupByThread(messages: Interaction[]) {
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
      const leftLatest = latestThreadInteraction(left);
      const rightLatest = latestThreadInteraction(right);
      return compareInteractionSort(rightLatest, leftLatest);
    });
}

function latestThreadInteraction(thread: Interaction[]) {
  return thread.at(-1)!;
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
  const {data:signalData}=useSignals();
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
          const preview = messagePreviewText(latest);
          const latestSummary = inboxActivitySummary(latest);
          const opens=thread.flatMap(item=>emailEventsFor(item,signalData));
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
                {opens.length?<p className="mt-1 text-xs">{emailOpenSummary(opens)}</p>:null}
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
  contacts,
  channel,
  replyPool,
  onBack,
  onSend,
  onCancelPending,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
  onMarkReplyRead,
  focusedInteractionId,
}: {
  thread: Interaction[];
  contact?: Contact;
  contacts: Contact[];
  channel: Channel;
  replyPool: Interaction[];
  onBack: () => void;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, scheduledAt?: string, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelPending?: (taskId: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => void | Promise<void>;
  onMarkReplyRead?: (interactionId: string) => Promise<void>;
  focusedInteractionId?: string;
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
        <ThreadMessages thread={thread} replyPool={replyPool} contact={contact} contacts={contacts} channel={channel} endpoint={endpoint} collapseOlder expandAll={expandAll} focusedInteractionId={focusedInteractionId} onSend={onSend} onCancelPending={onCancelPending} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall} onMarkReplyRead={onMarkReplyRead} />
      </div>
      {channel === "Email" ? (
        <ThreadSendBox
          customerId={thread[0]!.customerId}
          channel={channel}
          contact={contact}
          contacts={contacts}
          thread={thread}
          interactions={replyPool}
          onSend={onSend}
        />
      ) : null}
    </section>
  );
}

function ContactThreads({
  group,
  replyPool,
  channel,
  onSend,
  onCancelPending,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
  onMarkReplyRead,
}: {
  group: { contact?: Contact; messages: Interaction[] };
  replyPool: Interaction[];
  channel: Channel;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, scheduledAt?: string, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelPending?: (taskId: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => void | Promise<void>;
  onMarkReplyRead?: (interactionId: string) => Promise<void>;
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
        <ThreadMessages key={threadKey(thread[0])} thread={thread} replyPool={replyPool} contact={group.contact} channel={channel} endpoint={endpoint} onSend={onSend} onCancelPending={onCancelPending} onRefreshQuo={onRefreshQuo} quoRefreshingCallId={quoRefreshingCallId} resolveReview={resolveReview} canReviewCalls={canReviewCalls} reviewingTaskId={reviewingTaskId} onReviewCall={onReviewCall} onMarkReplyRead={onMarkReplyRead}/>
      ))}
    </div>
  </section>;
}

function ThreadMessages({
  thread,
  replyPool,
  contact,
  contacts,
  channel,
  endpoint,
  onSend,
  onCancelPending,
  onRefreshQuo,
  quoRefreshingCallId,
  resolveReview,
  canReviewCalls,
  reviewingTaskId,
  onReviewCall,
  onMarkReplyRead,
  collapseOlder = false,
  expandAll = false,
  showChannelLabel = false,
  focusedInteractionId,
}: {
  thread: Interaction[];
  replyPool: Interaction[];
  contact?: Contact;
  contacts?: Contact[];
  channel?: Channel;
  endpoint?: string;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string, deliveryMode?: import("./send-timing-toggle").DeliveryMode, scheduledAt?: string, attachments?: import("@/lib/media-attachments").MediaAttachment[], cc?: string) => Promise<void>;
  onCancelPending?: (taskId: string) => Promise<void>;
  onRefreshQuo?: (callId: string) => void;
  quoRefreshingCallId?: string | null;
  resolveReview: (taskId?: string | null) => { status: CallReviewStatus; recallRequested?: boolean } | undefined;
  canReviewCalls: boolean;
  reviewingTaskId: string | null;
  onReviewCall: (interactionId: string, taskId: string | undefined, status: CallReviewStatus, reviewReason?: string, reviewNote?: string, resolution?: CallReviewResolution) => void | Promise<void>;
  onMarkReplyRead?: (interactionId: string) => Promise<void>;
  collapseOlder?: boolean;
  expandAll?: boolean;
  showChannelLabel?: boolean;
  focusedInteractionId?: string;
}) {
  const {data:signalData,settle:settleSignals}=useSignals();
  const [recallTaskId, setRecallTaskId] = useState<string | null>(null);
  const [recallReason, setRecallReason] = useState("");
  const [recallResolution, setRecallResolution] = useState<CallReviewResolution>("Recall");
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [collapsedLatestIds, setCollapsedLatestIds] = useState<Set<string>>(() => new Set());
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = useState<string | null>(null);
  const [replyOpenIds, setReplyOpenIds] = useState<Set<string>>(() => new Set());
  const focusedMessageRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusedInteractionId) focusedMessageRef.current?.scrollIntoView({block: "center", behavior: "smooth"});
  }, [focusedInteractionId]);
  const latestId = focusedInteractionId || thread.at(-1)?.id;
  return <div className="space-y-3">
    {[...thread].reverse().map(item => {
      const signalBrand=signalData?.brands.find(brand=>brand.id===item.customerId);
      const emailOpens=emailEventsFor(item,signalData);
      const readEmailOpens=(ids:string[])=>{
        if(!signalBrand||signalData?.readOnly||!ids.length)return;
        const snapshot=[...new Set([...(signalBrand.readEventIds||[]),...ids])];
        void fetch(`/api/signals/${encodeURIComponent(item.customerId)}`,{
          method:"PATCH",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"read",eventIds:snapshot}),
        }).then(response=>{if(response.ok)settleSignals(item.customerId,snapshot);}).catch(()=>{});
      };
      const itemChannel = channel || item.channel || "Email";
      const inbound = item.direction === "Inbound";
      const source = sourceLabel(item);
      const phoneCall = itemChannel === "Phone";
      const itemContact = (item.contactId && contacts?.find((person) => person.id === item.contactId)) || contact;
      const itemEndpoint = itemContact ? contactPoint(itemContact, itemChannel) : endpoint;
      const who = inbound
        ? phoneCall
          ? `${itemEndpoint || itemContact?.name || "Contact"} call`
          : `${itemEndpoint || itemContact?.name || "Contact"} Reply`
        : `To ${itemEndpoint || itemContact?.name || "Contact"}`;
      const callId = item.quo?.callId;
      const canRefresh = !!callId && !callId.startsWith("ACsim") && !!onRefreshQuo;
      const timing = !inbound && !phoneCall ? deliveryTiming(item) : null;
      const scheduledAt = !phoneCall ? scheduledAtLabel(item) : null;
      const callReview = phoneCall ? resolveReview(item.taskId) : undefined;
      const emailSubject = emailSubjectLabel(item);
      const emailCc = emailCcLabel(item);
      const occurredAt = interactionSortAt(item);
      const sendStatus = outboundStatus(item);
      const canCancelPending = !inbound && !!item.taskId && sendStatus === "Pending" && !!onCancelPending;
      const cancelPendingButton = canCancelPending ? (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            disabled={cancellingTaskId === item.taskId}
            onClick={(event) => {
              event.stopPropagation();
              if (!item.taskId || !onCancelPending) return;
              if (!window.confirm("Cancel this pending message? It will not be sent.")) return;
              setCancellingTaskId(item.taskId);
              void onCancelPending(item.taskId)
                .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to cancel"))
                .finally(() => setCancellingTaskId(null));
            }}
          >
            {cancellingTaskId === item.taskId ? "Cancelling…" : "Cancel"}
          </Button>
        </div>
      ) : null;
      const messageBubbleClass = phoneCall
        ? "w-full min-w-0 overflow-hidden rounded-xl bg-slate-50 p-4"
        : `w-full min-w-0 max-w-[88%] overflow-hidden rounded-2xl p-4 ${inbound ? "rounded-tl-md bg-blue-50" : "rounded-tr-md bg-violet-50"}`;
      const initiallyExpanded = item.id === latestId;
      const expanded = !collapseOlder || expandAll || expandedMessageIds.has(item.id) || (initiallyExpanded && !collapsedLatestIds.has(item.id));
      const toggleExpanded = () => {
        if (!collapseOlder || expandAll) return;
        if(!expanded&&emailOpens.length)readEmailOpens(emailOpens.map(event=>event.id));
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
      return <article key={item.id} ref={item.id === focusedInteractionId ? focusedMessageRef : undefined} data-interaction-id={item.id} className={`flex min-w-0 ${phoneCall ? "" : inbound ? "justify-start" : "justify-end"}`}>
        <div className={messageBubbleClass}>
        <button type="button" onClick={toggleExpanded} className={`flex w-full flex-wrap items-start justify-between gap-2 text-left ${collapseOlder && !expandAll ? "cursor-pointer" : "cursor-default"}`} aria-expanded={expanded}>
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            {showChannelLabel && <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><ChannelIcon channel={itemChannel} className="size-3.5" alt=""/>{itemChannel}</span>}
            <div className="break-words text-xs font-semibold text-slate-900">{who}</div>
            {inbound && !phoneCall ? <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge> : <Badge variant="secondary" className="text-[10px]">{item.direction || "Outbound"}</Badge>}
            {source ? <SourceBadge source={source} /> : null}
            {!inbound && !timing && (sendStatus ? <SendStatusBadge status={sendStatus}/> : <Badge variant="outline" className="text-[10px] text-slate-500">No send status</Badge>)}
            {phoneCall && item.callResult ? <SendStatusBadge status={item.callResult}/> : null}
            {callReview ? <Badge className={callReview.status === "Qualified" ? "bg-emerald-100 text-[10px] text-emerald-800 hover:bg-emerald-100" : callReview.status === "Awaiting Review" ? "bg-amber-100 text-[10px] text-amber-900 hover:bg-amber-100" : "bg-rose-100 text-[10px] text-rose-800 hover:bg-rose-100"}>{callReview.status.toLowerCase()}</Badge> : null}
          </div>
          {occurredAt ? <time dateTime={occurredAt} className="font-mono text-[11px] text-slate-500">{formatEasternDateTime(occurredAt)}</time> : null}
        </button>
        <EmailOpenActivity events={emailOpens} readIds={signalBrand?.readEventIds||[]} expanded={expanded} onRead={readEmailOpens}/>
        {!expanded ? <>{emailSubject?<p className="mt-2 truncate text-sm font-medium text-slate-800">{emailSubject}</p>:null}<p className="mt-1 truncate text-sm text-slate-500">{messagePreviewText(item)}</p>{timing ? <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-500"><SendStatusBadge status={timing.label} />{scheduledAt ? <span className="truncate">{scheduledAt}</span> : null}</div> : null}{cancelPendingButton}</> : <>
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
            {item.content ? (
              item.channel === "Email" ? (
                <EmailHtmlBody html={item.content} />
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.content}</p>
              )
            ) : null}
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
        {cancelPendingButton}
        {inbound && !phoneCall && item.replyStatus === "Needs Reply" && onMarkReplyRead ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className={replyOpenIds.has(item.id)
                ? "!border-emerald-300 !bg-emerald-200 !text-black shadow-sm ring-2 ring-emerald-200 hover:!bg-emerald-300 hover:!text-black"
                : "!border-emerald-300 !bg-emerald-100 !text-black hover:!bg-emerald-200 hover:!text-black"}
              aria-pressed={replyOpenIds.has(item.id)}
              onClick={(event) => {
                event.stopPropagation();
                setReplyOpenIds((previous) => {
                  const next = new Set(previous);
                  next.add(item.id);
                  return next;
                });
              }}
            >
              <Reply className="mr-1.5 size-3.5" />
              Reply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="!border-slate-300 !bg-slate-100 !text-black hover:!bg-slate-200 hover:!text-black"
              disabled={markingReadId === item.id}
              onClick={(event) => {
                event.stopPropagation();
                setMarkingReadId(item.id);
                void onMarkReplyRead(item.id)
                  .then(() => toast.success("Reply marked as read"))
                  .catch((error) => toast.error(error instanceof Error ? error.message : "Unable to mark reply as read"))
                  .finally(() => setMarkingReadId(null));
              }}
            >
              <CheckCheck className="mr-1.5 size-3.5" />
              {markingReadId === item.id ? "Saving…" : "Mark as read"}
            </Button>
          </div>
        ) : null}
        {phoneCall && item.quo && canReviewCalls && callReview?.status === "Awaiting Review" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="review-qualified-button bg-emerald-600 text-white hover:bg-emerald-700" disabled={reviewingTaskId===item.taskId} onClick={() => void onReviewCall(item.id, item.taskId, "Qualified")}>
              <CheckCircle2 className="mr-1.5 size-3.5"/>{reviewingTaskId===item.taskId ? "Saving…" : "Mark as Qualified"}
            </Button>
            <Button size="sm" className="review-unqualified-button bg-rose-600 text-white hover:bg-rose-700" disabled={reviewingTaskId===item.taskId} onClick={() => { setRecallTaskId(item.taskId || item.id); setRecallReason(""); setRecallResolution("Recall"); }}>
              <RotateCcw className="mr-1.5 size-3.5"/>Unqualified
            </Button>
            <UnqualifiedReviewDialog
              open={recallTaskId === (item.taskId || item.id)}
              onOpenChange={(open) => { setRecallTaskId(open ? (item.taskId || item.id) : null); if (!open) { setRecallReason(""); setRecallResolution("Recall"); } }}
              note={recallReason}
              onNote={setRecallReason}
              resolution={recallResolution}
              onResolution={setRecallResolution}
              confirming={reviewingTaskId===item.taskId}
              onConfirm={(resolution, note) => { void Promise.resolve(onReviewCall(item.id, item.taskId, "Unqualified", note, note, resolution)).then(() => { setRecallTaskId(null); setRecallReason(""); setRecallResolution("Recall"); }); }}
            />
          </div>
        ) : null}
        </>}
        {/* Keep Needs Reply composer visible even when older bubbles are collapsed
            (e.g. a newer OmniReach Pending message became the thread "latest"). */}
        {inbound && !phoneCall && itemContact && (
          <BrandReplyBox
            customerId={item.customerId}
            interaction={item}
            bombInstanceId={item.bombInstanceId}
            contacts={[itemContact]}
            interactions={replyPool}
            taskId={item.taskId}
            onSend={onSend}
            open={replyOpenIds.has(item.id)}
           
          />
        )}
        </div>
      </article>;
    })}
  </div>;
}
