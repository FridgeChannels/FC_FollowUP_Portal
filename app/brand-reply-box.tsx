"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Channel, Contact, Interaction, ScheduledAction, WorkspaceState } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SendTimingToggle, type DeliveryMode } from "./send-timing-toggle";

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);
const channelAvailable = (contact: Contact, channel: Channel) =>
  channel === "Email" ? !!contact.email && contact.emailValid
  : channel === "Phone" || channel === "SMS" ? !!contact.phone && contact.phoneValid
  : channel === "WhatsApp" ? !!contact.whatsapp
  : channel === "LinkedIn" ? !!contact.linkedin
  : false;

function activityTime(value?: string) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? 0 : time;
}

function sameConversation(left: Interaction, right: Interaction) {
  if (left.customerId !== right.customerId) return false;
  if (left.contactId && right.contactId && left.contactId !== right.contactId) return false;
  if (left.channel && right.channel && left.channel !== right.channel) return false;
  if (left.threadId || right.threadId) return !!left.threadId && left.threadId === right.threadId;
  if (left.taskId || right.taskId) return !!left.taskId && left.taskId === right.taskId;
  if (left.bombInstanceId && right.bombInstanceId) return left.bombInstanceId === right.bombInstanceId;
  return false;
}

function isHumanOutbound(item: Interaction) {
  return item.direction === "Outbound" && item.creationMethod === "Manual";
}

function hasLaterHumanOutbound(inbound: Interaction, interactions: Interaction[]) {
  const inboundAt = activityTime(inbound.createdAt);
  return interactions.some(item =>
    isHumanOutbound(item) &&
    sameConversation(item, inbound) &&
    activityTime(item.createdAt) > inboundAt
  );
}

function laterThan(left: Interaction, right: Interaction) {
  const leftTime = activityTime(left.createdAt);
  const rightTime = activityTime(right.createdAt);
  return leftTime > rightTime || (leftTime === rightTime && left.id.localeCompare(right.id) > 0);
}

function inboundIsAwaitingReply(inbound: Interaction, interactions: Interaction[]) {
  if (inbound.direction !== "Inbound") return false;
  if (inbound.replyStatus === "Replied") return false;
  if (inbound.replyStatus === "Needs Reply") return true;
  return !hasLaterHumanOutbound(inbound, interactions);
}

export function inboundNeedsComposer(_state: WorkspaceState, inbound: Interaction, interactions = _state.interactions) {
  if (!inboundIsAwaitingReply(inbound, interactions)) return false;
  return !interactions.some(item =>
    item.id !== inbound.id &&
    inboundIsAwaitingReply(item, interactions) &&
    sameConversation(item, inbound) &&
    laterThan(item, inbound)
  );
}

export function BrandReplyBox({
  customerId,
  interaction,
  bombInstanceId,
  contacts,
  interactions,
  actions,
  taskId,
  onSend,
}: {
  customerId: string;
  interaction: Interaction;
  bombInstanceId?: string;
  contacts?: Contact[];
  interactions?: Interaction[];
  actions?: ScheduledAction[];
  taskId?: string;
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string) => Promise<void>;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const customer = state.customers.find(item => item.id === customerId);
  const people = contacts || customer?.contacts || [];
  const [content, setContent] = useState("");
  const [subject, setSubject] = useState(() =>
    interaction.channel === "Email" && interaction.title !== "Email" ? interaction.title : "",
  );
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("scheduled");
  const contact = people.find(item => item.id === interaction.contactId) || people[0];
  const channel = interaction.channel;
  const notionBacked = !!onSend;
  if (!can("reply") || !people.length) return null;
  if (!notionBacked && customer?.status === "Closed") return null;
  if (!inboundNeedsComposer(state, interaction, interactions)) return null;
  if (!contact || !channel) return null;
  const replyTaskId = interaction.taskId || actions?.find(item => item.bombInstanceId === bombInstanceId && item.channel === channel)?.id || taskId;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium text-slate-600">{contact.name} · {channel}</div>
        <span className="text-xs text-slate-400">Reply needed</span>
      </div>
      <div className="min-w-0 space-y-2">
        {channel === "Email" && <Input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Email subject" />}
        <Textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…"/>
        <div className="flex items-center justify-end gap-2">
          <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} />
          <Button className="h-9 px-3" disabled={!content.trim() || (channel === "Email" && !subject.trim()) || saving} onClick={() => {
          if (onSend) {
            setSaving(true);
            void onSend(contact.id, channel, content, replyTaskId, interaction.threadId, subject)
              .then(() => { toast.success("Message saved as pending"); setContent(""); setSubject(""); })
              .catch(error => toast.error(error instanceof Error ? error.message : "Send failed"))
              .finally(() => setSaving(false));
            return;
          }
          if (!customer) return;
          const result = sendHumanReply(customer.id, contact.id, channel, content, bombInstanceId || interaction.bombInstanceId);
          show(result);
          if (result.ok) setContent("");
          }}><Send className="size-4"/></Button>
        </div>
      </div>
    </div>
  );
}

export function ChannelSendBox({
  customerId,
  channel,
  contacts,
  interactions,
  onSend,
}: {
  customerId?: string;
  channel: Channel;
  contacts: Contact[];
  interactions: Interaction[];
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string, subject?: string) => Promise<void>;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const people = contacts.filter(item => channelAvailable(item, channel));
  const latest = [...interactions]
    .filter(item => item.contactId && people.some(person => person.id === item.contactId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const [contactId, setContactId] = useState(latest?.contactId || people[0]?.id || "");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("scheduled");
  useEffect(() => {
    setContactId(latest?.contactId || people[0]?.id || "");
    setContent("");
  }, [channel, customerId]);
  const contact = people.find(item => item.id === contactId) || people[0];
  const customer = state.customers.find(item => item.id === customerId);
  const channelHasPendingReply = interactions.some(item => item.channel === channel && inboundNeedsComposer(state, item, interactions));
  if (!can("reply") || !customerId) return null;
  if (!onSend && customer?.status === "Closed") return null;
  if (channelHasPendingReply) return null;
  if (!people.length) {
    return <div className="border-t border-slate-200 px-5 py-4 text-sm text-slate-400">No contact has a valid {channel} endpoint.</div>;
  }

  const pool = interactions.filter(item => item.contactId === contact?.id && item.channel === channel);
  const latestOutbound = [...pool].reverse().find(item => item.direction === "Outbound");
  const threadId = latestOutbound?.threadId || pool.at(-1)?.threadId;
  const taskId = latestOutbound?.taskId || pool.at(-1)?.taskId;

  return (
    <div className="border-t border-slate-200 px-5 py-4">
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <Select value={contact?.id} onValueChange={setContactId}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="KeyPerson"/></SelectTrigger>
            <SelectContent>{people.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-slate-400">Send {channel}</span>
        </div>
        <div className="space-y-2">
          <Textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            className="min-h-20 resize-none"
            placeholder={`Write ${channel === "Phone" ? "a call note" : `a ${channel} message`}…`}
          />
          <div className="flex items-center justify-end gap-2">
            <SendTimingToggle value={deliveryMode} onValueChange={setDeliveryMode} />
            <Button className="h-9 px-3" disabled={!contact || !content.trim() || saving} onClick={() => {
            if (!contact) return;
            if (onSend) {
              setSaving(true);
              void onSend(contact.id, channel, content, taskId, threadId)
                .then(() => { toast.success("Message saved as pending"); setContent(""); })
                .catch(error => toast.error(error instanceof Error ? error.message : "Send failed"))
                .finally(() => setSaving(false));
              return;
            }
            const result = sendHumanReply(customerId, contact.id, channel, content, latestOutbound?.bombInstanceId);
            show(result);
            if (result.ok) setContent("");
            }}><Send className="size-4"/></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
