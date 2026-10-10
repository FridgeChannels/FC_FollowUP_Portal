/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Bomb, ChevronRight, CircleAlert, CircleCheck, CirclePause, ContactRound, ExternalLink, FileText, History, Loader2, MessageSquareText, MoreHorizontal, PanelRightClose, Plus, Search, Send, StickyNote, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import { cacheBrandItem, getCachedBrand, requestBrandListPageRefresh } from "@/lib/brand-list-cache";
import { currentCpOption, FOLLOW_UP_STATUSES, keyPersonNotionUrl, listCurrentCps, type BrandActivity, type BrandAiMeetingLink, type BrandContact, type BrandDetail, type BrandMeetingNote, type BrandTask, type CurrentCpOption } from "@/lib/brand-list";
import type { BombDetail, BombListItem } from "@/lib/bomb-list";
import { ActionStatus, BombInstance, Channel, Contact, CPCode, Customer, dateOnly, Interaction, ScheduledAction, WorkspaceState, compareInteractionSort, interactionCpCode, uid } from "@/lib/outreach-domain";
import { brandDetailMetadata } from "@/lib/page-metadata";
import { usePageMetadata } from "./use-page-metadata";
import { BombExecutionPlan, formatEasternDateTime } from "./bomb-plan";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EmailBodyEditor } from "./email-body-editor";
import { emailBodyIsEmpty } from "@/lib/email-html";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InteractionFeed } from "./interaction-feed";
import { ChannelIcon, ChannelOption } from "./channel-icon";
import { easternDateTimeLocalToIso } from "@/lib/scheduling-engine/calendar";
import { SendTimingToggle, type DeliveryMode } from "./send-timing-toggle";
import { BrandNote } from "./brand-note";
import { MessageMediaInputFrame, useMessageMedia } from "./message-media";
import type { MediaAttachment } from "@/lib/media-attachments";
import { buildTemplateVariableContext, ownerNameFromContacts, resolveLaunchStepCopy } from "@/lib/template-variables";
import { brandHasActiveOmniReach } from "@/lib/notion/reply-inbox";
import { buildInteractionCpFallbacks, resolveInteractionDisplayCp } from "@/lib/interaction-cp";
import { channelAvailable } from "@/lib/channel-availability";
import { CHANNEL_TYPES, resolveChannelType, type ChannelType } from "@/lib/sample-product";
import { cn } from "@/lib/utils";
import { useSignals } from "./signals-store";
import { BrandProfileFields, ImportantSignalsPanel, LinkedInUpdates, SignalHistoryPanel } from "./brand-detail-signals";
import type { MagnetBrandParam } from "@/lib/sample/magnet";
import type { SignalEvent } from "@/lib/signals/model";
import { emailSignalMatchesInteraction } from "@/lib/signals/match";
import { MOCK_PETER_SIGNAL_BRAND_ID } from "@/lib/signals/mock";
import { withoutBrandAssignmentRecords } from "@/lib/brand-assignment";

const show=(r:{ok:boolean;message:string})=>r.ok?toast.success(r.message):toast.error(r.message);
const hasCjk=(value?:string|null)=>/[\u4e00-\u9fff]/.test(value||"");
const displayNote=(value?:string|null)=>{
  const visible = withoutBrandAssignmentRecords(value);
  return visible&&!hasCjk(visible)?visible:undefined;
};
export const ACTIVE_OMNIREACH_BLOCK_REASON =
  "This Brand already has an active OmniReach. Stop it before launching another.";

function BrandMeetingNoteLink({
  notes,
  fallback,
  customerId,
  sampleType,
  showMeetingNote = true,
  showSample = true,
  compactSample = false,
}: {
  notes?: BrandMeetingNote[] | null;
  fallback: string;
  customerId: string;
  sampleType: string;
  showMeetingNote?: boolean;
  showSample?: boolean;
  compactSample?: boolean;
}) {
  const router = useRouter();
  const sampleHref = `/customers/${encodeURIComponent(customerId)}/sample`;
  const note = notes?.[0];
  return (
    <>
      {showMeetingNote && !notes ? (
        <p className="text-sm font-medium text-slate-700">{fallback}</p>
      ) : showMeetingNote && note ? (
        <a
          href={note.url}
          target="_blank"
          rel="noreferrer"
          title={note.title}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          Exhibition Meeting
          <ExternalLink className="size-3.5 shrink-0" />
        </a>
      ) : showMeetingNote ? (
        <p className="text-sm font-medium text-slate-400">Exhibition Meeting</p>
      ) : null}
      {showSample && <a
        href={sampleHref}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.altKey ||
            event.ctrlKey ||
            event.shiftKey
          ) {
            return;
          }
          event.preventDefault();
          router.push(sampleHref);
        }}
        className={cn("inline-flex items-center gap-1 bg-violet-100 font-semibold text-violet-800 transition-colors hover:bg-violet-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600",compactSample?"rounded-full px-2 py-1 text-xs":"min-h-11 rounded-xl px-3 text-sm")}
        title="Open Sample details"
      >
        {sampleType}
        <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
      </a>}
    </>
  );
}

function MeetingHistoryDialog({
  open,
  onOpenChange,
  links,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: BrandAiMeetingLink[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Follow up Meeting</DialogTitle>
          <DialogDescription>
            Portal-created Notion AI Meeting Notes for this brand.
          </DialogDescription>
        </DialogHeader>
        {links.length ? (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {links.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  title={item.title}
                  className="flex items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                  onClick={() => onOpenChange(false)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                    {item.createdAt ? (
                      <span className="mt-0.5 block text-[11px] text-slate-400">
                        {formatEasternDateTime(item.createdAt)}
                      </span>
                    ) : null}
                  </span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">No meetings yet. Use Meeting to create one.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LaunchOmniReachButton({
  disabled,
  disabledReason,
  className,
  onClick,
  iconOnly = false,
}: {
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  onClick?: () => void;
  iconOnly?: boolean;
}) {
  const reason = disabled ? disabledReason : undefined;
  const button = (
    <Button
      variant={iconOnly ? "ghost" : "outline"}
      size={iconOnly ? "icon" : undefined}
      className={cn(className, reason && "pointer-events-none")}
      disabled={disabled}
      onClick={onClick}
      aria-label="Launch OmniReach"
    >
      <Bomb className={cn("size-4", !iconOnly && "mr-2")} />
      {!iconOnly && "Launch OmniReach"}
    </Button>
  );
  if (!reason && !iconOnly) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex",
              className?.includes("justify-start") || className?.includes("w-full")
                ? "w-full [&>button]:w-full"
                : !iconOnly && "xl:w-full xl:[&>button]:w-full",
            )}
            onClick={reason ? () => toast.message(reason) : undefined}
          >
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-left">
          {reason || "Launch OmniReach"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
function formatIcpGroupLabel(value?: string | null): ChannelType {
  return resolveChannelType({ portal: value, icpGroup: value });
}
const Status=({value}:{value:string})=><Badge className={value.includes("Bomb")||value.includes("OmniReach")?"bg-blue-100 text-blue-700":value.includes("Human")||value.includes("Reply")?"bg-violet-100 text-violet-700":value.includes("Due")?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-700"}>{value === "Bomb Running" ? "OmniReach Running" : value}</Badge>;
function BadgeSelect({value,options,onChange,disabled}:{value:string;options:readonly string[];onChange:(value:string)=>void;disabled?:boolean}){
  return <Select value={value||undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger className="h-auto w-auto gap-0 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 [&>svg]:hidden">{value?<Status value={value}/>:<span className="text-xs text-slate-400">—</span>}</SelectTrigger><SelectContent>{options.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>;
}
function ChannelTypeSelect({
  value,
  onChange,
  disabled,
}: {
  value: ChannelType;
  onChange: (value: ChannelType) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<ChannelType | null>(null);
  const display = pending || value;
  const busy = Boolean(pending) || Boolean(disabled);

  useEffect(() => {
    if (pending && value === pending) setPending(null);
  }, [value, pending]);

  return (
    <div
      role="radiogroup"
      aria-label="Portal Channel Type"
      aria-busy={Boolean(pending)}
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
    >
      {CHANNEL_TYPES.map((item) => {
        const selected = item === display;
        return (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={busy}
            onClick={() => {
              if (selected || busy) return;
              setPending(item);
              void Promise.resolve(onChange(item)).catch(() => {
                setPending(null);
              });
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
              selected
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-800",
              busy && !selected && "opacity-60",
              busy && "cursor-not-allowed",
            )}
          >
            {pending === item ? (
              <Loader2 className="size-3 animate-spin text-violet-600" />
            ) : null}
            {item}
          </button>
        );
      })}
    </div>
  );
}

const MESSAGE_CHANNELS:Channel[]=["Email","Phone","SMS","WhatsApp","LinkedIn"];
const ACTIVITY_CHANNELS = new Set<Channel>(MESSAGE_CHANNELS);

function asCpCode(value?: string | null): CPCode {
  return ["NONE", "CP1", "CP2", "CP3", "CP4", "CP5", "CP6", "Nurture"].includes(value || "") ? value as CPCode : "CP1";
}

function asActivityChannel(value?: string | null): Channel | undefined {
  return value && ACTIVITY_CHANNELS.has(value as Channel) ? (value as Channel) : undefined;
}

function asActionStatus(status?: string | null): ActionStatus {
  if (status === "In Progress") return "Sending";
  if (status === "Completed") return "Sent";
  if (status === "Failed" || status === "Cancelled") return status;
  return "Scheduled";
}

function asBombStatus(tasks: BrandTask[]): BombInstance["status"] {
  if (tasks.some((item) => item.status === "Pending" || item.status === "In Progress")) return "Running";
  if (tasks.length && tasks.every((item) => item.status === "Cancelled")) return "Cancelled";
  return "Completed";
}

function bombNoteName(notes?: string | null) {
  return notes?.match(/方案：(.+)。/)?.[1]?.trim() || null;
}

function isBombGenerated(task: BrandTask) {
  const notes = task.notes || "";
  return notes.includes("由 OmniReach 排班生成") || notes.includes("由 Bomb 排班生成");
}

function isOpenTask(task: BrandTask) {
  return task.status === "Pending" || task.status === "In Progress";
}

function closestTaskGroup(task: BrandTask, candidates: [string, BrandTask[]][]) {
  const taskDate = task.scheduledAt || "";
  return candidates.sort((left, right) => {
    const leftDate = left[1].map((item) => item.scheduledAt || "").filter(Boolean).sort()[0] || "";
    const rightDate = right[1].map((item) => item.scheduledAt || "").filter(Boolean).sort()[0] || "";
    return Math.abs(taskDate.localeCompare(leftDate)) - Math.abs(taskDate.localeCompare(rightDate));
  })[0];
}

function groupLabel(group: BrandTask[]) {
  return group.find((item) => item.sourceBombName)?.sourceBombName || bombNoteName(group.find((item) => bombNoteName(item.notes))?.notes) || null;
}

function isDirectTaskActivity(task: BrandTask, item: BrandActivity) {
  return item.taskId === task.id || task.conversationIds.includes(item.id);
}

function activitiesForTask(task: BrandTask, activities: BrandActivity[]) {
  return activities.filter((item) => {
    const sameChannel = !item.channel || !task.channel || item.channel === task.channel;
    return sameChannel && isDirectTaskActivity(task, item);
  });
}

function sentContentForTask(task: BrandTask, related: BrandActivity[]) {
  const directOutbound = related
    .filter((item) => item.direction !== "Inbound" && isDirectTaskActivity(task, item))
    .sort((left, right) => (left.createdAt || "").localeCompare(right.createdAt || ""));
  return directOutbound[0];
}

function toBombPlan(customerId: string, tasks: BrandTask[], activities: BrandActivity[]) {
  const groups = new Map<string, BrandTask[]>();
  const orphans: BrandTask[] = [];
  for (const task of tasks) {
    if (!task.contactId) continue;
    const named = bombNoteName(task.notes);
    if (task.omniReachRunId) {
      const key = `run:${task.omniReachRunId}`;
      const list = groups.get(key) || [];
      list.push(task);
      groups.set(key, list);
      continue;
    }
    if (task.sourceBombId) {
      const key = `bomb:${task.sourceBombId}:${task.contactId}`;
      const list = groups.get(key) || [];
      list.push(task);
      groups.set(key, list);
      continue;
    }
    if (named) {
      const key = `name:${named}:${task.contactId}`;
      const list = groups.get(key) || [];
      list.push(task);
      groups.set(key, list);
      continue;
    }
    if (isBombGenerated(task)) orphans.push(task);
  }

  for (const [key, group] of [...groups.entries()]) {
    if (!key.startsWith("name:")) continue;
    const contactId = group[0]?.contactId;
    const name = bombNoteName(group[0]?.notes);
    const target = [...groups.entries()].find(([id, items]) => (
      !id.startsWith("name:") &&
      items[0]?.contactId === contactId &&
      (groupLabel(items) === name || items.some((item) => bombNoteName(item.notes) === name))
    ));
    if (!target) continue;
    target[1].push(...group);
    groups.delete(key);
  }

  for (const orphan of orphans) {
    const sameContact = [...groups.entries()].filter(([, group]) => group[0]?.contactId === orphan.contactId);
    const open = sameContact.filter(([, group]) => group.some(isOpenTask));
    const active = sameContact.filter(([, group]) => !group.every((item) => item.status === "Cancelled"));
    const match = closestTaskGroup(orphan, open.length ? open : active.length ? active : sameContact);
    if (match) match[1].push(orphan);
  }

  const bombInstances: BombInstance[] = [];
  const actions: ScheduledAction[] = [];
  const activityInstanceIds: Record<string, string> = {};

  for (const [instanceId, group] of groups) {
    const first = group[0];
    // Launch/creation time (not first step's scheduledAt) — used for multi-OmniReach ordering.
    const createdAt = group
      .map((item) => item.createdAt || "")
      .filter(Boolean)
      .sort()[0] || "";
    const firstScheduled = group
      .map((item) => item.scheduledAt || "")
      .filter(Boolean)
      .sort()[0] || "";
    const startedAt = createdAt || firstScheduled;
    bombInstances.push({
      id: instanceId,
      customerId,
      templateId: first.sourceBombId || first.templateId || instanceId,
      templateName: first.sourceBombName || groupLabel(group) || "Untitled OmniReach",
      version: 1,
      goal: "",
      targetContactId: first.contactId || "",
      cp: interactionCpCode(first.sourceBombCp)
        || interactionCpCode(
          group
            .flatMap((task) => activitiesForTask(task, activities))
            .map((item) => item.cpAtInteraction)
            .find(Boolean),
        )
        || undefined,
      status: asBombStatus(group),
      startedAt,
    });
    for (const task of group) {
      const related = activitiesForTask(task, activities);
      for (const activity of related) activityInstanceIds[activity.id] = instanceId;
      const conversation = sentContentForTask(task, related);
      const scheduled = task.scheduledAt || conversation?.createdAt || firstScheduled || startedAt;
      const subject = conversation?.subject?.trim();
      const body = typeof conversation?.content === "string" ? conversation.content : "";
      actions.push({
        id: task.id,
        bombInstanceId: instanceId,
        customerId,
        stepId: task.templateId || task.id,
        channel: asActivityChannel(task.channel) || "Email",
        plannedDate: scheduled,
        actualDate: scheduled,
        status: asActionStatus(task.status),
        content: subject && body ? `Subject: ${subject}\n\n${body}` : subject || body,
        note: displayNote(task.notes),
        attachments: conversation?.attachments?.length ? conversation.attachments : undefined,
      });
    }
  }

  return { bombInstances, actions, activityInstanceIds };
}

function launchPlanFromApiSteps(input: {
  customerId: string;
  bombId: string;
  bombName: string;
  contactId: string;
  omniReachRunId: string;
  steps: Array<{
    taskId: string;
    channel: string;
    scheduledAt: string;
    templateId?: string;
    content: string;
    attachments?: MediaAttachment[];
  }>;
}) {
  const instanceId = `run:${input.omniReachRunId}`;
  const startedAt = new Date().toISOString();
  const bombInstances: BombInstance[] = [{
    id: instanceId,
    customerId: input.customerId,
    templateId: input.bombId,
    templateName: input.bombName,
    version: 1,
    goal: "",
    targetContactId: input.contactId,
    status: "Running",
    startedAt,
  }];
  const actions: ScheduledAction[] = input.steps.map((step) => ({
    id: step.taskId,
    bombInstanceId: instanceId,
    customerId: input.customerId,
    stepId: step.templateId || step.taskId,
    channel: (asActivityChannel(step.channel) || "Email") as Channel,
    plannedDate: step.scheduledAt,
    actualDate: step.scheduledAt,
    status: "Scheduled",
    content: step.content,
    attachments: step.attachments?.length ? step.attachments : undefined,
  }));
  return { instanceId, state: planWorkspaceFromBombPlan({ bombInstances, actions }) };
}

function planWorkspaceFromBombPlan(
  plan: { bombInstances: BombInstance[]; actions: ScheduledAction[] },
): WorkspaceState {
  return {
    version: 5,
    simulatedDate: new Date().toISOString(),
    currentRole: "AccountManager",
    currentUserId: "",
    users: [],
    customers: [],
    bombs: [],
    bombInstances: plan.bombInstances,
    actions: plan.actions,
    interactions: [],
    inbox: [],
    followUps: [],
    callTasks: [],
    audit: [],
    cps: [],
    integrations: [],
    scenarios: [],
  };
}

function isManualActivity(item: BrandActivity, manualTaskIds: Set<string>) {
  if (item.taskId && manualTaskIds.has(item.taskId)) return true;
  return /人工(追加回复|发送消息|消息)/.test(item.notes || "");
}

function resolveActivityCp(
  item: BrandActivity,
  tasks: BrandTask[],
  activityInstanceIds: Record<string, string>,
  bombInstances: BombInstance[],
) {
  const stamped = interactionCpCode(item.cpAtInteraction);
  if (stamped) return stamped;
  const task = item.taskId ? tasks.find((entry) => entry.id === item.taskId) : undefined;
  const fromTask = interactionCpCode(task?.sourceBombCp);
  if (fromTask) return fromTask;
  const instanceId = activityInstanceIds[item.id];
  return instanceId ? bombInstances.find((entry) => entry.id === instanceId)?.cp : undefined;
}

export function toInteractions(
  customerId: string,
  activities: BrandActivity[],
  activityInstanceIds: Record<string, string> = {},
  tasks: BrandTask[] = [],
  bombInstances: BombInstance[] = [],
): Interaction[] {
  const manualTaskIds = new Set(tasks.filter((item) => item.creationMethod === "Manual").map((item) => item.id));
  const tasksById = new Map(tasks.map((item) => [item.id, item]));
  const resolved = activities.map((item) => ({
    item,
    cp: resolveActivityCp(item, tasks, activityInstanceIds, bombInstances),
  }));
  const fallbacks = buildInteractionCpFallbacks(
    resolved.map(({ item, cp }) => ({
      threadId: item.threadId,
      taskId: item.taskId,
      direction: item.direction,
      stampedCp: cp,
      sortAt: item.scheduledAt || item.recordedAt || item.createdAt || "",
    })),
  );
  return resolved.map(({ item, cp }) => ({
    id: item.id,
    customerId,
    contactId: item.contactId || undefined,
    bombInstanceId: activityInstanceIds[item.id],
    type: item.channel === "Phone" ? "Phone" : "Message",
    channel: asActivityChannel(item.channel),
    direction: item.direction || undefined,
    title: item.subject || item.channel || "Conversation",
    content: item.content,
    cc: item.cc || undefined,
    createdAt: item.createdAt || "",
    recordedAt: item.recordedAt || "",
    creationMethod: isManualActivity(item, manualTaskIds)
      ? "Manual"
      : activityInstanceIds[item.id] || /OmniReach|Bomb/.test(item.notes || "")
        ? "Automated"
        : undefined,
    threadId: item.threadId || undefined,
    messageId: item.messageId || undefined,
    taskId: item.taskId || undefined,
    replyStatus: item.replyStatus || undefined,
    cp: resolveInteractionDisplayCp(cp, item, fallbacks),
    taskStatus: (item.taskId ? tasksById.get(item.taskId)?.status : undefined) || undefined,
    // Inbound replies share the outbound Task; do not inherit Task Scheduled At
    // or they sort as if they occurred at send time and can appear above Outbound.
    scheduledAt: item.scheduledAt
      || (item.direction === "Outbound" && item.taskId
        ? tasksById.get(item.taskId)?.scheduledAt
        : undefined)
      || undefined,
    callResult: item.callResult || undefined,
    quo: item.quo || null,
    attachments: item.attachments,
  }));
}

function toCpGoals(cps: CurrentCpOption[] = listCurrentCps()) {
  return Object.fromEntries(
    cps
      .filter((item) => /^CP[1-6]$/.test(item.name))
      .map((item) => [item.name, item.fullName]),
  ) as Partial<Record<CPCode, string>>;
}

export function toCustomerContacts(contacts: BrandContact[]): Contact[] {
  return contacts.map((item) => ({
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
  }));
}

const ACTIVITY_PAGE_SIZE = 50;
type BrandDetailsTab = "details" | "contacts" | "notes" | "plan" | "signalHistory";

export function BrandDetail({customerId}:{customerId:string}){
  const {state,can,assignBrand,cancelBomb}=useWorkspace();
  const {data:signalsData,settle:settleSignals}=useSignals();
  const router=useRouter();
  const searchParams=useSearchParams();
  const requestedSignalId=searchParams.get("signal");
  const requestedWorkReply=searchParams.get("workReply");
  const requestedWorkTask=searchParams.get("workTask");
  const requestedNewAssignment=searchParams.get("newAssignment")==="1";
  const requestedSignalHistory=searchParams.get("tab")==="signalHistory";
  const mockDetailPreview=process.env.NODE_ENV!=="production"&&searchParams.get("mock")==="1"&&customerId===MOCK_PETER_SIGNAL_BRAND_ID;
  const requestedReturnTo=searchParams.get("returnTo");
  const brandListReturnTo=requestedReturnTo==="/customers"||requestedReturnTo?.startsWith("/customers?")||requestedReturnTo==="/signals"||requestedReturnTo?.startsWith("/signals?")
    ? requestedReturnTo
    : "/customers";
  const backPath=can("customers")?brandListReturnTo:"/tasks";
  const backLabel=backPath.startsWith("/signals")?"Back to Signals":can("customers")?"Back to Brands":"Back to tasks";
  const returnToList=()=>{
    if(can("customers")&&backPath.startsWith("/customers")){
      requestBrandListPageRefresh();
    }
    router.replace(backPath);
  };
  const [launch,setLaunch]=useState(false); const [reply,setReply]=useState(false); const [cp,setCP]=useState(false); const [contact,setContact]=useState(false); const [ownerDraft,setOwnerDraft]=useState<string>();
  const [detailsTab,setDetailsTab]=useState<BrandDetailsTab|null>(requestedSignalId||requestedNewAssignment?"details":requestedSignalHistory?"signalHistory":null);
  const [sampleProfiles,setSampleProfiles]=useState<Array<{sn:string;profile:MagnetBrandParam|null}>>([]);
  const [attentionTarget,setAttentionTarget]=useState<{cp:CPCode;channel:Channel}|null>(null);
  const [creatingMeeting,setCreatingMeeting]=useState(false);
  const [meetingHistory,setMeetingHistory]=useState(false);
  const [followUpAction,setFollowUpAction]=useState<"Paused"|"Completed"|null>(null);
  const [followUpNote,setFollowUpNote]=useState("");
  const [followUpAt,setFollowUpAt]=useState("");
  const [focusedEmailInteractionId,setFocusedEmailInteractionId]=useState<string|null>(null);
  const [focusedWorkInteractionId,setFocusedWorkInteractionId]=useState<string|null>(null);
  const [activeSignalId,setActiveSignalId]=useState<string|null>(null);
  const [currentTimeMs,setCurrentTimeMs]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setCurrentTimeMs(Date.now()),60_000);return ()=>window.clearInterval(timer);},[]);
  const cached=getCachedBrand(customerId);
  const [remote,setRemote]=useState<BrandDetail|null>(cached?{
    ...cached,
    priority:null,
    notes:null,
    humanNotes:null,
    createdAt:null,
    lastEditedAt:null,
    currentCpFullName:null,
    currentCpDefinition:null,
    productDescription:null,
    matchedCategory:null,
    icpGroup:null,
    followupExhibition:null,
    meetingNotes:[],
    aiMeetingLinks:[],
    contacts:[],
    tasks:[],
    activities:[],
  }:null);
  const [remoteCps,setRemoteCps]=useState<CurrentCpOption[]>([]);
  const [owners,setOwners]=useState<Array<{id:string;name:string}>>([]);
  const [remoteLoading,setRemoteLoading]=useState(false);
  const [brandReady,setBrandReady]=useState(false);
  const [activitiesReady,setActivitiesReady]=useState(false);
  const [activitiesLoading,setActivitiesLoading]=useState(false);
  const [activitiesLoadingMore,setActivitiesLoadingMore]=useState(false);
  const [activitiesCursor,setActivitiesCursor]=useState<string|null>(null);
  const [activitiesHasMore,setActivitiesHasMore]=useState(false);
  const [saving,setSaving]=useState(false);
  const [quoRefreshingCallId,setQuoRefreshingCallId]=useState<string|null>(null);
  useEffect(()=>{
    setOwnerDraft(undefined);
    setFocusedEmailInteractionId(null);
    setFocusedWorkInteractionId(null);
    setActiveSignalId(null);
    const next=getCachedBrand(customerId);
    setRemote(next?{
      ...next,
      priority:null,
      notes:null,
      humanNotes:null,
      createdAt:null,
      lastEditedAt:null,
      currentCpFullName:null,
      currentCpDefinition:null,
      productDescription:null,
      matchedCategory:null,
      icpGroup:null,
      followupExhibition:null,
      meetingNotes:[],
      aiMeetingLinks:[],
      contacts:[],
      tasks:[],
      activities:[],
    }:null);
    setRemoteCps([]);
    setBrandReady(false);
    setActivitiesReady(false);
    setActivitiesCursor(null);
    setActivitiesHasMore(false);
    setSampleProfiles([]);
  },[customerId]);
  useEffect(()=>{
    if(!remote?.id||detailsTab!=="details")return;
    let cancelled=false;
    fetch(`/api/brands/${encodeURIComponent(customerId)}/sample/profile`,{cache:"no-store"})
      .then(async response=>{
        if(!response.ok)throw new Error("Unable to load sample profiles");
        return response.json() as Promise<{profiles:Array<{sn:string;profile:MagnetBrandParam|null}>}>;
      })
      .then(payload=>{if(!cancelled)setSampleProfiles(payload.profiles||[]);})
      .catch(()=>{if(!cancelled)setSampleProfiles([]);});
    return ()=>{cancelled=true;};
  },[customerId,remote?.id,detailsTab]);
  const brandSignals=signalsData?.brands.find(brand=>brand.id===customerId);
  const signalReadIds=brandSignals?.readEventIds??(brandSignals?.unread?[]:brandSignals?.events.map(event=>event.id)||[]);
  const emailSignals=(brandSignals?.events||[]).filter(event=>event.type==="email");
  const requestedSignal=brandSignals?.events.find(event=>event.id===requestedSignalId);
  const requestedSignalType=requestedSignal?.type;
  useEffect(()=>{
    if(!requestedSignalType)return;
    const readId=requestedSignal?.signalReadId||requestedSignal?.id;
    if(readId) readSignalEvents([readId]);
    setActiveSignalId(requestedSignal.id);
    setDetailsTab("signalHistory");
    const target="brand-important-signals";
    requestAnimationFrame(()=>document.getElementById(target)?.scrollIntoView({block:"center",behavior:"smooth"}));
  },[requestedSignalId,requestedSignalType,requestedSignal]);
  function readSignalEvents(eventIds:string[]){
    if(!brandSignals||!eventIds.length)return;
    const requested=new Set(eventIds);
    const readIds=brandSignals.events.filter(event=>requested.has(event.id)||requested.has(event.signalReadId||""))
      .map(event=>event.signalReadId||event.id);
    if(!readIds.length)return;
    const snapshot=[...new Set([...(brandSignals.readEventIds||[]),...readIds])];
    if(process.env.NODE_ENV!=="production"&&searchParams.get("mock")==="1"){
      settleSignals(customerId,snapshot);
      return;
    }
    if(signalsData?.readOnly)return;
    void fetch(`/api/signals/${encodeURIComponent(customerId)}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"read",eventIds:snapshot}),
    }).then(response=>{if(response.ok)settleSignals(customerId,snapshot);}).catch(()=>{});
  }
  const isAdmin=state.currentRole==="Admin";
  const manager=isAdmin||state.currentRole==="AccountManager";
  const mockCustomer:Customer|undefined=mockDetailPreview?{
    id:customerId,
    name:"Test FridgeChannel Peter",
    initials:"TP",
    cp:"CP2",
    status:"Waiting for Reply",
    source:"Signal mock preview",
    ownerId:state.currentUserId,
    contacts:[{
      id:"mock-test-peter-contact",
      name:"Peter Test",
      role:"Owner",
      title:"Founder",
      email:"peter@testfridgechannel.example",
      preferredChannel:"Email",
      emailValid:true,
      phoneValid:false,
    }],
    createdAt:"2026-10-09T00:00:00.000Z",
    updatedAt:"2026-10-09T00:00:00.000Z",
  }:undefined;
  const local=state.customers.find(x=>x.id===customerId)||mockCustomer;
  const applyRemote=(brand:BrandDetail|null,cps:CurrentCpOption[]=[])=>{
    if(!brand){setRemote(null);setRemoteCps([]);return;}
    cacheBrandItem(brand);
    setRemote((prev)=>{
      const keepActivities=!brand.activities.length&&!!prev?.activities.length;
      return {
        ...brand,
        activities: keepActivities ? prev!.activities : brand.activities,
      };
    });
    setRemoteCps(cps);
  };
  const applyActivitiesPage=(payload:{activities?:BrandActivity[];nextCursor?:string|null;hasMore?:boolean},mode:"replace"|"append")=>{
    const items=payload.activities||[];
    // The button is driven solely by the API's next-page cursor. A partial
    // first page has no second page, so it never exposes Load more activity.
    const hasMore=Boolean(payload.hasMore&&payload.nextCursor);
    setActivitiesCursor(hasMore?(payload.nextCursor||null):null);
    setActivitiesHasMore(hasMore);
    setRemote((prev)=>{
      if(!prev)return prev;
      if(mode==="replace")return {...prev,activities:items};
      const seen=new Set(prev.activities.map((item)=>item.id));
      return {
        ...prev,
        activities:[...prev.activities,...items.filter((item)=>!seen.has(item.id))],
      };
    });
  };
  const fetchActivitiesPage=(cursor?:string|null,mode:"replace"|"append"="replace")=>{
    const query=new URLSearchParams({limit:String(ACTIVITY_PAGE_SIZE)});
    if(cursor)query.set("cursor",cursor);
    return fetch(`/api/brands/${customerId}/activities?${query}`)
      .then(async (response)=>{
        const payload=await response.json() as {
          activities?:BrandActivity[];
          nextCursor?:string|null;
          hasMore?:boolean;
          error?:string;
        };
        if(!response.ok)throw new Error(payload.error||"Failed to load activities");
        applyActivitiesPage(payload,mode);
        return payload;
      });
  };
  const refreshRemote=()=>fetch(`/api/brands/${customerId}`)
    .then(async response=>{
      const payload=await response.json() as {brand?:BrandDetail;cps?:CurrentCpOption[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Brand not found");
      applyRemote(payload.brand||null,payload.cps||[]);
      return payload.brand||null;
    });
  const refreshBrandAndActivities=async ()=>{
    setBrandReady(false);
    setActivitiesReady(false);
    await refreshRemote();
    setBrandReady(true);
    setActivitiesLoading(true);
    try{
      await fetchActivitiesPage(null,"replace");
      setActivitiesReady(true);
    }
    finally{setActivitiesLoading(false);}
  };
  const refreshQuoForBrand=async (callId:string)=>{
    if(!remote||quoRefreshingCallId)return;
    const activity=(remote.activities||[]).find((item)=>
      item.quo?.callId===callId||item.messageId===`QUO_CALL:${callId}`
    );
    const taskId=activity?.taskId
      || remote.tasks.find((task)=>task.channel==="Phone"&&task.callReviewStatus==="Awaiting Review")?.id
      || remote.tasks.find((task)=>task.channel==="Phone")?.id;
    if(!taskId){
      toast.error("No Phone task linked to this Quo call");
      return;
    }
    setQuoRefreshingCallId(callId);
    try{
      const response=await fetch(`/api/tasks/${taskId}/quo?callId=${encodeURIComponent(callId)}`);
      const payload=await response.json() as {errors?:string[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Unable to refresh Quo data");
      await Promise.all([refreshRemote(),fetchActivitiesPage(null,"replace")]);
      if(payload.errors?.length)toast.warning(`Quo refresh completed with ${payload.errors.length} unavailable section${payload.errors.length===1?"":"s"}`);
      else toast.success("Quo data refreshed");
    }catch(error){
      toast.error(error instanceof Error?error.message:"Unable to refresh Quo data");
    }finally{
      setQuoRefreshingCallId(null);
    }
  };
  useEffect(()=>{
    if(local){
      setBrandReady(true);
      setActivitiesReady(true);
      return;
    }
    let cancelled=false;
    setRemoteLoading(true);
    setBrandReady(false);
    refreshRemote()
      .catch(()=>{if(!cancelled)setRemote(null)})
      .finally(()=>{
        if(cancelled)return;
        setRemoteLoading(false);
        setBrandReady(true);
      });
    return ()=>{cancelled=true};
  },[customerId,local]);
  useEffect(()=>{
    if(local||!remote?.id)return;
    let cancelled=false;
    setActivitiesLoading(true);
    setActivitiesReady(false);
    fetchActivitiesPage(null,"replace")
      .catch(()=>{if(!cancelled)applyActivitiesPage({activities:[],nextCursor:null,hasMore:false},"replace");})
      .finally(()=>{
        if(cancelled)return;
        setActivitiesLoading(false);
        setActivitiesReady(true);
      });
    return ()=>{cancelled=true};
  },[customerId,local,remote?.id]);
  useEffect(()=>{
    if(!brandReady||!activitiesReady||focusedWorkInteractionId||(!requestedWorkReply&&!requestedWorkTask))return;
    const controller=new AbortController();
    const query=new URLSearchParams(requestedWorkReply?{replyId:requestedWorkReply}:{taskId:requestedWorkTask!});
    fetch(`/api/brands/${encodeURIComponent(customerId)}/work-target?${query}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{
        const payload=await response.json() as {activity?:BrandActivity;task?:BrandTask;error?:string};
        if(!response.ok||!payload.activity)throw new Error(payload.error||"Work item unavailable");
        return payload;
      })
      .then(({activity,task})=>{
        if(controller.signal.aborted)return;
        setRemote(previous=>previous&&activity?{
          ...previous,
          activities:previous.activities.some(item=>item.id===activity.id)?previous.activities:[...previous.activities,activity],
          tasks:task&&!previous.tasks.some(item=>item.id===task.id)?[...previous.tasks,task]:previous.tasks,
        }:previous);
        if(activity)setFocusedWorkInteractionId(activity.id);
        requestAnimationFrame(()=>document.getElementById("brand-conversations")?.scrollIntoView({block:"start",behavior:"smooth"}));
      })
      .catch(error=>{if(!controller.signal.aborted)toast.error(error instanceof Error?error.message:"Work item unavailable");});
    return ()=>controller.abort();
  },[customerId,requestedWorkReply,requestedWorkTask,brandReady,activitiesReady,focusedWorkInteractionId]);
  useEffect(()=>{
    if(local||!can("assignOwner"))return;
    let cancelled=false;
    fetch("/api/owners")
      .then(async response=>{
        const payload=await response.json() as {owners?:Array<{id:string;name:string}>};
        if(!response.ok)throw new Error("Failed to load owners");
        return payload.owners||[];
      })
      .then(items=>{if(!cancelled)setOwners(items);})
      .catch(()=>{if(!cancelled)setOwners([]);});
    return ()=>{cancelled=true};
  },[customerId,local]);
  const c: Customer | undefined = local || (remote ? {
    id: remote.id,
    name: remote.name,
    initials: remote.initials,
    cp: asCpCode(remote.currentCp),
    status: (remote.status || "Ready") as Customer["status"],
    source: "Follow-up ClientDB",
    ownerId: remote.ownerId || undefined,
    contacts: toCustomerContacts(remote.contacts),
    createdAt: remote.createdAt || "",
    updatedAt: remote.lastEditedAt || "",
  } : undefined);
  const notionBacked=!local&&!!remote;
  const contactsLoading=notionBacked&&!brandReady;
  const activityLoading=notionBacked&&(!brandReady||!activitiesReady||activitiesLoading);
  const visible=!!c&&(local?(manager||c.ownerId===state.currentUserId):!!remote);
  usePageMetadata(brandDetailMetadata(visible&&c?{name:c.name,cp:notionBacked&&remote?remote.currentCp:c.cp,status:c.status,source:c.source}:null));
  if(remoteLoading&&!c)return <div className="grid min-h-[60vh] place-items-center gap-2 text-sm text-slate-500"><Spinner className="size-5 text-slate-400"/>Loading brand…</div>;
  if(!visible||!c)return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CircleAlert className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Brand not found</h1><Button variant="link" onClick={returnToList}>{backLabel}</Button></div></div>;
  const ownerChoices=notionBacked
    ? (remote?.ownerId&&!owners.some(item=>item.id===remote.ownerId)
      ? [{id:remote.ownerId,name:remote.ownerName||"Current owner"},...owners]
      : owners)
    : state.users.filter(u=>["Admin","AccountManager"].includes(u.role)).map(u=>({id:u.id,name:u.name}));
  const patchBrand=async (body:Record<string,unknown>)=>{
    const response=await fetch(`/api/brands/${c.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const payload=await response.json() as {brand?:BrandDetail;cps?:CurrentCpOption[];error?:string};
    if(!response.ok||!payload.brand)throw new Error(payload.error||"Update failed");
    applyRemote(payload.brand,payload.cps||remoteCps);
    return payload.brand;
  };
  const handleAssign=async ()=>{
    const next=ownerDraft??c.ownerId??"unassigned";
    if(!notionBacked){show(assignBrand(c.id,next));return;}
    setSaving(true);
    try{await patchBrand({ownerId:next==="unassigned"?null:next});toast.success("Owner assigned");}
    catch(error){toast.error(error instanceof Error?error.message:"Assign failed");}
    finally{setSaving(false);}
  };
  const markAssignmentReviewed=async ()=>{
    if(!notionBacked||saving)return;
    setSaving(true);
    try{await patchBrand({assignmentHandled:true});toast.success("New assignment cleared");}
    catch(error){toast.error(error instanceof Error?error.message:"Unable to review assignment");}
    finally{setSaving(false);}
  };
  const updateFollowUpStatus=async (next:"Paused"|"Completed",note:string,followUpAt?:string)=>{
    if(!notionBacked)return false;
    setSaving(true);
    try{await patchBrand({status:next,note,followUpAt:next==="Paused"&&followUpAt?new Date(followUpAt).toISOString():undefined});toast.success(next==="Paused"?"Follow-up paused":"Follow-up completed");return true;}
    catch(error){toast.error(error instanceof Error?error.message:"Status update failed");return false;}
    finally{setSaving(false);}
  };
  const openFollowUpAction=(next:"Paused"|"Completed")=>{setFollowUpNote("");setFollowUpAt("");setFollowUpAction(next);};
  const createMeeting=async ()=>{
    if(!notionBacked||creatingMeeting)return;
    setCreatingMeeting(true);
    try{
      const response=await fetch(`/api/brands/${c.id}/meetings`,{method:"POST"});
      const payload=await response.json() as {meeting?:BrandAiMeetingLink;meetings?:BrandAiMeetingLink[];error?:string};
      if(!response.ok||!payload.meeting)throw new Error(payload.error||"Unable to create meeting");
      const meeting=payload.meeting;
      setRemote(prev=>prev?{...prev,aiMeetingLinks:payload.meetings||[meeting,...(prev.aiMeetingLinks||[])]}:prev);
      if(meeting.url)window.open(meeting.url,"_blank","noopener,noreferrer");
      toast.success("Meeting created");
    }catch(error){
      toast.error(error instanceof Error?error.message:"Unable to create meeting");
    }finally{
      setCreatingMeeting(false);
    }
  };
  const loadMoreActivities=()=>{
    if(!activitiesHasMore||activitiesLoadingMore||activitiesLoading||!activitiesCursor)return;
    setActivitiesLoadingMore(true);
    fetchActivitiesPage(activitiesCursor,"append")
      .catch((error)=>toast.error(error instanceof Error?error.message:"Failed to load more"))
      .finally(()=>setActivitiesLoadingMore(false));
  };
  const currentCp=notionBacked?asCpCode(remote?.currentCp):c.cp;
  const currentCpDetails=currentCpOption(notionBacked&&remote?remote.currentCp:c.cp);
  const originMeeting=remote?.meetingNotes?.[0];
  const bombPlan=notionBacked?toBombPlan(c.id,remote?.tasks||[],remote?.activities||[]):undefined;
  const hasActiveOmniReach=notionBacked?brandHasActiveOmniReach(remote?.tasks||[]):!!(c.activeBombId||c.status==="Bomb Running");
  const mockEmailInteraction:Interaction|undefined=mockDetailPreview&&emailSignals.length?{
    id:emailSignals[0].conversationId||"mock-test-peter-email-thread",
    customerId:c.id,
    contactId:"mock-test-peter-contact",
    type:"Message",
    channel:"Email",
    direction:"Outbound",
    title:emailSignals[0].subject||"Quick check on the FridgeChannel sample",
    content:"Hi Peter, just checking whether you had a chance to review the FridgeChannel sample. I would be glad to answer any questions.",
    createdAt:emailSignals[0].occurredAt,
    recordedAt:emailSignals[0].occurredAt,
    creationMethod:"Manual",
    threadId:emailSignals[0].conversationId,
    messageId:emailSignals[0].messageId,
    cp:"CP2",
    taskStatus:"Sent",
  }:undefined;
  const interactions=(notionBacked?toInteractions(c.id,remote?.activities||[],bombPlan?.activityInstanceIds,remote?.tasks||[],bombPlan?.bombInstances||[]):mockEmailInteraction?[mockEmailInteraction]:state.interactions.filter(i=>i.customerId===c.id).map(i=>({...i,cp:i.cp||c.cp}))).sort((a,b)=>compareInteractionSort(b,a));
  const requestedEmail=requestedSignal?.type==="email"?interactions.find(item=>emailSignalMatchesInteraction(requestedSignal,item)):undefined;
  const focusedEmail=(focusedEmailInteractionId?interactions.find(item=>item.id===focusedEmailInteractionId):undefined)||requestedEmail;
  const focusedWork=focusedWorkInteractionId?interactions.find(item=>item.id===focusedWorkInteractionId):undefined;
  const openEmailSignal=(event:SignalEvent)=>{
    const target=interactions.find(item=>emailSignalMatchesInteraction(event,item));
    if(!target)return;
    setFocusedEmailInteractionId(target.id);
    setDetailsTab(null);
    requestAnimationFrame(()=>document.getElementById("brand-conversations")?.scrollIntoView({block:"start",behavior:"smooth"}));
  };
  const partnershipContext=c.partnershipContext;
  const summary=notionBacked
    ? currentCpOption(remote?.currentCp).definition
    : state.cps.find(x=>x.code===c.cp)?.goal||"—";
  const sendBrandMessage = async (
    contactId: string,
    channel: Channel,
    content: string,
    taskId?: string,
    threadId?: string,
    subject?: string,
    deliveryMode?: DeliveryMode,
    scheduledAt?: string,
    attachments?: MediaAttachment[],
    cc?: string,
  ) => {
    const response = await fetch(`/api/brands/${c.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId,
        channel,
        content,
        taskId,
        threadId,
        object: channel === "Email" ? subject : undefined,
        cc: channel === "Email" ? cc : undefined,
        deliveryMode,
        scheduledAt,
        attachments,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Send failed");
    await Promise.all([refreshRemote(), fetchActivitiesPage(null, "replace")]);
  };
  const markReplyRead = async (activityId: string, details: { note: string; reminderAt?: string }) => {
    if (!notionBacked) return;
    const response = await fetch(`/api/brands/${c.id}/mark-reply-handled`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        conversationId: activityId,
        note: details.note,
        reminderAt: details.reminderAt ? new Date(details.reminderAt).toISOString() : undefined,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to mark reply as read");
    await Promise.all([refreshRemote(), fetchActivitiesPage(null, "replace")]);
  };
  const needsReplyCount=interactions.filter(item=>item.direction==="Inbound"&&item.replyStatus==="Needs Reply").length;
  const callReviewCount=(remote?.tasks||[]).filter(task=>task.channel==="Phone"&&task.callReviewStatus==="Awaiting Review").length;
  const overdueCount=(remote?.activities||[]).filter(item=>item.direction==="Inbound"&&item.replyStatus==="Needs Reply"&&item.replyDueAt&&Date.parse(item.replyDueAt)<currentTimeMs).length;
  const focusAttention=(item?:Interaction,channel:Channel="Email")=>{
    setAttentionTarget({cp:item?.cp||currentCp,channel:item?.channel||channel});
    document.getElementById("brand-conversations")?.scrollIntoView({block:"start",behavior:"smooth"});
  };
  const firstNeedsReply=interactions.find(item=>item.direction==="Inbound"&&item.replyStatus==="Needs Reply");
  const firstOverdue=interactions.find(item=>remote?.activities.some(activity=>activity.id===item.id&&activity.direction==="Inbound"&&activity.replyStatus==="Needs Reply"&&activity.replyDueAt&&Date.parse(activity.replyDueAt)<Date.now()));
  const detailTabs=[
    {id:"details" as const,label:"Brand details",icon:FileText},
    {id:"contacts" as const,label:"Contacts",icon:ContactRound},
    {id:"notes" as const,label:"Notes",icon:StickyNote},
    {id:"signalHistory" as const,label:"Signal History",icon:History},
  ];
  return <div className="w-full min-w-0 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col">
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:min-h-0 lg:flex-1">
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <Button type="button" variant="ghost" size="icon" aria-label={backLabel} onClick={returnToList}><ArrowLeft className="size-4"/></Button>
      <Avatar className="size-9"><AvatarFallback className="bg-violet-100 text-xs font-bold text-violet-700">{c.initials}</AvatarFallback></Avatar>
      <div className="flex min-w-0 flex-1 items-center gap-2"><h1 className="min-w-0 truncate text-lg font-semibold text-slate-950">{c.name}</h1>{notionBacked&&remote?.followupExhibition&&(originMeeting?<a href={originMeeting.url} target="_blank" rel="noreferrer" className="hidden shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-200 lg:inline-flex">{remote.followupExhibition}<ExternalLink className="ml-1 size-3"/></a>:<span className="hidden shrink-0 rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 lg:inline-flex">{remote.followupExhibition}</span>)}
        <Button type="button" size="sm" variant="outline" className="min-w-0 max-w-[22rem] shrink" disabled={!brandReady||!can("changeCP")} onClick={()=>setCP(true)} aria-label={`Current ${currentCpDetails.name}: ${currentCpDetails.fullName}. Change CP`}>
          <span className="truncate">{currentCpDetails.name} · {currentCpDetails.fullName}</span><ChevronRight className="ml-1 size-3.5 shrink-0 rotate-90"/>
        </Button></div>
      {hasActiveOmniReach&&<Badge className="bg-blue-100 text-blue-700">OmniReach running</Badge>}
      <div className="ml-auto flex items-center gap-1">
        {can("reply")&&<TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label="New message" disabled={!brandReady||(notionBacked&&!c.contacts.length)} onClick={()=>setReply(true)}><Send className="size-4"/></Button></TooltipTrigger><TooltipContent>New message</TooltipContent></Tooltip></TooltipProvider>}
        {can("launch")&&<LaunchOmniReachButton iconOnly className="size-9" disabled={!brandReady||hasActiveOmniReach} disabledReason={!brandReady?"Loading brand…":ACTIVE_OMNIREACH_BLOCK_REASON} onClick={()=>setLaunch(true)}/>}
        {(notionBacked||mockDetailPreview)&&<TooltipProvider><Tooltip><TooltipTrigger asChild><span><Button variant="ghost" size="icon" className="size-9" aria-label="Follow up Meeting" disabled={!notionBacked} onClick={()=>setMeetingHistory(true)}><History className="size-4"/></Button></span></TooltipTrigger><TooltipContent>{notionBacked?"Follow up Meeting":"Unavailable in mock preview"}</TooltipContent></Tooltip></TooltipProvider>}
        {(notionBacked||mockDetailPreview)&&can("editBrand")&&(notionBacked?<DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-9" aria-label="More follow-up actions" title="More follow-up actions" disabled={saving}><MoreHorizontal className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!brandReady||creatingMeeting} onSelect={()=>void createMeeting()}><Plus className="mr-2 size-4"/>Create meeting</DropdownMenuItem><DropdownMenuItem disabled={saving||remote?.status==="Paused"||remote?.status==="Completed"} onSelect={()=>openFollowUpAction("Paused")}><CirclePause className="mr-2 size-4"/>Pause FollowUp</DropdownMenuItem><DropdownMenuItem disabled={saving||remote?.status==="Completed"} onSelect={()=>openFollowUpAction("Completed")}><CircleCheck className="mr-2 size-4"/>Complete FollowUp</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:<TooltipProvider><Tooltip><TooltipTrigger asChild><span><Button variant="ghost" size="icon" className="size-9" aria-label="More follow-up actions" disabled><MoreHorizontal className="size-4"/></Button></span></TooltipTrigger><TooltipContent>Unavailable in mock preview</TooltipContent></Tooltip></TooltipProvider>)}
      </div>
    </header>
    {(needsReplyCount>0||callReviewCount>0||overdueCount>0)&&<div role="status" className="flex flex-wrap items-center gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
      <CircleAlert className="size-4"/>Needs attention
      {overdueCount>0&&<button type="button" className="rounded-full bg-rose-200 px-2 py-1 hover:bg-rose-300" onClick={()=>focusAttention(firstOverdue||firstNeedsReply)}>{overdueCount} overdue</button>}
      {needsReplyCount>0&&<button type="button" className="rounded-full bg-white px-2 py-1 hover:bg-rose-100" onClick={()=>focusAttention(firstNeedsReply)}>{needsReplyCount} replies needed</button>}
      {callReviewCount>0&&<button type="button" className="rounded-full bg-white px-2 py-1 hover:bg-rose-100" onClick={()=>focusAttention(undefined,"Phone")}>{callReviewCount} calls to review</button>}
    </div>}
    <div className="grid min-w-0 items-start lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
    <aside aria-label="Brand information" className="order-2 flex min-w-0 flex-col overflow-hidden border-t border-slate-200 bg-white lg:min-h-0 lg:border-l lg:border-t-0 lg:flex-row">
      <div className="flex shrink-0 flex-row items-center gap-2 border-b border-slate-100 p-2 lg:w-12 lg:flex-col lg:border-b-0 lg:border-r lg:py-3">
        {detailTabs.map(({id,label,icon:Icon})=><Button key={id} type="button" variant={detailsTab===id?"secondary":"ghost"} size="icon" className="size-9" aria-label={label} title={label} aria-pressed={detailsTab===id} onClick={()=>{const next=detailsTab===id?null:id;if(detailsTab==="signalHistory"&&next!=="signalHistory")setActiveSignalId(null);setDetailsTab(next);}}><Icon className="size-4"/></Button>)}
      </div>
      {detailsTab&&<section className="min-w-0 w-full space-y-5 overflow-y-auto p-4 lg:w-[320px]">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{detailTabs.find(tab=>tab.id===detailsTab)?.label}</h2><Button type="button" variant="ghost" size="icon" aria-label="Close details" onClick={()=>{if(detailsTab==="signalHistory")setActiveSignalId(null);setDetailsTab(null);}}><PanelRightClose className="size-4"/></Button></div>
      <div className={detailsTab==="details"?"min-w-0":"hidden"}>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{c.name}</h3>
          {(notionBacked?(!!remote?.meetingNotes.length||!!remote?.followupExhibition):!!c.source)&&<section className="mt-4">
            <p className="text-xs font-semibold text-slate-500">Relationship origin</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">{notionBacked&&remote?.meetingNotes.length?<BrandMeetingNoteLink notes={remote.meetingNotes} fallback="" customerId={c.id} sampleType={remote?.channelType||formatIcpGroupLabel(remote?.icpGroup)} showSample={false}/>:<p className="text-sm font-medium text-slate-700">{notionBacked?remote?.followupExhibition:c.source}</p>}</div>
          </section>}
          <section className="border-t border-slate-100 py-4">
            <p className="text-xs font-semibold text-slate-500">Brand profile</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.currentRole!=="AccountManager"&&(notionBacked&&remote?.status?(can("editBrand")?<BadgeSelect value={remote.status} options={FOLLOW_UP_STATUSES} disabled={saving||!brandReady} onChange={value=>{if(value==="Paused"||value==="Completed"){openFollowUpAction(value);return;}void patchBrand({status:value}).then(()=>toast.success("Status updated")).catch(error=>toast.error(error instanceof Error?error.message:"Update failed"));}}/>:<Status value={remote.status}/>):(c.status?<Status value={c.status}/>:null))}
              {notionBacked && can("editBrand") ? (
                <ChannelTypeSelect value={(remote?.channelType || "DTC") as ChannelType} disabled={saving || !brandReady} onChange={async (value) => { try { await patchBrand({ channelType: value }); toast.success("Channel Type updated"); } catch (error) { toast.error(error instanceof Error ? error.message : "Update failed"); throw error; } }} />
              ) : notionBacked && remote?.channelType ? <Status value={remote.channelType} /> : null}
              {notionBacked && !brandReady ? <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400"><Spinner className="size-3" />Loading details…</span> : null}
            </div>
            {notionBacked&&<BrandProfileFields profiles={sampleProfiles} channelType={remote?.channelType||formatIcpGroupLabel(remote?.icpGroup)} amazon={remote?.amazonSampleProduct}/>}
            {notionBacked&&<a href={`/customers/${encodeURIComponent(c.id)}/sample${searchParams.get("mock")==="1"?"?mock=1":""}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:underline">Edit sample profile <ChevronRight className="size-3"/></a>}
          </section>
          <section className="border-t border-slate-100 py-4">
            <p className="text-xs font-semibold text-slate-500">Brand summary</p>
            {brandReady ? <>
              <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
              {notionBacked && displayNote(remote?.notes) && <p className="mt-2 text-sm leading-6 text-slate-600">{displayNote(remote?.notes)}</p>}
            </> : <p className="mt-2 text-sm text-slate-400">Loading brand details…</p>}
          </section>
          <section className="border-t border-slate-100 py-4">
            <p className="text-xs font-semibold text-slate-500">Follow-up details</p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-slate-500">Account Manager</dt><dd className="text-right text-slate-700">{remote?.ownerName || state.users.find((user) => user.id === c.ownerId)?.name || "Unassigned"}</dd></div>
              {!notionBacked && <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-slate-500">Source</dt><dd className="text-right text-slate-700">{c.source}</dd></div>}
            </dl>
            {can("assignOwner") && <div className="mt-3 flex flex-wrap items-center gap-2"><Select value={ownerDraft ?? c.ownerId ?? "unassigned"} onValueChange={setOwnerDraft} disabled={!brandReady}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{ownerChoices.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={saving || !brandReady || (ownerDraft ?? c.ownerId ?? "unassigned") === (c.ownerId || "unassigned")} onClick={() => void handleAssign()}>Assign</Button></div>}
            {notionBacked && state.currentRole === "AccountManager" && remote?.ownerId === state.currentUserId && remote.ownerAssignedAt && !remote.ownerAssignmentHandledAt && <Button variant="outline" size="sm" className="mt-3" disabled={saving || !brandReady} onClick={() => void markAssignmentReviewed()}><UserCheck className="mr-2 size-4" />Mark assignment reviewed</Button>}
          </section>
        </div>
      </div>
      <div className={detailsTab==="contacts"?"":"hidden"}><BrandContactList
        brandId={c.id}
        contacts={notionBacked&&remote?remote.contacts:c.contacts}
        loading={contactsLoading}
        canEdit={can("editBrand")}
        canEnrich={notionBacked&&can("editBrand")}
        onAdd={()=>setContact(true)}
        onContactsChange={notionBacked?(contacts)=>{
          setRemote(prev=>prev?{...prev,contacts}:prev);
        }:undefined}
        linkedinEvents={(brandSignals?.events||[]).filter(event=>event.type==="linkedin"&&!!event.contactId)}
        signalReadIds={signalReadIds}
        onReadSignals={readSignalEvents}
      /></div>
      <div className={detailsTab==="notes"?"space-y-3":"hidden"}>
        <BrandNote key={c.id} customerId={c.id} variant="panel" disabled={notionBacked&&!brandReady} value={notionBacked?remote?.humanNotes??"":undefined} onSave={notionBacked?async (next)=>{await patchBrand({humanNotes:next});}:undefined}/>
        {notionBacked&&displayNote(remote?.notes)&&<p className="text-sm leading-6 text-slate-600">{displayNote(remote?.notes)}</p>}
        {partnershipContext&&<div className="rounded-xl bg-emerald-50 p-4"><h3 className="font-semibold text-emerald-950">{partnershipContext.headline}</h3><p className="mt-2 text-sm text-emerald-900">{partnershipContext.summary}</p>{partnershipContext.signals.map(signal=><p key={signal} className="mt-2 text-xs text-emerald-800">{signal}</p>)}<p className="mt-3 text-[11px] text-emerald-700">Updated {dateOnly(partnershipContext.updatedAt)}</p></div>}
      </div>
      <div className={detailsTab==="signalHistory"?"min-w-0":"hidden"}>
        <SignalHistoryPanel events={brandSignals?.events||[]} readIds={signalReadIds} activeSignalId={activeSignalId} onOpenSignal={event=>{setActiveSignalId(event.id);readSignalEvents([event.signalReadId||event.id]);}}/>
      </div>
      </section>}
    </aside>
    <div className="order-1 flex min-w-0 flex-col overflow-hidden bg-white lg:min-h-0"><ImportantSignalsPanel events={brandSignals?.events || []} readIds={signalReadIds} onRead={readSignalEvents} onOpenEmailSignal={openEmailSignal}/><section id="brand-conversations" aria-label="Brand communication" className="flex min-w-0 flex-col overflow-hidden lg:min-h-0 lg:flex-1"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2 className="flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-violet-600"/>Conversations</h2><span className="text-xs text-slate-500">{interactions.length} activities</span></div><div className="min-h-[50vh] max-h-[calc(100vh-290px)] min-w-0 overflow-y-auto lg:min-h-0 lg:max-h-none lg:flex-1">
    <InteractionFeed key={`${c.id}-${currentCp}-${attentionTarget?.cp||""}-${attentionTarget?.channel||""}-${focusedWork?.id||focusedEmail?.id||""}`} customerId={c.id} currentCp={currentCp} initialCp={focusedWork?.cp||focusedEmail?.cp||attentionTarget?.cp} initialChannel={focusedWork?.channel||(focusedEmail?"Email":attentionTarget?.channel)} focusedInteractionId={focusedWork?.id||focusedEmail?.id} showAllChannels showCpSelector={false} cpGoals={notionBacked?toCpGoals(remoteCps):undefined} interactions={interactions} contacts={c.contacts} bombInstances={bombPlan?.bombInstances} actions={bombPlan?.actions} loading={activityLoading} canReviewCalls={notionBacked&&can("reply")} tasks={remote?.tasks||[]} onMarkReplyRead={notionBacked&&can("reply")?markReplyRead:undefined} onRefreshQuo={notionBacked?refreshQuoForBrand:undefined} quoRefreshingCallId={quoRefreshingCallId} onPersistCallReview={notionBacked?async (taskId,status,reviewReason,reviewNote,resolution)=>{
    const response=await fetch(`/api/tasks/${taskId}/call-review`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,reviewReason,reviewNote,resolution})});
    const payload=await response.json() as {error?:string};
    if(!response.ok)throw new Error(payload.error||"Unable to save call review");
    await refreshBrandAndActivities();
  }:undefined} onCancelBomb={async instance=>{if(!notionBacked){const result=cancelBomb(c.id,instance.id);if(!result.ok)throw new Error(result.message);toast.success(result.message);return;}const response=await fetch(`/api/brands/${c.id}/bombs/${instance.templateId}/cancel`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId:instance.targetContactId,omniReachRunId:instance.id.startsWith("run:")?instance.id.slice(4):undefined})});const payload=await response.json() as {cancelledTaskIds?:string[];error?:string};if(!response.ok)throw new Error(payload.error||"Unable to stop OmniReach");const cancelled=new Set(payload.cancelledTaskIds||[]);if(cancelled.size){setRemote(prev=>prev?{...prev,tasks:prev.tasks.map(task=>cancelled.has(task.id)?{...task,status:"Cancelled"}:task),handlingMode:prev.handlingMode==="Human"?prev.handlingMode:"Human"}:prev);}toast.success(`${payload.cancelledTaskIds?.length||0} remaining task${payload.cancelledTaskIds?.length===1?"":"s"} cancelled`);void Promise.all([refreshRemote(),fetchActivitiesPage(null,"replace")]);}} onCancelPending={notionBacked&&can("reply")?async taskId=>{const response=await fetch(`/api/tasks/${taskId}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"Cancelled"})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"Unable to cancel");setRemote(prev=>prev?{...prev,tasks:prev.tasks.map(task=>task.id===taskId?{...task,status:"Cancelled"}:task)}:prev);toast.success("Pending message cancelled");void Promise.all([refreshRemote(),fetchActivitiesPage(null,"replace")]);}:undefined} onSend={notionBacked?sendBrandMessage:undefined}/>
  {notionBacked&&activitiesHasMore&&activitiesCursor?<div className="border-t border-slate-100 p-3"><Button variant="outline" size="sm" className="w-full" disabled={activitiesLoadingMore||activitiesLoading} onClick={loadMoreActivities}>{activitiesLoadingMore?<span className="inline-flex items-center gap-2"><Spinner className="size-3.5"/>Loading…</span>:"Load more activity"}</Button></div>:null}
  </div>
  </section></div></div>
  <LaunchBombDialog customerId={c.id} open={launch} onOpenChange={setLaunch} contacts={notionBacked?c.contacts:undefined} currentCp={notionBacked&&remote?remote.currentCp:undefined} companyName={c.name} productDescription={notionBacked?remote?.productDescription:undefined} matchedCategory={notionBacked?remote?.matchedCategory:undefined} followupExhibition={notionBacked?remote?.followupExhibition:undefined} previewOnly={notionBacked} hasActiveOmniReach={hasActiveOmniReach} onLaunched={notionBacked?()=>{void refreshBrandAndActivities()}:undefined}/><ReplyDialog customerId={c.id} open={reply} onOpenChange={setReply} contacts={notionBacked?c.contacts:undefined} onSend={notionBacked?async (contactId,channel,content,object,deliveryMode,scheduledAt,attachments,cc)=>{
    await sendBrandMessage(contactId, channel, content, undefined, undefined, object, deliveryMode, scheduledAt, attachments, cc);
  }:undefined}/><ChangeCPDialog customerId={c.id} open={cp} onOpenChange={setCP} currentCp={notionBacked&&remote?remote.currentCp:undefined} cps={notionBacked?remoteCps:undefined} onSave={notionBacked?async (currentCpId,evidence,note)=>{await patchBrand({currentCpId,evidence,note});}:undefined}/><ContactDialog customerId={c.id} open={contact} onOpenChange={setContact} notionBacked={notionBacked} onCreated={notionBacked?async ()=>{await refreshRemote();}:undefined}/>{notionBacked?<MeetingHistoryDialog open={meetingHistory} onOpenChange={setMeetingHistory} links={remote?.aiMeetingLinks||[]}/>:null}<Dialog open={followUpAction!==null} onOpenChange={open=>{if(!open){setFollowUpAction(null);setFollowUpNote("");setFollowUpAt("");}}}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{followUpAction==="Paused"?"Pause FollowUp":"Complete FollowUp"}</DialogTitle><DialogDescription>Record the customer’s explicit reply and the reason for this outcome. This note is required.</DialogDescription></DialogHeader><Textarea value={followUpNote} onChange={event=>setFollowUpNote(event.target.value)} placeholder={followUpAction==="Paused"?"For example: The customer asked us to reconnect after their budget review in January.":"For example: The customer confirmed they do not wish to continue."} className="min-h-32" autoFocus/>{followUpAction==="Paused"&&<div className="space-y-2"><label htmlFor="next-follow-up-at" className="text-sm font-medium text-slate-700">Next contact date <span className="font-normal text-slate-500">(optional)</span></label><Input id="next-follow-up-at" type="datetime-local" value={followUpAt} onChange={event=>setFollowUpAt(event.target.value)}/><p className="text-xs text-slate-500">On this date, Admin receives a reminder to review and assign the follow-up.</p></div>}<DialogFooter><Button variant="outline" onClick={()=>{setFollowUpAction(null);setFollowUpNote("");setFollowUpAt("");}}>Cancel</Button><Button disabled={saving||!followUpNote.trim()||!followUpAction} onClick={()=>{if(!followUpAction)return;void (async ()=>{const saved=await updateFollowUpStatus(followUpAction,followUpNote.trim(),followUpAt);if(saved){setFollowUpAction(null);setFollowUpNote("");setFollowUpAt("");}})();}}>{followUpAction==="Paused"?"Pause FollowUp":"Complete FollowUp"}</Button></DialogFooter></DialogContent></Dialog></div></div>;
}

type DetailContact = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  /** KeyPersonDB LinkedIn Connected account names. */
  linkedinConnected?: string[];
  keyPersonId?: string | null;
  title?: string | null;
  contactOrder?: string | null;
  followupStatus?: string | null;
  followupMode?: string | null;
};

function linkedinLabel(value?: string | null) {
  if (!value) return undefined;
  const match = value.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? `linkedin.com/in/${match[1]}` : value;
}

function linkedinHref(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const label = linkedinLabel(trimmed);
  if (!label) return undefined;
  if (/^linkedin\.com\//i.test(label)) return `https://www.${label}`;
  if (/^[\w.-]+$/i.test(label)) return `https://www.linkedin.com/in/${label}`;
  return `https://${label.replace(/^\/+/, "")}`;
}

function linkedinFriendAccounts(contact: Pick<DetailContact, "linkedinConnected">) {
  return (contact.linkedinConnected || []).map((name) => name.trim()).filter(Boolean);
}

type EnrichField =
  | "email"
  | "phone"
  | "directPhone"
  | "officePhone"
  | "whatsapp"
  | "linkedin";
type EnrichConflict = { field: EnrichField; current: string; proposed: string };
type EnrichPreview = {
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  pending?: EnrichField[];
  /** Compact summary: found + misses, e.g. Email (existing) · LinkedIn not found */
  note?: string;
};

/** Short LinkedIn / WhatsApp verdicts for the green summary line. */
function enrichMissLabels(steps: string[] | undefined, found: {
  linkedin?: string | null;
  whatsapp?: string | null;
}) {
  const labels: string[] = [];
  const text = (steps || []).join("\n");

  if (!found.linkedin) {
    if (/LinkedIn not found/i.test(text)) labels.push("LinkedIn not found");
    else if (/email→LinkedIn skipped|LinkedIn skipped/i.test(text)) labels.push("LinkedIn not found");
  }
  if (!found.whatsapp) {
    if (/no WhatsApp on this Phone/i.test(text)) labels.push("no WhatsApp on this phone");
    else if (/WA probe skipped|inconclusive|still pending/i.test(text)) {
      labels.push("no WhatsApp on this phone");
    } else if (/WA probe: checking/i.test(text) && !/WhatsApp registered/i.test(text)) {
      labels.push("no WhatsApp on this phone");
    }
  }
  return labels;
}

function BrandContactList({
  brandId,
  contacts,
  canEdit,
  canEnrich,
  onAdd,
  loading,
  onContactsChange,
  linkedinEvents=[],
  signalReadIds=[],
  onReadSignals=()=>{},
}: {
  brandId: string;
  contacts: DetailContact[];
  canEdit: boolean;
  canEnrich?: boolean;
  onAdd: () => void;
  loading?: boolean;
  onContactsChange?: (contacts: BrandContact[]) => void;
  linkedinEvents?: SignalEvent[];
  signalReadIds?: string[];
  onReadSignals?: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, EnrichPreview>>({});
  const [conflicts, setConflicts] = useState<EnrichConflict[] | null>(null);
  const [conflictContactId, setConflictContactId] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runEnrich = async (contactId: string) => {
    setEnrichingId(contactId);
    setEnrichStatus("Icypeas → FullEnrich（查手机号可能需要约 1 分钟）…");
    setOpen((prev) => new Set(prev).add(contactId));
    try {
      const response = await fetch(`/api/brands/${brandId}/contacts/${contactId}/enrich`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        creditsExhausted?: boolean;
        applied?: Partial<Record<EnrichField, string>>;
        conflicts?: EnrichConflict[];
        notFound?: string[];
        found?: {
          email?: string | null;
          phone?: string | null;
          directPhone?: string | null;
          officePhone?: string | null;
          whatsapp?: string | null;
          linkedin?: string | null;
        };
        sources?: Partial<Record<EnrichField, string>>;
        steps?: string[];
        contacts?: BrandContact[];
      };
      if (!response.ok) throw new Error(payload.error || "Enrichment failed");
      if (payload.contacts) onContactsChange?.(payload.contacts);

      const found = payload.found || {};
      const pending = (payload.conflicts || []).map((item) => item.field);
      const foundBits = [
        found.email
          ? `Email${payload.sources?.email ? ` (${payload.sources.email})` : ""}`
          : null,
        found.linkedin
          ? `LinkedIn${payload.sources?.linkedin ? ` (${payload.sources.linkedin})` : ""}`
          : null,
        found.phone
          ? `Phone${payload.sources?.phone ? ` (${payload.sources.phone})` : ""}`
          : null,
        found.directPhone
          ? `Direct${payload.sources?.directPhone ? ` (${payload.sources.directPhone})` : ""}`
          : null,
        found.officePhone
          ? `Office${payload.sources?.officePhone ? ` (${payload.sources.officePhone})` : ""}`
          : null,
        found.whatsapp
          ? `WhatsApp${payload.sources?.whatsapp ? ` (${payload.sources.whatsapp})` : ""}`
          : null,
      ].filter(Boolean) as string[];
      const missBits = enrichMissLabels(payload.steps, found);
      const note = [...foundBits, ...missBits].join(" · ") || undefined;
      setPreviews((prev) => ({
        ...prev,
        [contactId]: {
          email: found.email,
          phone: found.phone,
          directPhone: found.directPhone,
          officePhone: found.officePhone,
          whatsapp: found.whatsapp,
          linkedin: found.linkedin,
          pending,
          note,
        },
      }));

      const appliedCount = Object.keys(payload.applied || {}).length;
      if (appliedCount) {
        toast.success(`已写入 ${appliedCount} 个空字段`);
      }
      if (payload.conflicts?.length) {
        setConflictContactId(contactId);
        setConflicts(payload.conflicts);
        setSelectedFields(
          Object.fromEntries(payload.conflicts.map((item) => [item.field, true])),
        );
        toast.message("发现与库内不一致的字段，请确认是否采用");
      } else if (!appliedCount && !found.linkedin && !found.whatsapp && !found.phone && !found.email) {
        toast.message("未找到新的联系方式");
      } else if (!appliedCount) {
        toast.message(
          missBits.length
            ? `已处理 · ${missBits.join(" · ")}`
            : "已回显找到的联系方式（与库内一致或待确认）",
        );
      }

      setEnrichStatus(null);
    } catch (error) {
      setEnrichStatus(null);
      toast.error(error instanceof Error ? error.message : "Enrichment failed");
    } finally {
      setEnrichingId(null);
    }
  };

  const applyConflicts = async () => {
    if (!conflictContactId || !conflicts?.length) return;
    const fields: Partial<Record<EnrichField, string>> = {};
    for (const item of conflicts) {
      if (selectedFields[item.field]) fields[item.field] = item.proposed;
    }
    if (!Object.keys(fields).length) {
      setConflicts(null);
      setConflictContactId(null);
      return;
    }
    setApplying(true);
    try {
      const response = await fetch(
        `/api/brands/${brandId}/contacts/${conflictContactId}/apply-enrichment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        contacts?: BrandContact[];
      };
      if (!response.ok) throw new Error(payload.error || "Unable to apply");
      if (payload.contacts) onContactsChange?.(payload.contacts);
      setPreviews((prev) => {
        const next = { ...prev };
        delete next[conflictContactId];
        return next;
      });
      toast.success("Confirmed contact updates applied");
      setConflicts(null);
      setConflictContactId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to apply");
    } finally {
      setApplying(false);
    }
  };

  const displayValue = (
    contact: DetailContact,
    field: "email" | "phone" | "directPhone" | "officePhone" | "linkedin" | "whatsapp",
  ) => {
    const preview = previews[contact.id];
    if (field === "email") return preview?.email || contact.email;
    if (field === "phone") return preview?.phone || contact.phone;
    if (field === "whatsapp") {
      return preview?.whatsapp || contact.whatsapp || undefined;
    }
    if (field === "directPhone") return preview?.directPhone || contact.directPhone;
    if (field === "officePhone") return preview?.officePhone || contact.officePhone;
    return linkedinLabel(preview?.linkedin || contact.linkedin);
  };

  const isPending = (contactId: string, field: EnrichField) =>
    Boolean(previews[contactId]?.pending?.includes(field));

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">KeyPerson</h2>
        {canEdit && !loading && (
          <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label="Add KeyPerson">
            <Plus className="size-4" />
          </Button>
        )}
      </div>
      {canEnrich && (
        <p className="mt-1 text-[11px] leading-4 text-slate-400">
          find contact information takes about 3 minutes, please wait patiently.
        </p>
      )}
      {(enrichingId || enrichStatus) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          {enrichingId ? <Spinner className="size-3" /> : null}
          {enrichingId
            ? enrichStatus || "Finding contact information..."
            : enrichStatus}
        </p>
      )}
      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
          <Spinner className="size-3.5" />
          Loading KeyPerson…
        </div>
      ) : contacts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No KeyPerson in this follow-up yet.</p>
      ) : (
        <div className="mt-3 grid gap-y-4">
          {contacts.map((contact) => {
            const expanded = open.has(contact.id);
            const meta = [contact.contactOrder, contact.role, contact.followupStatus]
              .filter(Boolean)
              .join(" · ");
            const previewNote = previews[contact.id]?.note;
            return (
              <div key={contact.id} className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(contact.id)}
                      className="flex min-w-0 items-center gap-x-1.5 text-left"
                    >
                      <ChevronRight
                        className={`size-3.5 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                      />
                      <span className="truncate text-sm font-semibold">{contact.name}</span>
                    </button>
                    {contact.keyPersonId ? (
                      <a
                        href={keyPersonNotionUrl(contact.keyPersonId)}
                        target="_blank"
                        rel="noreferrer"
                        title={`Open ${contact.name} in KeyPersonDB`}
                        aria-label={`Open ${contact.name} in Notion`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-800"
                      >
                        Notion
                        <ExternalLink className="size-2.5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggle(contact.id)}
                      className="min-w-0 flex-1 truncate text-left text-xs text-slate-500"
                    >
                      {meta || contact.role}
                    </button>
                  </div>
                  {canEnrich && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      disabled={!!enrichingId || loading}
                      aria-label={`Enrich ${contact.name}`}
                      title="Icypeas → FullEnrich：查找 Email / LinkedIn / Phone / Direct / Office"
                      onClick={() => void runEnrich(contact.id)}
                    >
                      {enrichingId === contact.id ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Search className="size-3.5" />
                      )}
                    </Button>
                  )}
                </div>
                {previewNote && (
                  <p className="mt-1 pl-5 text-[11px] text-emerald-700">{previewNote}</p>
                )}
                <LinkedInUpdates events={linkedinEvents.filter(event=>event.contactId===contact.id||event.contactId===contact.keyPersonId)} readIds={signalReadIds} onRead={onReadSignals} id={`contact-linkedin-${contact.id}`}/>
                {expanded && (
                  <div className="mt-2 grid gap-1.5">
                    {contact.title && <div className="text-xs text-slate-500">{contact.title}</div>}
                    {contact.followupMode && (
                      <div className="text-xs text-slate-500">Mode: {contact.followupMode}</div>
                    )}
                    {(
                      [
                        ["Email", "email", "Email"],
                        ["Phone", "phone", "Phone"],
                        ["Phone", "directPhone", "Direct Phone"],
                        ["Phone", "officePhone", "Office Phone"],
                        ["SMS", "phone", "SMS"],
                        ["WhatsApp", "whatsapp", "WhatsApp"],
                        ["LinkedIn", "linkedin", "LinkedIn"],
                      ] as const
                    ).map(([channel, field, label]) => {
                      const value = displayValue(contact, field);
                      const pendingField =
                        field === "email" ||
                        field === "phone" ||
                        field === "directPhone" ||
                        field === "officePhone" ||
                        field === "whatsapp" ||
                        field === "linkedin"
                          ? isPending(contact.id, field)
                          : false;
                      const friendAccounts =
                        field === "linkedin" && value ? linkedinFriendAccounts(contact) : [];
                      const linkedinUrl =
                        field === "linkedin" && value ? linkedinHref(value) : undefined;
                      return (
                        <div
                          key={`${label}-${field}`}
                          className="flex min-w-0 items-center gap-2 text-xs text-slate-600"
                        >
                          <ChannelIcon channel={channel} className="size-4 shrink-0" />
                          <span className="w-[5.5rem] shrink-0 text-slate-400">{label}</span>
                          {linkedinUrl ? (
                            <a
                              href={linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={`truncate text-sky-700 underline-offset-2 hover:underline ${pendingField ? "text-amber-700" : ""}`}
                            >
                              {value}
                            </a>
                          ) : (
                            <span
                              className={`truncate ${value ? "" : "text-slate-400"} ${pendingField ? "text-amber-700" : ""}`}
                            >
                              {value || "—"}
                            </span>
                          )}
                          {friendAccounts.length > 0 ? (
                            <Badge
                              variant="secondary"
                              title={`LinkedIn Connected: ${friendAccounts.join(", ")}`}
                              className="shrink-0 border-sky-200 bg-sky-50 px-1.5 py-0 text-[10px] font-semibold text-sky-700 hover:bg-sky-50"
                            >
                              Connected
                            </Badge>
                          ) : null}
                          {pendingField && value ? (
                            <span className="shrink-0 text-[10px] font-medium text-amber-600">
                              待确认
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!conflicts?.length}
        onOpenChange={(next) => {
          if (!next) {
            setConflicts(null);
            setConflictContactId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm enrichment matches</DialogTitle>
            <DialogDescription>
              Found values differ from KeyPersonDB. Choose which ones to adopt. Empty fields were
              already filled automatically. Phone / Direct / Office may come from FullEnrich;
              WhatsApp Number is set only after WA probe confirms registration.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {(conflicts || []).map((item) => (
              <label
                key={item.field}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!selectedFields[item.field]}
                  onChange={(event) =>
                    setSelectedFields((prev) => ({
                      ...prev,
                      [item.field]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold">
                    {item.field === "directPhone"
                      ? "Direct Phone"
                      : item.field === "officePhone"
                        ? "Office Phone"
                        : item.field === "whatsapp"
                          ? "WhatsApp Number"
                          : item.field.charAt(0).toUpperCase() + item.field.slice(1)}
                  </div>
                  <div className="text-xs text-slate-500">Current: {item.current}</div>
                  <div className="text-xs text-emerald-700">Found: {item.proposed}</div>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConflicts(null);
                setConflictContactId(null);
              }}
            >
              Keep current
            </Button>
            <Button disabled={applying} onClick={() => void applyConflicts()}>
              {applying ? "Saving…" : "Apply selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type LaunchStepCopy = {
  subject?: string;
  cc?: string;
  content?: string;
  callGoal?: string;
  script?: string;
  attachments?: MediaAttachment[];
};

type LaunchBombOption = {id:string;name:string;version?:number;goal:string;cp?:string;status?:string;priority?:string|null;steps:Array<{id:string;channel:Channel;subject?:string;content:string;callGoal?:string;script?:string}>};

function LaunchEmailStepEditor({
  subject,
  cc,
  content,
  disabled,
  onChange,
  onUploadingChange,
}: {
  subject: string;
  cc: string;
  content: string;
  disabled?: boolean;
  onChange: (patch: Pick<LaunchStepCopy, "subject" | "cc" | "content" | "attachments">) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const media = useMessageMedia("Email");
  const readyKey = media.readyAttachments.map((item) => item.id).join("|");

  useEffect(() => {
    onChange({ attachments: media.readyAttachments });
    // Sync ready uploads into launch copies; intentionally keyed by attachment ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyKey]);

  useEffect(() => {
    onUploadingChange?.(media.uploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.uploading]);

  return (
    <div className="grid gap-2">
      <Input
        value={subject}
        onChange={(e) => onChange({ subject: e.target.value })}
        placeholder="Email subject"
        disabled={disabled}
      />
      <Input
        value={cc}
        onChange={(e) => onChange({ cc: e.target.value })}
        placeholder="CC (comma-separated)"
        disabled={disabled}
      />
      <MessageMediaInputFrame channel="Email" media={media} disabled={disabled}>
        <Textarea
          className="min-h-24"
          value={content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="Email body"
          disabled={disabled}
        />
      </MessageMediaInputFrame>
    </div>
  );
}

function asLaunchChannel(value?: string | null): Channel | null {
  return value && MESSAGE_CHANNELS.includes(value as Channel) ? value as Channel : null;
}

function bombDetailToLaunch(detail: BombDetail): LaunchBombOption {
  return {
    id: detail.id,
    name: detail.name,
    goal: detail.goal,
    cp: detail.cp || undefined,
    status: detail.status,
    priority: detail.priority,
    steps: detail.templates.flatMap((item) => {
      const channel = asLaunchChannel(item.channel);
      if (!channel) return [];
      return [{
        id: item.id,
        channel,
        subject: item.subject || undefined,
        content: item.content,
        callGoal: channel === "Phone" ? item.name || "Call" : undefined,
        script: channel === "Phone" ? item.content : undefined,
      }];
    }),
  };
}

export function LaunchBombDialog({customerId,open,onOpenChange,contacts,currentCp,companyName,productDescription,matchedCategory,followupExhibition,previewOnly,hasActiveOmniReach,onLaunched}:{customerId?:string;open:boolean;onOpenChange:(v:boolean)=>void;contacts?:Contact[];currentCp?:string;companyName?:string;productDescription?:string|null;matchedCategory?:string|null;followupExhibition?:string|null;previewOnly?:boolean;hasActiveOmniReach?:boolean;onLaunched?:()=>void}){
  const {state,launchBomb}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const [remoteBombs,setRemoteBombs]=useState<BombListItem[]>([]);
  const [remoteDetail,setRemoteDetail]=useState<LaunchBombOption>();
  const [bombId,setBombId]=useState("");
  const [target,setTarget]=useState("");
  const [copies,setCopies]=useState<Record<string,LaunchStepCopy>>({});
  const [emailUploading,setEmailUploading]=useState<Record<string,boolean>>({});
  const [launchedInstanceId,setLaunchedInstanceId]=useState("");
  const [previewReady,setPreviewReady]=useState(false);
  const [launchPlan,setLaunchPlan]=useState<{instanceId:string;state:WorkspaceState}|null>(null);
  const [launching,setLaunching]=useState(false);
  const localBombs=state.bombs.filter(b=>b.status==="Active"&&b.cp===c?.cp);
  const notionBombs=remoteBombs.filter(b=>b.status==="Active"&&(!currentCp||currentCp==="NONE"||!b.cp||b.cp.split(",").some(item=>item.trim()===currentCp)));
  const selected=previewOnly?remoteDetail:localBombs.find(b=>b.id===bombId);
  const targets=contacts||c?.contacts||[];
  const person=targets.find(t=>t.id===target);
  const ownerName=ownerNameFromContacts(targets);
  const templateContext=buildTemplateVariableContext({
    companyName:companyName||c?.name,
    productDescription,
    matchedCategory,
    followupExhibition,
    hasContact:!!person,
    contactName:person?.name,
    contactTitle:person?.title,
    contactRole:person?.contactRole,
    email:person?.email,
    phone:person?.phone,
    ownerName,
    ownerOrConnector:person?.role,
    linkedinUrl:person?.linkedin,
  });
  useEffect(()=>{
    if(!open||!previewOnly)return;
    let cancelled=false;
    fetch("/api/bombs")
      .then(async response=>{
        const payload=await response.json() as {bombs?:BombListItem[];error?:string};
        if(!response.ok)throw new Error(payload.error||"Failed to load OmniReach");
        return payload.bombs||[];
      })
      .then(items=>{if(!cancelled)setRemoteBombs(items);})
      .catch(()=>{if(!cancelled)setRemoteBombs([]);});
    return ()=>{cancelled=true};
  },[open,previewOnly]);
  useEffect(()=>{
    if(!open||!previewOnly||!bombId){if(previewOnly)setRemoteDetail(undefined);return;}
    let cancelled=false;
    fetch(`/api/bombs/${bombId}`)
      .then(async response=>{
        const payload=await response.json() as {bomb?:BombDetail;error?:string};
        if(!response.ok||!payload.bomb)throw new Error(payload.error||"OmniReach not found");
        return bombDetailToLaunch(payload.bomb);
      })
      .then(item=>{if(!cancelled)setRemoteDetail(item);})
      .catch(()=>{if(!cancelled)setRemoteDetail(undefined);});
    return ()=>{cancelled=true};
  },[open,previewOnly,bombId]);
  useEffect(()=>{
    if(open)return;
    setBombId("");
    setTarget("");
    setCopies({});
    setEmailUploading({});
    setRemoteDetail(undefined);
    setRemoteBombs([]);
    setLaunchPlan(null);
    setPreviewReady(false);
    setLaunchedInstanceId("");
  },[open]);
  useEffect(()=>{
    if(!selected||!person){setCopies({});return;}
    const next:Record<string,LaunchStepCopy>={};
    selected.steps.forEach(s=>{
      next[s.id]=resolveLaunchStepCopy({subject:s.subject,content:s.content,callGoal:s.callGoal,script:s.script},templateContext);
    });
    setCopies(next);
  },[selected,target,companyName,productDescription,matchedCategory,followupExhibition,ownerName]);
  const updateCopy=(id:string,patch:Partial<LaunchStepCopy>)=>setCopies(prev=>({...prev,[id]:{...prev[id],...patch}}));
  const unavailable=selected&&person
    ? selected.steps.filter((s)=>!channelAvailable(person,s.channel)).map((s)=>s.channel)
    : [];
  const incomplete=selected?.steps.some((s)=>{
    if(person&&!channelAvailable(person,s.channel))return false;
    const copy=copies[s.id];
    if(!copy)return true;
    if(s.channel==="Email"){
      const hasBody=!!copy.content?.trim()||(copy.attachments?.length||0)>0;
      return !copy.subject?.trim()||!hasBody;
    }
    if(s.channel==="Phone")return !copy.callGoal?.trim()||!copy.script?.trim();
    return !copy.content?.trim();
  });
  const anyEmailUploading=Object.values(emailUploading).some(Boolean);
  const hasReachableStep=!!selected&&!!person&&selected.steps.some((s)=>channelAvailable(person,s.channel));
  const launched=!!launchedInstanceId||previewReady||!!launchPlan;
  const launchedInstance=launchedInstanceId?state.bombInstances.find(item=>item.id===launchedInstanceId):undefined;
  const resultPlanState=launchPlan?.state || state;
  const resultPlanInstanceId=launchPlan?.instanceId || launchedInstanceId;
  return <Dialog open={open} onOpenChange={value=>{if(!value){setLaunchedInstanceId("");setPreviewReady(false);setLaunchPlan(null);setLaunching(false);}onOpenChange(value)}}><DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"><DialogHeader><DialogTitle>{launched?"OmniReach launched · execution plan":"Launch OmniReach"}</DialogTitle><DialogDescription>{launched?"The system assigned this execution order and schedule. This plan is read-only.":"Review and edit each step’s copy for this launch only. The template is not changed. After confirmation, the system assigns timing and order based on channel availability and caller capacity. Any meaningful reply stops the run."}</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      {!launched&&hasActiveOmniReach&&<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This Brand already has an active OmniReach. Stop it before launching another.</div>}
      {launched&&<div className="rounded-xl bg-emerald-50 p-4"><div className="text-sm font-semibold text-emerald-900">System assignment complete</div><p className="mt-1 text-xs text-emerald-800">{selected?`${selected.name}${selected.goal?` · ${selected.goal}`:""}`:launchedInstance?`${launchedInstance.templateName} · Version ${launchedInstance.version}`:"The order and timing below are informational only and cannot be edited."}{person?` · ${person.name}`:""}</p><div className="mt-4 rounded-xl border border-emerald-100 bg-white p-4">{resultPlanInstanceId?<BombExecutionPlan state={resultPlanState} instanceId={resultPlanInstanceId} contacts={targets} tone="success"/>:<div className="text-xs text-slate-500">Execution plan is loading…</div>}</div></div>}
      {!launched&&<>
      <label className="text-sm font-medium">OmniReach<Select value={bombId} onValueChange={v=>{setBombId(v);setTarget("");}}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select an OmniReach"/></SelectTrigger><SelectContent>{(previewOnly?notionBombs:localBombs).map(b=><SelectItem key={b.id} value={b.id}>{previewOnly?`${b.name}${b.cp?` · ${b.cp}`:""}`:`${b.name} · V${"version" in b ? b.version : ""}`}</SelectItem>)}</SelectContent></Select></label>
      {selected&&<>
        <label className="text-sm font-medium">Launch for<Select value={target} onValueChange={setTarget}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a KeyPerson"/></SelectTrigger><SelectContent>{targets.map(t=><SelectItem key={t.id} value={t.id}>{t.name} · {t.role}</SelectItem>)}</SelectContent></Select></label>
        {person&&<>
        <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{selected.goal}</b><p className="mt-1 text-xs text-slate-500">Edits apply only to this launch.</p>{unavailable.length>0&&<div className="mt-2 text-xs text-amber-700">No contact info for: {[...new Set(unavailable)].join(", ")}. These channels are disabled and will not create send tasks.</div>}</div>
        {selected.steps.map((s,index)=>{
          const copy=copies[s.id]||{};
          const disabled=!!person&&!channelAvailable(person,s.channel);
          return <div key={s.id} className={`rounded-xl bg-slate-50 p-4 ${disabled?"pointer-events-none opacity-50":""}`} aria-disabled={disabled||undefined}>
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className={`grid size-7 place-items-center rounded-md bg-slate-50 text-xs font-bold ${disabled?"text-slate-400":"text-violet-600"}`}>{index+1}</span><ChannelOption channel={s.channel}/></div><span className={`text-xs ${disabled?"font-medium text-slate-400":"text-slate-500"}`}>{disabled?"Unavailable · no contact info":"System will schedule this step"}</span></div>
            {s.channel==="Email"&&(
              <LaunchEmailStepEditor
                key={`${s.id}:${target}:${bombId}`}
                subject={copy.subject||""}
                cc={copy.cc||""}
                content={copy.content||""}
                disabled={disabled}
                onChange={(patch)=>updateCopy(s.id,patch)}
                onUploadingChange={(uploading)=>setEmailUploading((prev)=>(
                  prev[s.id]===uploading?prev:{...prev,[s.id]:uploading}
                ))}
              />
            )}
            {s.channel==="Phone"&&<div className="grid gap-2"><Input value={copy.callGoal||""} onChange={e=>updateCopy(s.id,{callGoal:e.target.value})} placeholder="Call goal" disabled={disabled}/><Textarea className="min-h-24" value={copy.script||""} onChange={e=>updateCopy(s.id,{script:e.target.value})} placeholder="Suggested script" disabled={disabled}/></div>}
            {s.channel!=="Email"&&s.channel!=="Phone"&&<Textarea className="min-h-24" value={copy.content||""} onChange={e=>updateCopy(s.id,{content:e.target.value})} placeholder={`${s.channel} content`} disabled={disabled}/>}
          </div>;
        })}
        </>}
      </>}
      </>}
    </div>
    <DialogFooter>{launched?<Button onClick={()=>onOpenChange(false)}>Done</Button>:<><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={launching||anyEmailUploading||!selected||!person||!hasReachableStep||incomplete||!!hasActiveOmniReach||(!previewOnly&&(!!c?.activeBombId||c?.status==="Bomb Running"))} onClick={()=>{if(!selected||!person)return;if(previewOnly){if(!customerId)return;void (async ()=>{setLaunching(true);try{const response=await fetch(`/api/brands/${customerId}/launch`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bombId:selected.id,contactId:person.id,copies})});const payload=await response.json() as {message?:string;error?:string;omniReachRunId?:string;bombId?:string;bombName?:string;contactId?:string;steps?:Array<{taskId:string;channel:string;scheduledAt:string;templateId?:string;content:string;attachments?:MediaAttachment[]}>};if(!response.ok)throw new Error(payload.error||"Launch failed");if(!payload.omniReachRunId||!payload.steps?.length)throw new Error("Launch succeeded but no execution plan steps were returned");const plan=launchPlanFromApiSteps({customerId,bombId:payload.bombId||selected.id,bombName:payload.bombName||selected.name,contactId:payload.contactId||person.id,omniReachRunId:payload.omniReachRunId,steps:payload.steps});setLaunchPlan(plan);setPreviewReady(true);toast.success(payload.message||"OmniReach launched");onLaunched?.();}catch(error){toast.error(error instanceof Error?error.message:"Launch failed");}finally{setLaunching(false);}})();return;}if(!c)return;const r=launchBomb(c.id,selected.id,person.id,copies);show(r);if(r.ok&&r.id)setLaunchedInstanceId(r.id);}}>Launch OmniReach</Button></>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function ReplyDialog({
  customerId,
  open,
  onOpenChange,
  contacts,
  initialChannel,
  contentClassName,
  readOnly = false,
  onSend,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contacts?: Contact[];
  initialChannel?: Channel;
  contentClassName?: string;
  readOnly?: boolean;
  onSend?: (
    contactId: string,
    channel: Channel,
    content: string,
    object?: string,
    deliveryMode?: DeliveryMode,
    scheduledAt?: string,
    attachments?: MediaAttachment[],
    cc?: string,
  ) => Promise<void>;
}) {
  const { state, sendHumanReply } = useWorkspace();
  const local = state.customers.find((x) => x.id === customerId);
  const people = contacts || local?.contacts || [];
  const [contactId, setContact] = useState(people[0]?.id || "");
  const [channel, setChannel] = useState<Channel>(people[0]?.preferredChannel || "Email");
  const [object, setObject] = useState("");
  const [cc, setCc] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("queue");
  const [scheduledAt, setScheduledAt] = useState("");
  const media = useMessageMedia(channel);
  const [linkedinGate, setLinkedinGate] = useState<{
    available: boolean;
    reason: string | null;
  } | null>(null);
  const [linkedinLoading, setLinkedinLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContact(people[0]?.id || "");
    setChannel(initialChannel || people[0]?.preferredChannel || "Email");
    setObject("");
    setCc("");
    setContent("");
    setDeliveryMode("queue");
    setScheduledAt("");
    setLinkedinGate(null);
    media.reset();
  }, [open, customerId]);

  const contact = people.find((x) => x.id === contactId) || people[0];
  const notionBacked = !!onSend;

  useEffect(() => {
    if (!open || !notionBacked || !contact?.id) {
      setLinkedinGate(null);
      setLinkedinLoading(false);
      return;
    }
    if (!channelAvailable(contact, "LinkedIn")) {
      setLinkedinGate({
        available: false,
        reason: "No LinkedIn profile on this contact.",
      });
      setLinkedinLoading(false);
      return;
    }

    let cancelled = false;
    setLinkedinLoading(true);
    setLinkedinGate(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/brands/${customerId}/linkedin-availability?contactId=${encodeURIComponent(contact.id)}&deliveryMode=${encodeURIComponent(deliveryMode)}`,
        );
        const payload = (await response.json()) as {
          available?: boolean;
          reason?: string | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setLinkedinGate({
            available: false,
            reason: payload.error || "Unable to check LinkedIn availability.",
          });
          return;
        }
        setLinkedinGate({
          available: !!payload.available,
          reason: payload.reason || null,
        });
      } catch {
        if (!cancelled) {
          setLinkedinGate({
            available: false,
            reason: "Unable to check LinkedIn availability.",
          });
        }
      } finally {
        if (!cancelled) setLinkedinLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, notionBacked, customerId, contact?.id, contact?.linkedin, deliveryMode]);

  const linkedInAllowed =
    !!contact &&
    channelAvailable(contact, "LinkedIn") &&
    (!notionBacked || (!linkedinLoading && linkedinGate?.available === true));

  const available = MESSAGE_CHANNELS.filter((ch) => {
    if (!contact || !channelAvailable(contact, ch)) return false;
    if (ch === "LinkedIn") return linkedInAllowed;
    return true;
  });
  const effective = available.includes(channel) ? channel : available[0];
  const emailNeedsObject = effective === "Email";
  const hasBody =
    (emailNeedsObject ? !emailBodyIsEmpty(content) : !!content.trim()) ||
    media.readyAttachments.length > 0;
  const canSubmit =
    !!contact &&
    hasBody &&
    !!effective &&
    (!emailNeedsObject || !!object.trim()) &&
    !saving &&
    !media.uploading;

  const linkedInBlockedReason =
    linkedinGate?.reason ||
    (linkedinLoading ? "Checking LinkedIn availability…" : "LinkedIn is unavailable for this contact.");

  const onChannelChange = (value: string) => {
    const next = value as Channel;
    if (next === "LinkedIn" && !linkedInAllowed) {
      toast.error(linkedInBlockedReason);
      return;
    }
    setChannel(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg ${contentClassName || ""}`}>
        <DialogHeader className="shrink-0">
          <DialogTitle>Send message</DialogTitle>
          <DialogDescription>
            Choose Email, Phone, SMS, WhatsApp, or LinkedIn. An active OmniReach will stop before this human message is sent.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-2 gap-3">
          <Select value={contact?.id} onValueChange={setContact}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {people.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name} · {x.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={effective} onValueChange={onChannelChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESSAGE_CHANNELS.map((x) => {
                const profileOk = !!contact && channelAvailable(contact, x);
                // Keep LinkedIn selectable when only the gate blocks it, so click can toast the reason.
                const gateBlocked = x === "LinkedIn" && profileOk && notionBacked && !linkedInAllowed;
                const radixDisabled =
                  !contact ||
                  !profileOk ||
                  (x === "LinkedIn" && notionBacked && linkedinLoading);
                return (
                  <SelectItem
                    key={x}
                    value={x}
                    disabled={radixDisabled}
                    className={gateBlocked ? "opacity-50" : undefined}
                  >
                    <ChannelOption channel={x} />
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        {notionBacked &&
        contact &&
        channelAvailable(contact, "LinkedIn") &&
        !linkedInAllowed ? (
          <p className="text-xs text-amber-700">LinkedIn unavailable: {linkedInBlockedReason}</p>
        ) : null}
        {emailNeedsObject ? (
          <Input value={object} onChange={(e) => setObject(e.target.value)} placeholder="Email subject" />
        ) : null}
        {emailNeedsObject ? (
          <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="CC (comma-separated)" />
        ) : null}
        <MessageMediaInputFrame channel={effective} media={media} disabled={readOnly || saving}>
          {emailNeedsObject ? (
            <EmailBodyEditor
              value={content}
              onChange={setContent}
              disabled={saving}
              placeholder="Write an email…"
            />
          ) : (
            <Textarea
              className="max-h-60 min-h-32 resize-none overflow-y-auto [field-sizing:fixed]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a reply…"
            />
          )}
        </MessageMediaInputFrame>
        <div className="flex shrink-0 justify-end">
          <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} scheduledAt={scheduledAt} onScheduledAtChange={setScheduledAt} />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={readOnly || !canSubmit}
            onClick={() => {
              void (async () => {
                if (!contact || !effective) return;
                if (emailNeedsObject && !object.trim()) {
                  toast.error("Subject is required for Email");
                  return;
                }
                if (onSend) {
                  setSaving(true);
                  try {
                    await onSend(
                      contact.id,
                      effective,
                      content,
                      emailNeedsObject ? object.trim() : undefined,
                      deliveryMode,
                      scheduledAt ? easternDateTimeLocalToIso(scheduledAt) : undefined,
                      media.readyAttachments,
                      emailNeedsObject ? cc : undefined,
                    );
                    toast.success("Message saved as pending");
                    setObject("");
                    setCc("");
                    setContent("");
                    media.reset();
                    onOpenChange(false);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Send failed");
                  } finally {
                    setSaving(false);
                  }
                  return;
                }
                const r = sendHumanReply(
                  customerId,
                  contact.id,
                  effective,
                  emailNeedsObject && object.trim()
                    ? `Subject: ${object.trim()}\n\n${content}`
                    : content,
                );
                show(r);
                if (r.ok) {
                  setObject("");
                  setCc("");
                  setContent("");
                  onOpenChange(false);
                }
              })();
            }}
          >
            <Send className="mr-2 size-4" />
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export function ChangeCPDialog({customerId,open,onOpenChange,currentCp,cps,onSave}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void;currentCp?:string;cps?:CurrentCpOption[];onSave?:(currentCpId:string,evidence:string,note:string)=>Promise<void>}){
  const {state,changeCP}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const options=cps?.length?cps:listCurrentCps();
  const currentName=currentCp||c?.cp||"NONE";
  const [cpId,setCP]=useState(options.find(item=>item.name===currentName)?.id||options[0]?.id||"");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(!open)return;
    setCP(options.find(item=>item.name===currentName)?.id||options[0]?.id||"");
    setNote("");
  },[open,currentName,customerId]);
  const selected=options.find(item=>item.id===cpId);
  const stage=currentCpOption(selected?.name).criteria||state.cps.find(item=>item.code===selected?.name)?.criteria;
  const criteriaItems=(stage||"").split("\n").map(item=>item.trim()).filter(Boolean);
  const evidence="Manually confirmed CP update";
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Change Brand CP</DialogTitle><DialogDescription>CP never changes automatically. Review the completion criteria and confirm.</DialogDescription></DialogHeader><Select value={cpId} onValueChange={setCP}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.fullName||x.name}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900"><b>Completion Criteria</b><ol className="mt-2 list-decimal space-y-1 pl-5">{criteriaItems.map(item=><li key={item}>{item}</li>)}</ol></div><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!selected||selected.name===currentName||saving} onClick={()=>{void (async ()=>{if(!selected)return;if(onSave){setSaving(true);try{await onSave(selected.id,evidence,note);toast.success(`Brand moved to ${selected.name}`);onOpenChange(false);}catch(error){toast.error(error instanceof Error?error.message:"Update failed");}finally{setSaving(false);}return;}const r=changeCP(customerId,selected.name as CPCode,evidence,note);show(r);if(r.ok)onOpenChange(false);})()}}>Move to {selected?.name||"CP"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function FollowUpDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createFollowUp}=useWorkspace();const [days,setDays]=useState("3");const [reason,setReason]=useState("");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Schedule follow-up</DialogTitle><DialogDescription>This creates a human reminder. Nothing is sent automatically.</DialogDescription></DialogHeader><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[["1","Tomorrow"],["3","In 3 days"],["5","In 5 days"],["7","In 7 days"]].map(x=><SelectItem key={x[0]} value={x[0]}>{x[1]}</SelectItem>)}</SelectContent></Select><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={()=>{const r=createFollowUp(customerId,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),reason,note);show(r);if(r.ok)onOpenChange(false)}}>Schedule</Button></DialogFooter></DialogContent></Dialog>}

export function CreateCallDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createCallTask}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const valid=c?.contacts.filter(x=>x.phone&&x.phoneValid)||[];const [contact,setContact]=useState(valid[0]?.id||"");const [days,setDays]=useState("1");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create Call Task</DialogTitle><DialogDescription>The capacity scheduler chooses the Caller and may move the date.</DialogDescription></DialogHeader><Select value={contact||valid[0]?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue placeholder="Valid phone contact"/></SelectTrigger><SelectContent>{valid.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.phone}</SelectItem>)}</SelectContent></Select><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Today</SelectItem><SelectItem value="1">Tomorrow</SelectItem><SelectItem value="3">In 3 days</SelectItem></SelectContent></Select><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Goal and context"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!valid.length} onClick={()=>{const r=createCallTask(customerId,contact||valid[0].id,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),note);show(r);if(r.ok)onOpenChange(false)}}>Create Task</Button></DialogFooter></DialogContent></Dialog>}

function ContactDialog({
  customerId,
  open,
  onOpenChange,
  notionBacked,
  onCreated,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  notionBacked?: boolean;
  onCreated?: () => Promise<void> | void;
}) {
  const { updateContact } = useWorkspace();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<Contact["role"]>("Other");
  const [contactOrder, setContactOrder] = useState<"Primary" | "Secondary" | "Backup" | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setTitle("");
    setRole("Other");
    setContactOrder("");
    setEmail("");
    setPhone("");
    setLinkedin("");
  };

  const save = async () => {
    if (!name.trim()) return;
    if (!notionBacked) {
      const r = updateContact(customerId, {
        id: uid("ct"),
        name: name.trim(),
        role,
        email: email || undefined,
        phone: phone || undefined,
        whatsapp: phone || undefined,
        linkedin: linkedin || undefined,
        preferredChannel: email ? "Email" : "Phone",
        emailValid: !!email,
        phoneValid: !!phone,
      });
      show(r);
      if (r.ok) {
        reset();
        onOpenChange(false);
      }
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/brands/${customerId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim() || null,
          ownerOrConnector: role === "Other" ? null : role,
          email: email.trim() || null,
          phone: phone.trim() || null,
          linkedin: linkedin.trim() || null,
          contactOrder: contactOrder || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create KeyPerson");
      toast.success("KeyPerson created");
      await onCreated?.();
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create KeyPerson");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add KeyPerson</DialogTitle>
          <DialogDescription>
            {notionBacked
              ? "Creates KeyPersonDB + Follow-up Contact linked to this brand’s ClientDB record."
              : "Channel availability is derived from valid contact details."}
          </DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        {notionBacked && (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
        )}
        <Select value={role} onValueChange={(v) => setRole(v as Contact["role"])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["Connector", "Owner", "Other"].map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {notionBacked && (
          <Select
            value={contactOrder || "none"}
            onValueChange={(v) =>
              setContactOrder(v === "none" ? "" : (v as "Primary" | "Secondary" | "Backup"))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Contact order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No contact order</SelectItem>
              <SelectItem value="Primary">Primary</SelectItem>
              <SelectItem value="Secondary">Secondary</SelectItem>
              <SelectItem value="Backup">Backup</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" />
        {notionBacked && (
          <Input
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
            placeholder="LinkedIn URL (optional)"
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save KeyPerson"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
