"use client";

import { useMemo, useState } from "react";
import { Bomb, CheckCircle2, Clock3, MessageCircle, Phone, UserRound } from "lucide-react";
import { Channel, Contact, Interaction } from "@/lib/outreach-domain";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const exactTime = (iso: string) => {
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

const contactPoint = (contact: Contact, channel?: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") return contact.linkedin ? `linkedin.com/in/${contact.linkedin}` : undefined;
  if (channel === "SMS" || channel === "Phone") return contact.phone;
  return contact.email || contact.phone;
};

const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

export function InteractionFeed({ interactions, contacts, maxHeight = "max-h-[520px]" }: { interactions: Interaction[]; contacts: Contact[]; maxHeight?: string }) {
  const [contactId, setContactId] = useState("all");
  const [channel, setChannel] = useState("all");
  const channels = useMemo(() => [...new Set(interactions.flatMap(interaction => interaction.channel ? [interaction.channel] : []))], [interactions]);
  const activeContactId = contactId === "all" || contacts.some(contact => contact.id === contactId) ? contactId : "all";
  const activeChannel = channel === "all" || channels.includes(channel as Channel) ? channel : "all";
  const visible = interactions.filter(interaction => (activeContactId === "all" || interaction.contactId === activeContactId) && (activeChannel === "all" || interaction.channel === activeChannel));

  return <div>
    <div className="flex flex-col gap-2 border-b bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center">
      <div className="mr-auto text-xs text-slate-500"><b className="text-slate-900">{visible.length}</b> complete records</div>
      <Select value={activeContactId} onValueChange={setContactId}><SelectTrigger size="sm" className="w-full bg-white sm:w-48"><SelectValue placeholder="All Contacts"/></SelectTrigger><SelectContent><SelectItem value="all">All Contacts</SelectItem>{contacts.map(contact => <SelectItem key={contact.id} value={contact.id}>{contact.name} · {contact.role}</SelectItem>)}</SelectContent></Select>
      <Select value={activeChannel} onValueChange={setChannel}><SelectTrigger size="sm" className="w-full bg-white sm:w-40"><SelectValue placeholder="All channels"/></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem>{channels.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
    </div>
    <div className={`${maxHeight} divide-y overflow-y-auto`}>
    {visible.length ? visible.map(interaction => {
      const contact = contacts.find(item => item.id === interaction.contactId);
      const communication = interaction.type === "Message" || interaction.type === "Phone";
      const outbound = interaction.direction === "Outbound";
      const route = contact ? outbound ? `FC Team → ${contact.name}` : `${contact.name} → FC Team` : "System activity";
      const endpoint = contact ? contactPoint(contact, interaction.channel) : undefined;
      const Icon = interaction.type === "Phone" ? Phone : interaction.type === "Message" ? MessageCircle : interaction.type === "CP" ? CheckCircle2 : interaction.type === "Bomb" ? Bomb : Clock3;
      return <article key={interaction.id} className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${interaction.type === "Phone" ? "bg-blue-100 text-blue-700" : interaction.type === "Message" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}><Icon className="size-4"/></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-950">{interaction.channel || interaction.type}</h4>{interaction.direction && <Badge variant="outline" className="text-[10px]">{interaction.direction}</Badge>}{interaction.outcome && <Badge variant="secondary" className="text-[10px]">{interaction.outcome}</Badge>}</div>
                <div className="mt-1 text-xs font-medium text-slate-600">{route}</div>
              </div>
              <time dateTime={interaction.createdAt} className="shrink-0 font-mono text-xs text-slate-500">{exactTime(interaction.createdAt)}</time>
            </div>

            {contact ? <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><Avatar className="size-8"><AvatarFallback className="bg-white text-[10px] font-bold text-slate-700">{initials(contact.name)}</AvatarFallback></Avatar><div className="min-w-0"><div className="text-xs font-semibold text-slate-900">{contact.name} <span className="font-normal text-slate-500">· {contact.role}</span></div><div className="mt-0.5 truncate text-xs text-slate-500">{interaction.channel}{endpoint ? ` · ${endpoint}` : ""}</div></div></div> : communication ? <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><UserRound className="size-3.5"/>Contact not linked</div> : null}

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4"><div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">{communication ? interaction.type === "Phone" ? "Full call record" : "Full message" : interaction.title}</div><p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{interaction.content}</p></div>
            {interaction.recording && <Button size="sm" variant="link" className="mt-2 px-0"><Phone className="mr-2 size-3.5"/>Play full recording</Button>}
          </div>
        </div>
      </article>;
    }) : <div className="p-16 text-center text-sm text-slate-500">No matching activity.</div>}
    </div>
  </div>;
}
