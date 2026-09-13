/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bomb, ChevronRight, CircleAlert, MessageCircle, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import { cacheBrandItem, getCachedBrand } from "@/lib/brand-list-cache";
import type { BrandActivity, BrandContact, BrandDetail } from "@/lib/brand-list";
import { Channel, Contact, CPCode, Customer, dateOnly, uid } from "@/lib/outreach-domain";
import { formatUtcTime } from "./bomb-plan";
import { brandDetailMetadata } from "@/lib/page-metadata";
import { usePageMetadata } from "./use-page-metadata";
import { BombExecutionPlan } from "./bomb-plan";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { InteractionFeed } from "./interaction-feed";
import { ChannelIcon, ChannelOption } from "./channel-icon";

const show=(r:{ok:boolean;message:string})=>r.ok?toast.success(r.message):toast.error(r.message);
const CP=({value}:{value:string})=><Badge variant="outline" className="rounded-md bg-white font-mono text-[11px] font-bold">{value}</Badge>;
const Status=({value}:{value:string})=><Badge className={value.includes("Bomb")?"bg-blue-100 text-blue-700":value.includes("Human")||value.includes("Reply")?"bg-violet-100 text-violet-700":value.includes("Due")?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-700"}>{value}</Badge>;
const channelAvailable=(c:Contact,ch:Channel)=>ch==="Email"?!!c.email&&c.emailValid:ch==="Phone"||ch==="SMS"?!!c.phone&&c.phoneValid:ch==="WhatsApp"?!!c.whatsapp:ch==="LinkedIn"?!!c.linkedin:false;
const MESSAGE_CHANNELS:Channel[]=["Email","Phone","SMS","WhatsApp","LinkedIn"];

function toCustomerContacts(contacts: BrandContact[]): Contact[] {
  return contacts.map((item) => ({
    id: item.id,
    name: item.name,
    role: item.role,
    email: item.email || undefined,
    phone: item.phone || undefined,
    whatsapp: item.phone || undefined,
    linkedin: item.linkedin || undefined,
    preferredChannel: item.email ? "Email" : item.linkedin ? "LinkedIn" : "Phone",
    emailValid: item.emailValid,
    phoneValid: item.phoneValid,
  }));
}

export function BrandDetail({customerId}:{customerId:string}){
  const {state,can,assignBrand}=useWorkspace();
  const router=useRouter(); const [launch,setLaunch]=useState(false); const [reply,setReply]=useState(false); const [cp,setCP]=useState(false); const [contact,setContact]=useState(false); const [ownerDraft,setOwnerDraft]=useState<string>();
  const cached=getCachedBrand(customerId);
  const [remote,setRemote]=useState<BrandDetail|null>(cached?{
    ...cached,
    priority:null,
    notes:null,
    createdAt:null,
    lastEditedAt:null,
    currentCpFullName:null,
    currentCpDefinition:null,
    contacts:[],
    activities:[],
  }:null);
  const [remoteLoading,setRemoteLoading]=useState(false);
  useEffect(()=>{
    setOwnerDraft(undefined);
    const next=getCachedBrand(customerId);
    setRemote(next?{
      ...next,
      priority:null,
      notes:null,
      createdAt:null,
      lastEditedAt:null,
      currentCpFullName:null,
      currentCpDefinition:null,
      contacts:[],
      activities:[],
    }:null);
  },[customerId]);
  const isAdmin=state.currentRole==="Admin";
  const manager=isAdmin||state.currentRole==="FC_Owner";
  const local=state.customers.find(x=>x.id===customerId);
  useEffect(()=>{
    if(local)return;
    let cancelled=false;
    setRemoteLoading(true);
    fetch(`/api/brands/${customerId}`)
      .then(async response=>{
        const payload=await response.json() as {brand?:BrandDetail;error?:string};
        if(!response.ok)throw new Error(payload.error||"Brand not found");
        return payload.brand||null;
      })
      .then(brand=>{
        if(cancelled||!brand){if(!cancelled)setRemote(null);return;}
        cacheBrandItem(brand);
        setRemote(brand);
      })
      .catch(()=>{if(!cancelled)setRemote(null)})
      .finally(()=>{if(!cancelled)setRemoteLoading(false)});
    return ()=>{cancelled=true};
  },[customerId,local]);
  const c: Customer | undefined = local || (remote ? {
    id: remote.id,
    name: remote.name,
    initials: remote.initials,
    cp: (remote.currentCp === "CP2" || remote.currentCp === "CP3" ? remote.currentCp : "CP1") as CPCode,
    status: (remote.status || "Ready") as Customer["status"],
    source: "Follow-up ClientDB",
    ownerId: remote.ownerId || undefined,
    contacts: toCustomerContacts(remote.contacts),
    createdAt: remote.createdAt || "",
    updatedAt: remote.lastEditedAt || "",
  } : undefined);
  const notionBacked=!local&&!!remote;
  const visible=!!c&&(local?(manager||c.ownerId===state.currentUserId):!!remote);
  usePageMetadata(brandDetailMetadata(visible&&c?{name:c.name,cp:notionBacked&&remote?remote.currentCp:c.cp,status:c.status,source:c.source}:null));
  if(remoteLoading&&!c)return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading brand…</div>;
  if(!visible||!c)return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CircleAlert className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Brand not found</h1><Button variant="link" onClick={()=>router.push("/customers")}>Back to Brands</Button></div></div>;
  const interactions=state.interactions.filter(i=>i.customerId===c.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const last=interactions[0];
  const partnershipContext=c.partnershipContext;
  const summary=notionBacked
    ? remote?.currentCpDefinition || remote?.currentCpFullName || "No CP definition yet."
    : state.cps.find(x=>x.code===c.cp)?.goal||"—";
  return <div className="mx-auto max-w-[1480px]">
    <button onClick={()=>router.push("/customers")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>Brands</button>
    <section className="mb-8 grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)_176px] xl:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-4"><Avatar className="size-14"><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{c.initials}</AvatarFallback></Avatar><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight">{c.name}</h1><div className="mt-2 flex flex-wrap gap-2"><CP value={notionBacked&&remote?remote.currentCp:c.cp}/>{(notionBacked?remote?.status:c.status)?<Status value={notionBacked&&remote?.status?remote.status:c.status}/>:null}{notionBacked&&remote?.handlingMode?<Status value={remote.handlingMode}/>:null}{notionBacked&&remote?.priority?<Status value={remote.priority}/>:null}</div><p className="mt-3 text-sm font-medium text-slate-700">{summary}</p>{notionBacked&&remote?.currentCpFullName&&<p className="mt-1 text-xs text-slate-500">{remote.currentCp} · {remote.currentCpFullName}</p>}{notionBacked&&remote?.notes&&<p className="mt-2 text-sm leading-6 text-slate-600">{remote.notes}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>Latest: {remote?.lastInteractionAt?dateOnly(remote.lastInteractionAt):last?.title||"No activity"}</span>{!notionBacked&&<span>Source: {c.source}</span>}<span>FC-Owner: {remote?.ownerName||state.users.find(u=>u.id===c.ownerId)?.name||"Unassigned"}</span>{notionBacked&&remote?.createdAt&&<span>Created: {dateOnly(remote.createdAt)}</span>}</div>{can("assignOwner")&&!notionBacked&&<div className="mt-3 flex flex-wrap items-center gap-2"><Select value={ownerDraft??c.ownerId??"unassigned"} onValueChange={setOwnerDraft}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Select owner"/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.filter(u=>["Admin","FC_Owner"].includes(u.role)).map(u=><SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={(ownerDraft??c.ownerId??"unassigned")===(c.ownerId||"unassigned")} onClick={()=>show(assignBrand(c.id,ownerDraft??c.ownerId??"unassigned"))}>Assign</Button></div>}</div></div>
      </div>
      <BrandContactList contacts={notionBacked&&remote?remote.contacts:c.contacts} canEdit={!notionBacked&&can("editBrand")} onAdd={()=>setContact(true)}/>
      <div className="flex flex-wrap gap-2 xl:flex-col xl:items-stretch">{!notionBacked&&can("reply")&&<Button variant="outline" onClick={()=>setReply(true)}><Send className="mr-2 size-4"/>Send message</Button>}{!notionBacked&&can("launch")&&<Button variant="outline" disabled={!!c.activeBombId||c.status==="Bomb Running"} onClick={()=>setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}{!notionBacked&&can("changeCP")&&<Button onClick={()=>setCP(true)}>Change CP</Button>}</div>
    </section>
    <div className={`grid gap-6 ${partnershipContext?"xl:grid-cols-[1fr_340px]":""}`}><section><h2 className="mb-3 font-bold">Brand activity</h2><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{notionBacked?<BrandConversationFeed activities={remote?.activities||[]} contacts={remote?.contacts||[]}/>:<InteractionFeed key={`${c.id}-${c.cp}`} customerId={c.id} interactions={interactions} contacts={c.contacts}/>}</div></section>
    {(c.cp==="CP3"||partnershipContext)&&partnershipContext&&<aside><section className="rounded-2xl bg-emerald-50 p-5"><div className="text-xs font-semibold tracking-wide text-emerald-700">CP3 · Partnership context</div><h2 className="mt-2 font-bold text-emerald-950">{partnershipContext.headline}</h2><p className="mt-2 text-sm leading-6 text-emerald-900">{partnershipContext.summary}</p><div className="mt-4 space-y-2">{partnershipContext.signals.map(signal=><div key={signal} className="rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700">{signal}</div>)}</div><div className="mt-3 text-[11px] text-emerald-700">Updated {dateOnly(partnershipContext.updatedAt)}</div></section></aside>}</div>
  <LaunchBombDialog customerId={c.id} open={launch} onOpenChange={setLaunch}/><ReplyDialog customerId={c.id} open={reply} onOpenChange={setReply}/><ChangeCPDialog customerId={c.id} open={cp} onOpenChange={setCP}/><ContactDialog customerId={c.id} open={contact} onOpenChange={setContact}/></div>;
}

type DetailContact = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
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

function BrandContactList({contacts,canEdit,onAdd}:{contacts:DetailContact[];canEdit:boolean;onAdd:()=>void}){
  const [open,setOpen]=useState<Set<string>>(new Set());
  const toggle=(id:string)=>setOpen(prev=>{
    const next=new Set(prev);
    if(next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return <section className="min-w-0"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">KeyPerson</h2>{canEdit&&<Button variant="ghost" size="icon-sm" onClick={onAdd}><Plus className="size-4"/></Button>}</div>{contacts.length===0?<p className="mt-3 text-sm text-slate-400">No KeyPerson in this follow-up yet.</p>:<div className="mt-3 grid gap-y-4">{contacts.map(contact=>{
    const expanded=open.has(contact.id);
    const meta=[contact.contactOrder,contact.role,contact.followupStatus].filter(Boolean).join(" · ");
    return <div key={contact.id} className="min-w-0">
      <button type="button" onClick={()=>toggle(contact.id)} className="flex w-full min-w-0 items-center gap-x-1.5 text-left">
        <ChevronRight className={`size-3.5 shrink-0 text-slate-400 transition-transform ${expanded?"rotate-90":""}`}/>
        <span className="truncate text-sm font-semibold">{contact.name}</span>
        <span className="shrink-0 text-xs text-slate-500">{meta||contact.role}</span>
      </button>
      {expanded&&<div className="mt-2 grid gap-1.5">{contact.title&&<div className="text-xs text-slate-500">{contact.title}</div>}{contact.followupMode&&<div className="text-xs text-slate-500">Mode: {contact.followupMode}</div>}{([["Email",contact.email],["Phone",contact.phone],["SMS",contact.phone],["WhatsApp",contact.whatsapp||contact.phone],["LinkedIn",linkedinLabel(contact.linkedin)]] as const).map(([channel,value])=><div key={channel} className="flex min-w-0 items-center gap-2 text-xs text-slate-600"><ChannelIcon channel={channel} className="size-4 shrink-0"/><span className={`truncate ${value?"":"text-slate-400"}`}>{value||"—"}</span></div>)}</div>}
    </div>;
  })}</div>}</section>;
}

const ACTIVITY_CHANNELS = new Set<Channel>(["Email", "Phone", "SMS", "WhatsApp", "LinkedIn"]);

function asActivityChannel(value?: string | null): Channel | undefined {
  return value && ACTIVITY_CHANNELS.has(value as Channel) ? (value as Channel) : undefined;
}

function BrandConversationFeed({activities,contacts}:{activities:BrandActivity[];contacts:Array<{id:string;name:string;role?:string}>}){
  if(!activities.length)return <div className="px-5 py-16 text-center text-sm text-slate-500">No conversations yet.</div>;
  return <div className="max-h-[520px] divide-y overflow-y-auto">{activities.map(activity=>{
    const contact=contacts.find(item=>item.id===activity.contactId);
    const inbound=activity.direction==="Inbound";
    const channel=asActivityChannel(activity.channel);
    const heading=activity.subject||[activity.channel,activity.status].filter(Boolean).join(" · ")||"Conversation";
    const route=contact?inbound?`${contact.name} → FC Team`:`FC Team → ${contact.name}`:activity.sender||"Conversation";
    return <article key={activity.id} className={`p-5 sm:p-6 ${inbound?"bg-rose-50/70":""}`}>
      <div className="flex items-start gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${inbound?"bg-rose-100 text-rose-700":channel?"bg-white":"bg-slate-100 text-slate-600"}`}>{channel?<ChannelIcon channel={channel} className="size-7"/>:<MessageCircle className="size-4"/>}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-950">{activity.channel||"Conversation"}</h4>
                {activity.direction?<Badge variant="secondary" className="text-[10px]">{activity.direction}</Badge>:null}
                {inbound?<Badge className="bg-rose-600 text-[10px] text-white hover:bg-rose-600">This is a reply</Badge>:null}
                {activity.status?<Badge variant="secondary" className="text-[10px]">{activity.status}</Badge>:null}
                {activity.callResult?<Badge variant="secondary" className="text-[10px]">{activity.callResult}</Badge>:null}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-600">{route}</div>
            </div>
            {activity.createdAt?<time dateTime={activity.createdAt} className="shrink-0 font-mono text-xs text-slate-500">{formatUtcTime(activity.createdAt)}</time>:null}
          </div>
          {contact?<div className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 ${inbound?"bg-white/70":"bg-slate-50"}`}><Avatar className="size-8"><AvatarFallback className={`text-[10px] font-bold ${inbound?"bg-rose-50 text-rose-800":"bg-white text-slate-700"}`}>{contact.name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><div className="text-xs font-semibold text-slate-900">{contact.name}{contact.role?<span className="font-normal text-slate-500"> · {contact.role}</span>:null}</div><div className="mt-0.5 truncate text-xs text-slate-500">{[activity.channel,activity.sender].filter(Boolean).join(" · ")}</div></div></div>:null}
          <div className={`mt-3 rounded-xl p-4 ${inbound?"bg-white/80":"bg-slate-50"}`}>
            <div className={`mb-2 text-[11px] font-semibold uppercase tracking-[.12em] ${inbound?"text-rose-700":"text-slate-400"}`}>{heading}</div>
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{activity.content||"No content yet."}</p>
            {activity.notes?<p className="mt-3 text-xs leading-5 text-slate-500">{activity.notes}</p>:null}
          </div>
          {activity.sourceUrl?<a href={activity.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-violet-700 hover:underline">Open source</a>:null}
        </div>
      </div>
    </article>;
  })}</div>;
}

type LaunchStepCopy = { subject?: string; content?: string; callGoal?: string; script?: string };

export function LaunchBombDialog({customerId,open,onOpenChange}:{customerId?:string;open:boolean;onOpenChange:(v:boolean)=>void}){
  const {state,launchBomb}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const bombs=state.bombs.filter(b=>b.status==="Active"&&b.cp===c?.cp);
  const [bombId,setBombId]=useState("");
  const [target,setTarget]=useState("");
  const [copies,setCopies]=useState<Record<string,LaunchStepCopy>>({});
  const [launchedInstanceId,setLaunchedInstanceId]=useState("");
  const selected=bombs.find(b=>b.id===bombId);
  const targets=c?.contacts||[];
  const person=targets.find(t=>t.id===target);
  useEffect(()=>{
    if(!selected){setCopies({});return;}
    const next:Record<string,LaunchStepCopy>={};
    selected.steps.forEach(s=>{next[s.id]={subject:s.subject,content:s.content,callGoal:s.callGoal,script:s.script};});
    setCopies(next);
  },[selected?.id]);
  const updateCopy=(id:string,patch:Partial<LaunchStepCopy>)=>setCopies(prev=>({...prev,[id]:{...prev[id],...patch}}));
  const unavailable=selected&&person?selected.steps.filter(s=>!channelAvailable(person,s.channel)).map(s=>s.channel):[];
  const incomplete=selected?.steps.some(s=>{
    const copy=copies[s.id];
    if(!copy)return true;
    if(s.channel==="Email")return !copy.subject?.trim()||!copy.content?.trim();
    if(s.channel==="Phone")return !copy.callGoal?.trim()||!copy.script?.trim();
    return !copy.content?.trim();
  });
  const launchedInstance=launchedInstanceId?state.bombInstances.find(item=>item.id===launchedInstanceId):undefined;
  return <Dialog open={open} onOpenChange={value=>{if(!value){setLaunchedInstanceId("");}onOpenChange(value)}}><DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"><DialogHeader><DialogTitle>{launchedInstanceId?"Bomb launched · execution plan":"Launch Bomb"}</DialogTitle><DialogDescription>{launchedInstanceId?"The system assigned this execution order and schedule. This plan is read-only.":"Review and edit each step’s copy for this launch only. The template is not changed. After confirmation, the system assigns timing and order based on channel availability and caller capacity. Any meaningful reply stops the run."}</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      {launchedInstanceId&&<div className="rounded-xl bg-emerald-50 p-4"><div className="text-sm font-semibold text-emerald-900">System assignment complete</div><p className="mt-1 text-xs text-emerald-800">{launchedInstance?`${launchedInstance.templateName} · Version ${launchedInstance.version}`:"The order and timing below are informational only and cannot be edited."}</p><div className="mt-4"><BombExecutionPlan state={state} instanceId={launchedInstanceId} contacts={c?.contacts||[]} tone="success"/></div></div>}
      {!launchedInstanceId&&<>
      <label className="text-sm font-medium">Bomb<Select value={bombId} onValueChange={v=>{setBombId(v);setTarget("");}}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a Bomb"/></SelectTrigger><SelectContent>{bombs.map(b=><SelectItem key={b.id} value={b.id}>{b.name} · V{b.version}</SelectItem>)}</SelectContent></Select></label>
      {selected&&<>
        <label className="text-sm font-medium">Launch for<Select value={target} onValueChange={setTarget}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a KeyPerson"/></SelectTrigger><SelectContent>{targets.map(t=><SelectItem key={t.id} value={t.id}>{t.name} · {t.role}</SelectItem>)}</SelectContent></Select></label>
        <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{selected.goal}</b><p className="mt-1 text-xs text-slate-500">Edits apply only to this launch.</p>{unavailable.length>0&&<div className="mt-2 text-xs text-amber-700">Unavailable steps will be skipped: {[...new Set(unavailable)].join(", ")}</div>}</div>
        {selected.steps.map((s,index)=>{
          const copy=copies[s.id]||{};
          const skipped=!!person&&!channelAvailable(person,s.channel);
          return <div key={s.id} className={`rounded-xl bg-slate-50 p-4 ${skipped?"opacity-60":""}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-slate-50 text-xs font-bold text-violet-600">{index+1}</span><ChannelOption channel={s.channel}/></div><span className="text-xs text-slate-500">System will schedule this step{skipped?" · will skip":""}</span></div>
            {s.channel==="Email"&&<div className="grid gap-2"><Input value={copy.subject||""} onChange={e=>updateCopy(s.id,{subject:e.target.value})} placeholder="Email subject"/><Textarea className="min-h-24" value={copy.content||""} onChange={e=>updateCopy(s.id,{content:e.target.value})} placeholder="Email body"/></div>}
            {s.channel==="Phone"&&<div className="grid gap-2"><Input value={copy.callGoal||""} onChange={e=>updateCopy(s.id,{callGoal:e.target.value})} placeholder="Call goal"/><Textarea className="min-h-24" value={copy.script||""} onChange={e=>updateCopy(s.id,{script:e.target.value})} placeholder="Suggested script"/></div>}
            {s.channel!=="Email"&&s.channel!=="Phone"&&<Textarea className="min-h-24" value={copy.content||""} onChange={e=>updateCopy(s.id,{content:e.target.value})} placeholder={`${s.channel} content`}/>}
          </div>;
        })}
      </>}
      </>}
    </div>
    <DialogFooter>{launchedInstanceId?<Button onClick={()=>onOpenChange(false)}>Done</Button>:<><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!selected||!person||incomplete||!!c?.activeBombId||c?.status==="Bomb Running"} onClick={()=>{if(!c||!selected||!person)return;const r=launchBomb(c.id,selected.id,person.id,copies);show(r);if(r.ok&&r.id)setLaunchedInstanceId(r.id);}}>Launch Bomb</Button></>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function ReplyDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){
  const {state,sendHumanReply}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const [contactId,setContact]=useState(c?.contacts[0]?.id||"");
  const contact=c?.contacts.find(x=>x.id===contactId)||c?.contacts[0];
  const available=MESSAGE_CHANNELS.filter(ch=>contact&&channelAvailable(contact,ch));
  const [channel,setChannel]=useState<Channel>(contact?.preferredChannel||"Email");
  const [content,setContent]=useState("");
  const effective=available.includes(channel)?channel:available[0];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Send message</DialogTitle><DialogDescription>Choose Email, Phone, SMS, WhatsApp, or LinkedIn. An active Bomb will stop before this human message is sent.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><Select value={contact?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{c?.contacts.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={effective} onValueChange={v=>setChannel(v as Channel)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{MESSAGE_CHANNELS.map(x=><SelectItem key={x} value={x} disabled={!contact||!channelAvailable(contact,x)}><ChannelOption channel={x}/></SelectItem>)}</SelectContent></Select></div><Textarea className="min-h-32" value={content} onChange={e=>setContent(e.target.value)} placeholder="Write a reply…"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!contact||!content.trim()||!effective} onClick={()=>{if(!contact||!effective)return;const r=sendHumanReply(customerId,contact.id,effective,content);show(r);if(r.ok){setContent("");onOpenChange(false)}}}><Send className="mr-2 size-4"/>Send</Button></DialogFooter></DialogContent></Dialog>;
}

export function ChangeCPDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,changeCP}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const [cp,setCP]=useState<CPCode>(c?.cp||"CP1");const [evidence,setEvidence]=useState("Latest contact interaction");const [note,setNote]=useState("");const stage=state.cps.find(x=>x.code===cp);return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Change Brand CP</DialogTitle><DialogDescription>CP never changes automatically. Review evidence and confirm.</DialogDescription></DialogHeader><Select value={cp} onValueChange={v=>setCP(v as CPCode)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{state.cps.map(x=><SelectItem key={x.code} value={x.code}>{x.code} · {x.name}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900"><b>Exit criteria</b><p className="mt-1">{stage?.criteria}</p></div><Input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Evidence"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={cp===c?.cp||!evidence} onClick={()=>{const r=changeCP(customerId,cp,evidence,note);show(r);if(r.ok)onOpenChange(false)}}>Move to {cp}</Button></DialogFooter></DialogContent></Dialog>}

export function FollowUpDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createFollowUp}=useWorkspace();const [days,setDays]=useState("3");const [reason,setReason]=useState("");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Schedule follow-up</DialogTitle><DialogDescription>This creates a human reminder. Nothing is sent automatically.</DialogDescription></DialogHeader><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[["1","Tomorrow"],["3","In 3 days"],["5","In 5 days"],["7","In 7 days"]].map(x=><SelectItem key={x[0]} value={x[0]}>{x[1]}</SelectItem>)}</SelectContent></Select><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={()=>{const r=createFollowUp(customerId,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),reason,note);show(r);if(r.ok)onOpenChange(false)}}>Schedule</Button></DialogFooter></DialogContent></Dialog>}

export function CreateCallDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createCallTask}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const valid=c?.contacts.filter(x=>x.phone&&x.phoneValid)||[];const [contact,setContact]=useState(valid[0]?.id||"");const [days,setDays]=useState("1");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create Call Task</DialogTitle><DialogDescription>The capacity scheduler chooses the Caller and may move the date.</DialogDescription></DialogHeader><Select value={contact||valid[0]?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue placeholder="Valid phone contact"/></SelectTrigger><SelectContent>{valid.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.phone}</SelectItem>)}</SelectContent></Select><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Today</SelectItem><SelectItem value="1">Tomorrow</SelectItem><SelectItem value="3">In 3 days</SelectItem></SelectContent></Select><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Goal and context"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!valid.length} onClick={()=>{const r=createCallTask(customerId,contact||valid[0].id,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),note);show(r);if(r.ok)onOpenChange(false)}}>Create Task</Button></DialogFooter></DialogContent></Dialog>}

function ContactDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {updateContact}=useWorkspace();const [name,setName]=useState("");const [role,setRole]=useState<Contact['role']>("Other");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add Contact</DialogTitle><DialogDescription>Channel availability is derived from valid contact details.</DialogDescription></DialogHeader><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Contact name"/><Select value={role} onValueChange={v=>setRole(v as Contact['role'])}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Connector","Owner","Other"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!name} onClick={()=>{const r=updateContact(customerId,{id:uid('ct'),name,role,email:email||undefined,phone:phone||undefined,whatsapp:phone||undefined,preferredChannel:email?'Email':'Phone',emailValid:!!email,phoneValid:!!phone});show(r);if(r.ok)onOpenChange(false)}}>Save Contact</Button></DialogFooter></DialogContent></Dialog>}
