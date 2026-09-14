"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Channel, Contact, Interaction, ScheduledAction, WorkspaceState } from "@/lib/outreach-domain";
import { useWorkspace } from "./workspace-store";
import { ChannelOption } from "./channel-icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const show = (result: { ok: boolean; message: string }) => result.ok ? toast.success(result.message) : toast.error(result.message);
const channelAvailable = (contact: Contact, channel: Channel) =>
  channel === "Email" ? !!contact.email && contact.emailValid
  : channel === "Phone" || channel === "SMS" ? !!contact.phone && contact.phoneValid
  : channel === "WhatsApp" ? !!contact.whatsapp
  : channel === "LinkedIn" ? !!contact.linkedin
  : false;

function sameConversation(left: Interaction, right: Interaction) {
  if (left.customerId !== right.customerId || left.contactId !== right.contactId) return false;
  if (left.channel && right.channel && left.channel !== right.channel) return false;
  if (left.threadId && right.threadId) return left.threadId === right.threadId;
  return true;
}

function humanTookOver(inbound: Interaction, interactions: Interaction[]) {
  return interactions.some(item =>
    item.direction === "Outbound" &&
    item.creationMethod === "Manual" &&
    sameConversation(item, inbound)
  );
}

export function inboundNeedsComposer(state: WorkspaceState, inbound: Interaction, interactions = state.interactions, bombInstanceId?: string) {
  if (inbound.direction !== "Inbound") return false;
  if (bombInstanceId && humanTookOver(inbound, interactions)) return false;
  if (interactions.some(item =>
    item.direction === "Outbound" &&
    sameConversation(item, inbound) &&
    item.createdAt > inbound.createdAt
  )) return false;
  const inbox = state.inbox.find(item =>
    item.customerId === inbound.customerId &&
    item.status === "Needs Reply" &&
    (!item.contactId || !inbound.contactId || item.contactId === inbound.contactId)
  );
  if (inbox) return !humanTookOver(inbound, interactions);
  return true;
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
  onSend?: (contactId: string, channel: Channel, content: string, taskId?: string) => Promise<void>;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const customer = state.customers.find(item => item.id === customerId);
  const people = contacts || customer?.contacts || [];
  const [contactId, setContactId] = useState(interaction.contactId || people[0]?.id || "");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const contact = people.find(item => item.id === contactId) || people[0];
  const channels: Channel[] = ["Email", "Phone", "SMS", "WhatsApp", "LinkedIn"];
  const available = channels.filter(item => contact && channelAvailable(contact, item));
  const defaultChannel = interaction.channel && available.includes(interaction.channel)
    ? interaction.channel
    : contact?.preferredChannel && available.includes(contact.preferredChannel)
      ? contact.preferredChannel
      : available[0];
  const [channel, setChannel] = useState<Channel>(defaultChannel || "Email");
  if (!can("reply") || !people.length || customer?.status === "Closed" || !inboundNeedsComposer(state, interaction, interactions, bombInstanceId)) return null;
  const effective = available.includes(channel) ? channel : available[0];
  const replyTaskId = actions?.find(item => item.bombInstanceId === bombInstanceId && item.channel === effective)?.id || taskId;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select value={contact?.id} onValueChange={setContactId}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="KeyPerson"/></SelectTrigger>
            <SelectContent>{people.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={effective} onValueChange={value => setChannel(value as Channel)}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Channel"/></SelectTrigger>
            <SelectContent>{channels.map(item => <SelectItem key={item} value={item} disabled={!contact || !channelAvailable(contact, item)}><ChannelOption channel={item}/></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <span className="text-xs text-slate-400">Reply needed</span>
      </div>
      <div className="flex gap-2">
        <Textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…"/>
        <Button className="h-20 px-5" disabled={!contact || !content.trim() || !effective || saving} onClick={() => {
          if (!contact || !effective) return;
          if (onSend) {
            setSaving(true);
            void onSend(contact.id, effective, content, replyTaskId)
              .then(() => { toast.success("Message saved as pending"); setContent(""); })
              .catch(error => toast.error(error instanceof Error ? error.message : "Send failed"))
              .finally(() => setSaving(false));
            return;
          }
          if (!customer) return;
          const result = sendHumanReply(customer.id, contact.id, effective, content, bombInstanceId || interaction.bombInstanceId);
          show(result);
          if (result.ok) setContent("");
        }}><Send className="size-4"/></Button>
      </div>
    </div>
  );
}
