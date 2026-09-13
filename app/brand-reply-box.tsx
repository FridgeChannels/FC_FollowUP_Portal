"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Channel, Contact, Interaction, WorkspaceState } from "@/lib/outreach-domain";
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

export function inboundNeedsComposer(state: WorkspaceState, inbound: Interaction) {
  if (inbound.direction !== "Inbound") return false;
  const inbox = state.inbox.find(item =>
    item.customerId === inbound.customerId &&
    item.status === "Needs Reply" &&
    (!item.contactId || !inbound.contactId || item.contactId === inbound.contactId)
  );
  if (inbox) return true;
  return !state.interactions.some(item =>
    item.customerId === inbound.customerId &&
    item.contactId === inbound.contactId &&
    item.direction === "Outbound" &&
    item.createdAt > inbound.createdAt
  );
}

export function BrandReplyBox({
  customerId,
  interaction,
  bombInstanceId,
}: {
  customerId: string;
  interaction: Interaction;
  bombInstanceId?: string;
}) {
  const { state, can, sendHumanReply } = useWorkspace();
  const customer = state.customers.find(item => item.id === customerId);
  const [contactId, setContactId] = useState(interaction.contactId || customer?.contacts[0]?.id || "");
  const [content, setContent] = useState("");
  const contact = customer?.contacts.find(item => item.id === contactId) || customer?.contacts[0];
  const options = (["Email", "SMS", "WhatsApp", "LinkedIn"] as Channel[]).filter(channel => contact && channelAvailable(contact, channel));
  const defaultChannel = interaction.channel && options.includes(interaction.channel)
    ? interaction.channel
    : contact?.preferredChannel && options.includes(contact.preferredChannel)
      ? contact.preferredChannel
      : options[0];
  const [channel, setChannel] = useState<Channel>(defaultChannel || "Email");
  if (!can("reply") || !customer || customer.status === "Closed" || !inboundNeedsComposer(state, interaction)) return null;
  const effective = options.includes(channel) ? channel : options[0];
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Select value={contact?.id} onValueChange={setContactId}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="KeyPerson"/></SelectTrigger>
            <SelectContent>{customer.contacts.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={effective} onValueChange={value => setChannel(value as Channel)}>
            <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Channel"/></SelectTrigger>
            <SelectContent>{options.map(item => <SelectItem key={item} value={item}><ChannelOption channel={item}/></SelectItem>)}</SelectContent>
          </Select>
        </div>
        <span className="text-xs text-slate-400">Reply needed</span>
      </div>
      <div className="flex gap-2">
        <Textarea value={content} onChange={event => setContent(event.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…"/>
        <Button className="h-20 px-5" disabled={!contact || !content.trim() || !effective} onClick={() => {
          if (!contact || !effective) return;
          const result = sendHumanReply(customer.id, contact.id, effective, content, bombInstanceId || interaction.bombInstanceId);
          show(result);
          if (result.ok) setContent("");
        }}><Send className="size-4"/></Button>
      </div>
    </div>
  );
}
