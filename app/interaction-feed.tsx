"use client";

import { Fragment, useState } from "react";
import { Bomb, CheckCircle2, ChevronRight, Clock3, MessageCircle, Phone, UserRound } from "lucide-react";
import { BombInstance, Channel, Contact, CPCode, Interaction, ScheduledAction } from "@/lib/outreach-domain";
import { BombExecutionPlan, findBombInstance, formatUtcTime } from "./bomb-plan";
import { BrandReplyBox } from "./brand-reply-box";
import { ChannelIcon } from "./channel-icon";
import { useWorkspace } from "./workspace-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const contactPoint = (contact: Contact, channel?: Channel) => {
  if (channel === "Email") return contact.email;
  if (channel === "WhatsApp") return contact.whatsapp;
  if (channel === "LinkedIn") return contact.linkedin ? `linkedin.com/in/${contact.linkedin}` : undefined;
  if (channel === "SMS" || channel === "Phone") return contact.phone;
  return contact.email || contact.phone;
};

const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase();

const cpCodes: CPCode[] = ["CP1", "CP2", "CP3"];

export function InteractionFeed({ interactions, contacts, customerId: customerIdProp, currentCp: currentCpProp, cpGoals, maxHeight = "max-h-[520px]", bombInstances, actions, onSend }: { interactions: Interaction[]; contacts: Contact[]; customerId?: string; currentCp?: CPCode; cpGoals?: Partial<Record<CPCode, string>>; maxHeight?: string; bombInstances?: BombInstance[]; actions?: ScheduledAction[]; onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void> }) {
  const { state } = useWorkspace();
  const planState = bombInstances ? { ...state, bombInstances, actions: actions ?? [], interactions } : state;
  const customerId = customerIdProp || interactions[0]?.customerId;
  const customer = state.customers.find(item=>item.id===customerId);
  const currentCp = currentCpProp || customer?.cp || "CP1";
  const [selectedCp,setSelectedCp]=useState<CPCode>(currentCp);
  const instanceFor = (interaction:Interaction) => {
    if(interaction.bombInstanceId)return planState.bombInstances.find(item=>item.id===interaction.bombInstanceId);
    if(interaction.type==="Bomb")return findBombInstance(planState,interaction);
    return planState.bombInstances.find(instance=>instance.customerId===interaction.customerId&&interaction.contactId===instance.targetContactId&&interaction.createdAt>=instance.startedAt&&planState.actions.some(action=>action.bombInstanceId===instance.id&&action.channel===interaction.channel&&action.content===interaction.content));
  };
  const stageFor = (interaction: Interaction): CPCode => {
    if(interaction.cp)return interaction.cp;
    const instance=instanceFor(interaction);
    if(instance?.cp)return instance.cp;
    const template=instance?planState.bombs.find(item=>item.id===instance.templateId):undefined;
    return template?.cp||currentCp;
  };
  const instancesFor = (cp:CPCode)=>planState.bombInstances.filter(instance=>instance.customerId===customerId&&(instance.cp||planState.bombs.find(item=>item.id===instance.templateId)?.cp||currentCp)===cp).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
  const visibleFor = (cp:CPCode) => interactions.filter(interaction => {
    if(interaction.type==="CP")return false;
    if(stageFor(interaction)!==cp||instanceFor(interaction))return false;
    return true;
  });
  const currentIndex=cpCodes.indexOf(currentCp);
  const selectedInstances=instancesFor(selectedCp);
  const selectedActivity=visibleFor(selectedCp);
  const manualSends=rootManualSends(selectedActivity);
  const nestedReplyIds=new Set(manualSends.flatMap(item=>followUpsFor(item,selectedActivity).map(reply=>reply.id)));
  const otherActivity=selectedActivity.filter(item=>!manualSends.some(root=>root.id===item.id)&&!nestedReplyIds.has(item.id));

  return <div>
    <div className="px-5 py-4">
      <div className="flex items-center">{cpCodes.map((cp,index)=>{const current=cp===currentCp;const completed=index<currentIndex;const selected=cp===selectedCp;const selectable=index<=currentIndex;const reached=index<currentIndex;const goal=cpGoals?.[cp]||state.cps.find(item=>item.code===cp)?.goal;return <Fragment key={cp}><button type="button" disabled={!selectable} aria-pressed={selected} onClick={()=>selectable&&setSelectedCp(cp)} className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-left transition ${selected?"bg-violet-50":selectable?"hover:bg-slate-50":"cursor-not-allowed opacity-55"}`}><div className="flex min-w-0 items-baseline gap-2"><span className={`shrink-0 text-xs font-bold ${selected?"text-violet-700":completed?"text-emerald-700":"text-slate-400"}`}>{cp}</span>{goal&&<span className={`truncate text-xs font-semibold ${selected?"text-slate-950":"text-slate-500"}`}>{goal}</span>}</div><div className="mt-0.5 truncate text-[10px] text-slate-500">{current?"Current":completed?"Completed":"Upcoming"}</div></button>{index<cpCodes.length-1&&<span className="grid w-6 shrink-0 place-items-center" aria-hidden><ChevronRight className={`size-4 ${reached?"text-emerald-500":current?"text-violet-400":"text-slate-300"}`}/></span>}</Fragment>})}</div>
    </div>
    {manualSends.length>0&&<ActivityRows visible={manualSends} repliesFrom={selectedActivity} contacts={contacts} maxHeight="" onSend={onSend}/>}
    {selectedInstances.length>0&&<section className="border-y border-slate-200 px-5 py-4">
      <div className="space-y-4">{selectedInstances.map(instance=><div key={instance.id}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Bomb</div><div className="mt-1 text-sm font-bold">{instance.templateName} · V{instance.version}</div></div><Badge className={instance.status==="Running"?"bg-violet-100 text-violet-800":"bg-slate-100 text-slate-700"}>{instance.status}</Badge></div><BombExecutionPlan state={planState} instanceId={instance.id} contacts={contacts} onSend={onSend}/></div>)}</div>
    </section>}
    {otherActivity.length>0&&<ActivityRows visible={otherActivity} repliesFrom={selectedActivity} contacts={contacts} maxHeight={maxHeight} onSend={onSend}/>}
  </div>;
}

function threadKey(item: Interaction) {
  return item.threadId || [item.contactId || "", item.channel || "", item.taskId || item.id].join(":");
}

function sameThread(left: Interaction, right: Interaction) {
  if (left.threadId && right.threadId) return left.threadId === right.threadId;
  return left.contactId === right.contactId && left.channel === right.channel && !!left.taskId && left.taskId === right.taskId;
}

function followUpsFor(root: Interaction, pool: Interaction[]) {
  return pool.filter(item =>
    item.id !== root.id &&
    item.createdAt >= root.createdAt &&
    sameThread(item, root)
  ).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function rootManualSends(pool: Interaction[]) {
  const groups = new Map<string, Interaction[]>();
  for (const item of pool.filter(entry => entry.direction === "Outbound" && entry.creationMethod === "Manual")) {
    const key = threadKey(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()].map(list => [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0]).sort((left, right) => {
    const leftLatest = followUpsFor(left, pool).at(-1)?.createdAt || left.createdAt;
    const rightLatest = followUpsFor(right, pool).at(-1)?.createdAt || right.createdAt;
    return rightLatest.localeCompare(leftLatest) || right.createdAt.localeCompare(left.createdAt);
  });
}

function ActivityRows({visible,contacts,maxHeight,onSend,repliesFrom}:{visible:Interaction[];contacts:Contact[];maxHeight:string;onSend?: (contactId: string, channel: Channel, content: string, taskId?: string, threadId?: string) => Promise<void>; repliesFrom?: Interaction[]}){
  const pool = repliesFrom || visible;
  return <div className={`${maxHeight} divide-y ${maxHeight?"overflow-y-auto":""}`}>
    {visible.map(interaction => {
      const contact = contacts.find(item => item.id === interaction.contactId);
      const communication = interaction.type === "Message" || interaction.type === "Phone";
      const outbound = interaction.direction === "Outbound";
      const isReply = communication && interaction.direction === "Inbound";
      const replies = followUpsFor(interaction, pool);
      const lastFollowUp = replies[replies.length - 1];
      const route = contact ? outbound ? `FC Team → ${contact.name}` : `${contact.name} → FC Team` : "System activity";
      const endpoint = contact ? contactPoint(contact, interaction.channel) : undefined;
      const Icon = interaction.type === "Phone" ? Phone : interaction.type === "Message" ? MessageCircle : interaction.type === "CP" ? CheckCircle2 : interaction.type === "Bomb" ? Bomb : Clock3;
      return <article key={interaction.id} className={`p-5 sm:p-6 ${isReply ? "bg-rose-50/70" : ""}`}>
        <div className="flex items-start gap-4">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isReply ? "bg-rose-100 text-rose-700" : interaction.channel ? "bg-white" : interaction.type === "Phone" ? "bg-blue-100 text-blue-700" : interaction.type === "Message" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{interaction.channel ? <ChannelIcon channel={interaction.channel} className="size-7"/> : <Icon className="size-4"/>}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-950">{interaction.channel || interaction.type}</h4>{isReply && <Badge variant="secondary" className="text-[10px]">Inbound</Badge>}{isReply && <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge>}{interaction.direction && !isReply && <Badge variant="secondary" className="text-[10px]">{interaction.direction}</Badge>}{replies.length>0 && <Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">Replied</Badge>}{interaction.outcome && <Badge variant="secondary" className="text-[10px]">{interaction.outcome}</Badge>}</div>
                <div className="mt-1 text-xs font-medium text-slate-600">{route}</div>
              </div>
              <time dateTime={interaction.createdAt} className="shrink-0 font-mono text-xs text-slate-500">{formatUtcTime(interaction.createdAt)}</time>
            </div>

            {contact ? <div className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 ${isReply ? "bg-white/70" : "bg-slate-50"}`}><Avatar className="size-8"><AvatarFallback className={`text-[10px] font-bold ${isReply ? "bg-rose-50 text-rose-800" : "bg-white text-slate-700"}`}>{initials(contact.name)}</AvatarFallback></Avatar><div className="min-w-0"><div className="text-xs font-semibold text-slate-900">{contact.name} <span className="font-normal text-slate-500">· {contact.role}</span></div><div className="mt-0.5 truncate text-xs text-slate-500">{interaction.channel}{endpoint ? ` · ${endpoint}` : ""}</div></div></div> : communication ? <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><UserRound className="size-3.5"/>Contact not linked</div> : null}

            <div className={`mt-3 rounded-xl p-4 ${isReply ? "bg-white/80" : "bg-slate-50"}`}><div className={`mb-2 text-[11px] font-semibold uppercase tracking-[.12em] ${isReply ? "text-rose-700" : "text-slate-400"}`}>{isReply ? "This is a reply" : communication ? interaction.type === "Phone" ? "Full call record" : "Full message" : interaction.title}</div><p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{interaction.content}</p></div>
            {replies.map(item=>item.direction==="Inbound"
              ? <div key={item.id} className="mt-3"><div className="rounded-xl bg-rose-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">This is a reply</div><div className="mt-0.5 text-[11px] font-medium text-rose-600">from {contact?.name}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p></div>{lastFollowUp?.id===item.id&&<BrandReplyBox customerId={item.customerId} interaction={item} contacts={contacts} interactions={pool} taskId={item.taskId || interaction.taskId} onSend={onSend}/>}</div>
              : <div key={item.id} className="mt-3 rounded-xl bg-slate-50 p-3"><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-400">Full message</div><div className="mt-0.5 text-[11px] font-medium text-slate-500">FC Team → {contact?.name}</div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.content}</p></div>
            )}
            {isReply && !replies.length && <BrandReplyBox customerId={interaction.customerId} interaction={interaction} contacts={contacts} interactions={pool} taskId={interaction.taskId} onSend={onSend}/>}
            {interaction.recording && <Button size="sm" variant="link" className="mt-2 px-0"><Phone className="mr-2 size-3.5"/>Play full recording</Button>}
          </div>
        </div>
      </article>;
    })}
  </div>;
}
