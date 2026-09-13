"use client";

import { useState } from "react";
import { Bomb, CheckCircle2, Clock3, MessageCircle, Phone, UserRound } from "lucide-react";
import { Channel, Contact, CPCode, Interaction } from "@/lib/outreach-domain";
import { BombExecutionPlan, findBombInstance, formatUtcTime } from "./bomb-plan";
import { ChannelIcon, ChannelOption } from "./channel-icon";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const contactPoint = (contact: Contact, channel?: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") return contact.linkedin ? `linkedin.com/in/${contact.linkedin}` : undefined;
  if (channel === "SMS" || channel === "Phone") return contact.phone;
  return contact.email || contact.phone;
};

const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();
const allChannels: Channel[] = ["Email", "SMS", "WhatsApp", "LinkedIn", "Phone"];

const cpCodes: CPCode[] = ["CP1", "CP2", "CP3"];

export function InteractionFeed({ interactions, contacts, customerId: customerIdProp, maxHeight = "max-h-[520px]" }: { interactions: Interaction[]; contacts: Contact[]; customerId?: string; maxHeight?: string }) {
  const { state } = useWorkspace();
  const [contactId, setContactId] = useState("all");
  const [channel, setChannel] = useState("all");
  const activeContactId = contactId === "all" || contacts.some(contact => contact.id === contactId) ? contactId : "all";
  const activeChannel = channel === "all" || allChannels.includes(channel as Channel) ? channel : "all";
  const customerId = customerIdProp || interactions[0]?.customerId;
  const customer = state.customers.find(item=>item.id===customerId);
  const currentCp = customer?.cp || "CP1";
  const [selectedCp,setSelectedCp]=useState<CPCode>(currentCp);
  const instanceFor = (interaction:Interaction) => {
    if(interaction.bombInstanceId)return state.bombInstances.find(item=>item.id===interaction.bombInstanceId);
    if(interaction.type==="Bomb")return findBombInstance(state,interaction);
    return state.bombInstances.find(instance=>instance.customerId===interaction.customerId&&interaction.contactId===instance.targetContactId&&interaction.createdAt>=instance.startedAt&&state.actions.some(action=>action.bombInstanceId===instance.id&&action.channel===interaction.channel&&action.content===interaction.content));
  };
  const stageFor = (interaction: Interaction): CPCode => {
    if(interaction.cp)return interaction.cp;
    const instance=instanceFor(interaction);
    if(instance?.cp)return instance.cp;
    const template=instance?state.bombs.find(item=>item.id===instance.templateId):undefined;
    return template?.cp||currentCp;
  };
  const instancesFor = (cp:CPCode)=>state.bombInstances.filter(instance=>instance.customerId===customerId&&(instance.cp||state.bombs.find(item=>item.id===instance.templateId)?.cp||currentCp)===cp).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  const visibleFor = (cp:CPCode) => interactions.filter(interaction => {
    if(interaction.type==="CP")return false;
    if(stageFor(interaction)!==cp||instanceFor(interaction))return false;
    const targetId = interaction.contactId;
    return (activeContactId === "all" || targetId === activeContactId) && (activeChannel === "all" || interaction.channel === activeChannel);
  });
  const currentIndex=cpCodes.indexOf(currentCp);
  const viewingCurrent=selectedCp===currentCp;
  const selectedInstances=instancesFor(selectedCp);
  const selectedActivity=visibleFor(selectedCp);
  const availableBombs=state.bombs.filter(item=>item.cp===selectedCp&&item.status==="Active");

  return <div>
    <div className="border-b bg-white px-5 py-4">
      <div className="grid grid-cols-3 gap-2">{cpCodes.map((cp,index)=>{const current=cp===currentCp;const completed=index<currentIndex;const selected=cp===selectedCp;const selectable=index<=currentIndex;return <button type="button" key={cp} disabled={!selectable} aria-pressed={selected} onClick={()=>selectable&&setSelectedCp(cp)} className={`rounded-xl border px-3 py-2 text-left transition ${selected?"border-violet-500 bg-violet-50 ring-2 ring-violet-100":selectable?"border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50":"cursor-not-allowed border-slate-200 bg-slate-50 opacity-65"}`}><div className={`text-xs font-bold ${selected?"text-violet-700":completed?"text-emerald-700":"text-slate-400"}`}>{cp}</div><div className="mt-0.5 truncate text-[10px] text-slate-500">{current?"Current":completed?"Completed":"Upcoming"}</div></button>})}</div>
    </div>
    {selectedInstances.length>0&&<section className="border-b bg-slate-50/80 px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-violet-600">{viewingCurrent?"Current":"Completed"} stage · {selectedCp}</div><h3 className="mt-1 text-base font-bold text-slate-950">{state.cps.find(item=>item.code===selectedCp)?.goal}</h3></div><div className="flex flex-wrap gap-1.5">{availableBombs.map(item=><Badge key={item.id} variant="outline" className="bg-white">{item.name}</Badge>)}</div></div>
      <div className="mt-4 space-y-3">{selectedInstances.map(instance=><div key={instance.id} className="rounded-2xl border bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bomb</div><div className="mt-1 text-sm font-bold">{instance.templateName} · V{instance.version}</div></div><Badge className={instance.status==="Running"?"bg-violet-100 text-violet-800":"bg-slate-100 text-slate-700"}>{instance.status}</Badge></div><BombExecutionPlan state={state} instanceId={instance.id} contacts={contacts}/></div>)}</div>
    </section>}
    <div className="flex flex-col gap-2 border-b bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center">
      <div className="mr-auto"><div className="text-xs font-bold text-slate-900">Independent conversations</div><div className="mt-0.5 text-[11px] text-slate-500"><b>{selectedActivity.length}</b> activities outside the Bomb</div></div>
      <Select value={activeContactId} onValueChange={setContactId}><SelectTrigger size="sm" className="w-full bg-white sm:w-48"><SelectValue placeholder="All Contacts"/></SelectTrigger><SelectContent><SelectItem value="all">All Contacts</SelectItem>{contacts.map(contact => <SelectItem key={contact.id} value={contact.id}>{contact.name} · {contact.role}</SelectItem>)}</SelectContent></Select>
      <Select value={activeChannel} onValueChange={setChannel}><SelectTrigger size="sm" className="w-full bg-white sm:w-44"><SelectValue placeholder="All channels"/></SelectTrigger><SelectContent><SelectItem value="all">All channels</SelectItem>{allChannels.map(value => <SelectItem key={value} value={value}><ChannelOption channel={value}/></SelectItem>)}</SelectContent></Select>
    </div>
    <ActivityRows visible={selectedActivity} contacts={contacts} maxHeight={maxHeight}/>
  </div>;
}

function ActivityRows({visible,contacts,maxHeight}:{visible:Interaction[];contacts:Contact[];maxHeight:string}){
  return <div className={`${maxHeight} divide-y overflow-y-auto`}>
    {visible.length ? visible.map(interaction => {
      const contact = contacts.find(item => item.id === interaction.contactId);
      const communication = interaction.type === "Message" || interaction.type === "Phone";
      const outbound = interaction.direction === "Outbound";
      const isReply = communication && interaction.direction === "Inbound";
      const route = contact ? outbound ? `FC Team → ${contact.name}` : `${contact.name} → FC Team` : "System activity";
      const endpoint = contact ? contactPoint(contact, interaction.channel) : undefined;
      const Icon = interaction.type === "Phone" ? Phone : interaction.type === "Message" ? MessageCircle : interaction.type === "CP" ? CheckCircle2 : interaction.type === "Bomb" ? Bomb : Clock3;
      return <article key={interaction.id} className={`p-5 sm:p-6 ${isReply ? "bg-rose-50/70" : ""}`}>
        <div className="flex items-start gap-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isReply ? "bg-rose-100 text-rose-700" : interaction.channel ? "bg-white" : interaction.type === "Phone" ? "bg-blue-100 text-blue-700" : interaction.type === "Message" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{interaction.channel ? <ChannelIcon channel={interaction.channel} className="size-7"/> : <Icon className="size-4"/>}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-950">{interaction.channel || interaction.type}</h4>{isReply && <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge>}{interaction.direction && !isReply && <Badge variant="outline" className="text-[10px]">{interaction.direction}</Badge>}{interaction.outcome && <Badge variant="secondary" className="text-[10px]">{interaction.outcome}</Badge>}</div>
                <div className="mt-1 text-xs font-medium text-slate-600">{route}</div>
              </div>
              <time dateTime={interaction.createdAt} className="shrink-0 font-mono text-xs text-slate-500">{formatUtcTime(interaction.createdAt)}</time>
            </div>

            {contact ? <div className={`mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isReply ? "border-rose-200 bg-white" : "border-slate-100 bg-slate-50"}`}><Avatar className="size-8"><AvatarFallback className={`text-[10px] font-bold ${isReply ? "bg-rose-50 text-rose-800" : "bg-white text-slate-700"}`}>{initials(contact.name)}</AvatarFallback></Avatar><div className="min-w-0"><div className="text-xs font-semibold text-slate-900">{contact.name} <span className="font-normal text-slate-500">· {contact.role}</span></div><div className="mt-0.5 truncate text-xs text-slate-500">{interaction.channel}{endpoint ? ` · ${endpoint}` : ""}</div></div></div> : communication ? <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><UserRound className="size-3.5"/>Contact not linked</div> : null}

            <div className={`mt-3 rounded-xl border p-4 ${isReply ? "border-rose-200 bg-white" : "border-slate-200 bg-white"}`}><div className={`mb-2 text-[11px] font-semibold uppercase tracking-[.12em] ${isReply ? "text-rose-700" : "text-slate-400"}`}>{isReply ? "This is a reply" : communication ? interaction.type === "Phone" ? "Full call record" : "Full message" : interaction.title}</div><p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{interaction.content}</p></div>
            {interaction.recording && <Button size="sm" variant="link" className="mt-2 px-0"><Phone className="mr-2 size-3.5"/>Play full recording</Button>}
          </div>
        </div>
      </article>;
    }) : <div className="p-16 text-center text-sm text-slate-500">No matching activity.</div>}
  </div>;
}
