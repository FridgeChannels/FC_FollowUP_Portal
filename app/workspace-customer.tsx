/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bomb, ChevronRight, CircleAlert, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import { cacheBrandItem, getCachedBrand } from "@/lib/brand-list-cache";
import { CURRENT_CPS, FOLLOW_UP_STATUSES, HANDLING_MODES, type BrandActivity, type BrandContact, type BrandDetail, type BrandTask, type CurrentCpOption } from "@/lib/brand-list";
import type { BombDetail, BombListItem } from "@/lib/bomb-list";
import { ActionStatus, BombInstance, Channel, Contact, CPCode, Customer, dateOnly, Interaction, ScheduledAction, uid } from "@/lib/outreach-domain";
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
import { skipUnavailableChannelsOnClient } from "@/lib/channel-availability";

const show=(r:{ok:boolean;message:string})=>r.ok?toast.success(r.message):toast.error(r.message);
const CP=({value}:{value:string})=><Badge variant="outline" className="rounded-md bg-white font-mono text-[11px] font-bold">{value}</Badge>;
const Status=({value}:{value:string})=><Badge className={value.includes("Bomb")?"bg-blue-100 text-blue-700":value.includes("Human")||value.includes("Reply")?"bg-violet-100 text-violet-700":value.includes("Due")?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-700"}>{value}</Badge>;
function BadgeSelect({value,options,onChange,disabled}:{value:string;options:readonly string[];onChange:(value:string)=>void;disabled?:boolean}){
  return <Select value={value||undefined} onValueChange={onChange} disabled={disabled}><SelectTrigger className="h-auto w-auto gap-0 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 [&>svg]:hidden">{value?<Status value={value}/>:<span className="text-xs text-slate-400">—</span>}</SelectTrigger><SelectContent>{options.map(item=><SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>;
}
const channelAvailable=(c:Contact,ch:Channel)=>ch==="Email"?!!c.email&&c.emailValid:ch==="Phone"||ch==="SMS"?!!c.phone&&c.phoneValid:ch==="WhatsApp"?!!c.whatsapp:ch==="LinkedIn"?!!c.linkedin:false;
const MESSAGE_CHANNELS:Channel[]=["Email","Phone","SMS","WhatsApp","LinkedIn"];
const ACTIVITY_CHANNELS = new Set<Channel>(MESSAGE_CHANNELS);

function asCpCode(value?: string | null): CPCode {
  return value === "CP2" || value === "CP3" ? value : "CP1";
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
  return (task.notes || "").includes("由 Bomb 排班生成");
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

function toBombPlan(customerId: string, currentCp: CPCode, tasks: BrandTask[], activities: BrandActivity[]) {
  const groups = new Map<string, BrandTask[]>();
  const orphans: BrandTask[] = [];
  for (const task of tasks) {
    if (!task.contactId) continue;
    const named = bombNoteName(task.notes);
    if (task.sourceBombId) {
      const key = `${task.sourceBombId}:${task.contactId}`;
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
    const startedAt = group
      .map((item) => item.scheduledAt || "")
      .filter(Boolean)
      .sort()[0] || "";
    bombInstances.push({
      id: instanceId,
      customerId,
      templateId: first.sourceBombId || first.templateId || instanceId,
      templateName: first.sourceBombName || groupLabel(group) || "Untitled Bomb",
      version: 1,
      goal: "",
      targetContactId: first.contactId || "",
      cp: asCpCode(first.sourceBombCp || currentCp),
      status: asBombStatus(group),
      startedAt,
    });
    for (const task of group) {
      const related = activitiesForTask(task, activities);
      for (const activity of related) activityInstanceIds[activity.id] = instanceId;
      const conversation = sentContentForTask(task, related);
      const scheduled = task.scheduledAt || conversation?.createdAt || startedAt;
      actions.push({
        id: task.id,
        bombInstanceId: instanceId,
        customerId,
        stepId: task.templateId || task.id,
        channel: asActivityChannel(task.channel) || "Email",
        plannedDate: scheduled,
        actualDate: scheduled,
        status: asActionStatus(task.status),
        content: typeof conversation?.content === "string" ? conversation.content : "",
        note: task.notes || undefined,
      });
    }
  }

  return { bombInstances, actions, activityInstanceIds };
}

function isManualActivity(item: BrandActivity, manualTaskIds: Set<string>) {
  if (item.taskId && manualTaskIds.has(item.taskId)) return true;
  return /人工(追加回复|发送消息|消息)/.test(item.notes || "");
}

function toInteractions(customerId: string, activities: BrandActivity[], activityInstanceIds: Record<string, string> = {}, tasks: BrandTask[] = []): Interaction[] {
  const manualTaskIds = new Set(tasks.filter((item) => item.creationMethod === "Manual").map((item) => item.id));
  return activities.map((item) => ({
    id: item.id,
    customerId,
    contactId: item.contactId || undefined,
    bombInstanceId: activityInstanceIds[item.id],
    type: item.channel === "Phone" ? "Phone" : "Message",
    channel: asActivityChannel(item.channel),
    direction: item.direction || undefined,
    title: item.subject || item.channel || "Conversation",
    content: item.content,
    createdAt: item.createdAt || "",
    creationMethod: isManualActivity(item, manualTaskIds) ? "Manual" : undefined,
    threadId: item.threadId || undefined,
    taskId: item.taskId || undefined,
    replyStatus: item.replyStatus || undefined,
  }));
}

function toCpGoals(cps: CurrentCpOption[]) {
  return Object.fromEntries(
    cps
      .filter((item) => (item.name === "CP1" || item.name === "CP2" || item.name === "CP3") && item.fullName)
      .map((item) => [item.name, item.fullName]),
  ) as Partial<Record<CPCode, string>>;
}

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
    tasks:[],
    activities:[],
  }:null);
  const [remoteCps,setRemoteCps]=useState<CurrentCpOption[]>([]);
  const [owners,setOwners]=useState<Array<{id:string;name:string}>>([]);
  const [remoteLoading,setRemoteLoading]=useState(false);
  const [saving,setSaving]=useState(false);
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
      tasks:[],
      activities:[],
    }:null);
    setRemoteCps([]);
  },[customerId]);
  const isAdmin=state.currentRole==="Admin";
  const manager=isAdmin||state.currentRole==="FC_Owner";
  const local=state.customers.find(x=>x.id===customerId);
  const applyRemote=(brand:BrandDetail|null,cps:CurrentCpOption[]=[])=>{
    if(!brand){setRemote(null);setRemoteCps([]);return;}
    cacheBrandItem(brand);
    setRemote(brand);
    setRemoteCps(cps);
  };
  const refreshRemote=()=>fetch(`/api/brands/${customerId}`)
    .then(async response=>{
      const payload=await response.json() as {brand?:BrandDetail;cps?:CurrentCpOption[];error?:string};
      if(!response.ok)throw new Error(payload.error||"Brand not found");
      applyRemote(payload.brand||null,payload.cps||[]);
      return payload.brand||null;
    });
  useEffect(()=>{
    if(local)return;
    let cancelled=false;
    setRemoteLoading(true);
    refreshRemote()
      .catch(()=>{if(!cancelled)setRemote(null)})
      .finally(()=>{if(!cancelled)setRemoteLoading(false)});
    return ()=>{cancelled=true};
  },[customerId,local]);
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
  const visible=!!c&&(local?(manager||c.ownerId===state.currentUserId):!!remote);
  usePageMetadata(brandDetailMetadata(visible&&c?{name:c.name,cp:notionBacked&&remote?remote.currentCp:c.cp,status:c.status,source:c.source}:null));
  if(remoteLoading&&!c)return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Loading brand…</div>;
  if(!visible||!c)return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CircleAlert className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Brand not found</h1><Button variant="link" onClick={()=>router.push("/customers")}>Back to Brands</Button></div></div>;
  const ownerChoices=notionBacked
    ? (remote?.ownerId&&!owners.some(item=>item.id===remote.ownerId)
      ? [{id:remote.ownerId,name:remote.ownerName||"Current owner"},...owners]
      : owners)
    : state.users.filter(u=>["Admin","FC_Owner"].includes(u.role)).map(u=>({id:u.id,name:u.name}));
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
  const currentCp=notionBacked?asCpCode(remote?.currentCp):c.cp;
  const bombPlan=notionBacked?toBombPlan(c.id,currentCp,remote?.tasks||[],remote?.activities||[]):undefined;
  const interactions=(notionBacked?toInteractions(c.id,remote?.activities||[],bombPlan?.activityInstanceIds,remote?.tasks||[]):state.interactions.filter(i=>i.customerId===c.id)).sort((a,b)=>{
    const aManual=a.direction==="Outbound"&&a.creationMethod==="Manual"?0:1;
    const bManual=b.direction==="Outbound"&&b.creationMethod==="Manual"?0:1;
    return aManual-bManual||b.createdAt.localeCompare(a.createdAt);
  });
  const last=interactions[0];
  const partnershipContext=c.partnershipContext;
  const summary=notionBacked
    ? remote?.currentCpDefinition || remote?.currentCpFullName || "No CP definition yet."
    : state.cps.find(x=>x.code===c.cp)?.goal||"—";
  return <div className="mx-auto max-w-[1480px]">
    <button onClick={()=>router.push("/customers")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>Brands</button>
    <section className="mb-8 grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)_176px] xl:items-start">
      <div className="min-w-0">
        <div className="flex items-start gap-4"><Avatar className="size-14"><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{c.initials}</AvatarFallback></Avatar><div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight">{c.name}</h1><div className="mt-2 flex flex-wrap gap-2"><CP value={notionBacked&&remote?remote.currentCp:c.cp}/>{notionBacked&&remote?.status?<BadgeSelect value={remote.status} options={FOLLOW_UP_STATUSES} disabled={saving} onChange={value=>{void patchBrand({status:value}).then(()=>toast.success("Status updated")).catch(error=>toast.error(error instanceof Error?error.message:"Update failed"));}}/>:(c.status?<Status value={c.status}/>:null)}{notionBacked?<BadgeSelect value={remote?.handlingMode||""} options={HANDLING_MODES} disabled={saving} onChange={value=>{void patchBrand({handlingMode:value}).then(()=>toast.success("Handling Mode updated")).catch(error=>toast.error(error instanceof Error?error.message:"Update failed"));}}/>:null}{notionBacked&&remote?.priority?<Status value={remote.priority}/>:null}</div><p className="mt-3 text-sm font-medium text-slate-700">{summary}</p>{notionBacked&&remote?.currentCpFullName&&<p className="mt-1 text-xs text-slate-500">{remote.currentCp} · {remote.currentCpFullName}</p>}{notionBacked&&remote?.notes&&<p className="mt-2 text-sm leading-6 text-slate-600">{remote.notes}</p>}<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span>Latest: {remote?.lastInteractionAt?dateOnly(remote.lastInteractionAt):last?.title||"No activity"}</span>{!notionBacked&&<span>Source: {c.source}</span>}<span>FC-Owner: {remote?.ownerName||state.users.find(u=>u.id===c.ownerId)?.name||"Unassigned"}</span>{notionBacked&&remote?.createdAt&&<span>Created: {dateOnly(remote.createdAt)}</span>}</div>{can("assignOwner")&&<div className="mt-3 flex flex-wrap items-center gap-2"><Select value={ownerDraft??c.ownerId??"unassigned"} onValueChange={setOwnerDraft}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Select owner"/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{ownerChoices.map(u=><SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={saving||(ownerDraft??c.ownerId??"unassigned")===(c.ownerId||"unassigned")} onClick={()=>void handleAssign()}>Assign</Button></div>}</div></div>
      </div>
      <BrandContactList contacts={notionBacked&&remote?remote.contacts:c.contacts} canEdit={!notionBacked&&can("editBrand")} onAdd={()=>setContact(true)}/>
      <div className="flex flex-wrap gap-2 xl:flex-col xl:items-stretch">{can("reply")&&<Button variant="outline" disabled={notionBacked&&!c.contacts.length} onClick={()=>setReply(true)}><Send className="mr-2 size-4"/>Send message</Button>}{can("launch")&&<Button variant="outline" disabled={!notionBacked&&(!!c.activeBombId||c.status==="Bomb Running")} onClick={()=>setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}{can("changeCP")&&<Button onClick={()=>setCP(true)}>Change CP</Button>}</div>
    </section>
    <div className={`grid gap-6 ${partnershipContext?"xl:grid-cols-[1fr_340px]":""}`}><section><h2 className="mb-3 font-bold">Brand activity</h2><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">    <InteractionFeed key={`${c.id}-${currentCp}`} customerId={c.id} currentCp={currentCp} cpGoals={notionBacked?toCpGoals(remoteCps):undefined} interactions={interactions} contacts={c.contacts} bombInstances={bombPlan?.bombInstances} actions={bombPlan?.actions} onSend={notionBacked?async (contactId,channel,content,taskId,threadId)=>{
    const response=await fetch(`/api/brands/${c.id}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId,channel,content,taskId,threadId})});
    const payload=await response.json() as {brand?:BrandDetail;cps?:CurrentCpOption[];error?:string};
    if(!response.ok||!payload.brand)throw new Error(payload.error||"Send failed");
    applyRemote(payload.brand,payload.cps||remoteCps);
  }:undefined}/></div></section>
    {(c.cp==="CP3"||partnershipContext)&&partnershipContext&&<aside><section className="rounded-2xl bg-emerald-50 p-5"><div className="text-xs font-semibold tracking-wide text-emerald-700">CP3 · Partnership context</div><h2 className="mt-2 font-bold text-emerald-950">{partnershipContext.headline}</h2><p className="mt-2 text-sm leading-6 text-emerald-900">{partnershipContext.summary}</p><div className="mt-4 space-y-2">{partnershipContext.signals.map(signal=><div key={signal} className="rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700">{signal}</div>)}</div><div className="mt-3 text-[11px] text-emerald-700">Updated {dateOnly(partnershipContext.updatedAt)}</div></section></aside>}</div>
  <LaunchBombDialog customerId={c.id} open={launch} onOpenChange={setLaunch} contacts={notionBacked?c.contacts:undefined} currentCp={notionBacked&&remote?remote.currentCp:undefined} previewOnly={notionBacked} onLaunched={notionBacked?()=>{void refreshRemote()}:undefined}/><ReplyDialog customerId={c.id} open={reply} onOpenChange={setReply} contacts={notionBacked?c.contacts:undefined} onSend={notionBacked?async (contactId,channel,content)=>{
    const response=await fetch(`/api/brands/${c.id}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contactId,channel,content})});
    const payload=await response.json() as {brand?:BrandDetail;cps?:CurrentCpOption[];error?:string};
    if(!response.ok||!payload.brand)throw new Error(payload.error||"Send failed");
    applyRemote(payload.brand,payload.cps||remoteCps);
  }:undefined}/><ChangeCPDialog customerId={c.id} open={cp} onOpenChange={setCP} currentCp={notionBacked&&remote?remote.currentCp:undefined} cps={notionBacked?remoteCps:undefined} onSave={notionBacked?async (currentCpId,evidence,note)=>{await patchBrand({currentCpId,evidence,note});}:undefined}/><ContactDialog customerId={c.id} open={contact} onOpenChange={setContact}/></div>;
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

type LaunchStepCopy = { subject?: string; content?: string; callGoal?: string; script?: string };

type LaunchBombOption = {id:string;name:string;version?:number;goal:string;cp?:string;status?:string;priority?:string|null;steps:Array<{id:string;channel:Channel;subject?:string;content:string;callGoal?:string;script?:string}>};

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

export function LaunchBombDialog({customerId,open,onOpenChange,contacts,currentCp,previewOnly,onLaunched}:{customerId?:string;open:boolean;onOpenChange:(v:boolean)=>void;contacts?:Contact[];currentCp?:string;previewOnly?:boolean;onLaunched?:()=>void}){
  const {state,launchBomb}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const [remoteBombs,setRemoteBombs]=useState<BombListItem[]>([]);
  const [remoteDetail,setRemoteDetail]=useState<LaunchBombOption>();
  const [bombId,setBombId]=useState("");
  const [target,setTarget]=useState("");
  const [copies,setCopies]=useState<Record<string,LaunchStepCopy>>({});
  const [launchedInstanceId,setLaunchedInstanceId]=useState("");
  const [previewReady,setPreviewReady]=useState(false);
  const [launching,setLaunching]=useState(false);
  const localBombs=state.bombs.filter(b=>b.status==="Active"&&b.cp===c?.cp);
  const notionBombs=remoteBombs.filter(b=>b.status==="Active"&&(!currentCp||currentCp==="NONE"||!b.cp||b.cp.split(",").some(item=>item.trim()===currentCp)));
  const selected=previewOnly?remoteDetail:localBombs.find(b=>b.id===bombId);
  const targets=contacts||c?.contacts||[];
  const person=targets.find(t=>t.id===target);
  useEffect(()=>{
    if(!open||!previewOnly)return;
    let cancelled=false;
    fetch("/api/bombs")
      .then(async response=>{
        const payload=await response.json() as {bombs?:BombListItem[];error?:string};
        if(!response.ok)throw new Error(payload.error||"Failed to load bombs");
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
        if(!response.ok||!payload.bomb)throw new Error(payload.error||"Bomb not found");
        return bombDetailToLaunch(payload.bomb);
      })
      .then(item=>{if(!cancelled)setRemoteDetail(item);})
      .catch(()=>{if(!cancelled)setRemoteDetail(undefined);});
    return ()=>{cancelled=true};
  },[open,previewOnly,bombId]);
  useEffect(()=>{
    if(!selected){setCopies({});return;}
    const next:Record<string,LaunchStepCopy>={};
    selected.steps.forEach(s=>{next[s.id]={subject:s.subject,content:s.content,callGoal:s.callGoal,script:s.script};});
    setCopies(next);
  },[selected?.id]);
  const updateCopy=(id:string,patch:Partial<LaunchStepCopy>)=>setCopies(prev=>({...prev,[id]:{...prev[id],...patch}}));
  const enforceSkip=skipUnavailableChannelsOnClient();
  const unavailable=enforceSkip&&selected&&person?selected.steps.filter(s=>!channelAvailable(person,s.channel)).map(s=>s.channel):[];
  const incomplete=selected?.steps.some(s=>{
    const copy=copies[s.id];
    if(!copy)return true;
    if(s.channel==="Email")return !copy.subject?.trim()||!copy.content?.trim();
    if(s.channel==="Phone")return !copy.callGoal?.trim()||!copy.script?.trim();
    return !copy.content?.trim();
  });
  const launched=!!launchedInstanceId||previewReady;
  const launchedInstance=launchedInstanceId?state.bombInstances.find(item=>item.id===launchedInstanceId):undefined;
  return <Dialog open={open} onOpenChange={value=>{if(!value){setLaunchedInstanceId("");setPreviewReady(false);setLaunching(false);}onOpenChange(value)}}><DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"><DialogHeader><DialogTitle>{launched?"Bomb launched · execution plan":"Launch Bomb"}</DialogTitle><DialogDescription>{launched?(previewOnly?"This launch preview is read-only. The scheduling engine is not writing tasks yet.":"The system assigned this execution order and schedule. This plan is read-only."):"Review and edit each step’s copy for this launch only. The template is not changed. After confirmation, the system assigns timing and order based on channel availability and caller capacity. Any meaningful reply stops the run."}</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      {launched&&<div className="rounded-xl bg-emerald-50 p-4"><div className="text-sm font-semibold text-emerald-900">{previewOnly?"Launch preview ready":"System assignment complete"}</div><p className="mt-1 text-xs text-emerald-800">{selected?`${selected.name}${selected.goal?` · ${selected.goal}`:""}`:launchedInstance?`${launchedInstance.templateName} · Version ${launchedInstance.version}`:"The order and timing below are informational only and cannot be edited."}</p>{previewOnly?<div className="mt-4 space-y-2">{selected?.steps.map((step,index)=><div key={step.id} className="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">{index+1}. {step.channel}{enforceSkip&&person&&!channelAvailable(person,step.channel)?" · skipped":""}</div>)}</div>:<div className="mt-4"><BombExecutionPlan state={state} instanceId={launchedInstanceId} contacts={targets} tone="success"/></div>}</div>}
      {!launched&&<>
      <label className="text-sm font-medium">Bomb<Select value={bombId} onValueChange={v=>{setBombId(v);setTarget("");}}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a Bomb"/></SelectTrigger><SelectContent>{(previewOnly?notionBombs:localBombs).map(b=><SelectItem key={b.id} value={b.id}>{previewOnly?`${b.name}${b.cp?` · ${b.cp}`:""}`:`${b.name} · V${"version" in b ? b.version : ""}`}</SelectItem>)}</SelectContent></Select></label>
      {selected&&<>
        <label className="text-sm font-medium">Launch for<Select value={target} onValueChange={setTarget}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a KeyPerson"/></SelectTrigger><SelectContent>{targets.map(t=><SelectItem key={t.id} value={t.id}>{t.name} · {t.role}</SelectItem>)}</SelectContent></Select></label>
        <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{selected.goal}</b><p className="mt-1 text-xs text-slate-500">Edits apply only to this launch.</p>{unavailable.length>0&&<div className="mt-2 text-xs text-amber-700">Unavailable steps will be skipped: {[...new Set(unavailable)].join(", ")}</div>}</div>
        {selected.steps.map((s,index)=>{
          const copy=copies[s.id]||{};
          const skipped=enforceSkip&&!!person&&!channelAvailable(person,s.channel);
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
    <DialogFooter>{launched?<Button onClick={()=>onOpenChange(false)}>Done</Button>:<><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={launching||!selected||!person||incomplete||(!previewOnly&&(!!c?.activeBombId||c?.status==="Bomb Running"))} onClick={()=>{if(!selected||!person)return;if(previewOnly){if(!customerId)return;void (async ()=>{setLaunching(true);try{const response=await fetch(`/api/brands/${customerId}/launch`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bombId:selected.id,contactId:person.id,copies})});const payload=await response.json() as {message?:string;error?:string};if(!response.ok)throw new Error(payload.error||"Launch failed");setPreviewReady(true);toast.success(payload.message||"Bomb launched");onLaunched?.();}catch(error){toast.error(error instanceof Error?error.message:"Launch failed");}finally{setLaunching(false);}})();return;}if(!c)return;const r=launchBomb(c.id,selected.id,person.id,copies);show(r);if(r.ok&&r.id)setLaunchedInstanceId(r.id);}}>Launch Bomb</Button></>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function ReplyDialog({customerId,open,onOpenChange,contacts,onSend}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void;contacts?:Contact[];onSend?:(contactId:string,channel:Channel,content:string)=>Promise<void>}){
  const {state,sendHumanReply}=useWorkspace();
  const local=state.customers.find(x=>x.id===customerId);
  const people=contacts||local?.contacts||[];
  const [contactId,setContact]=useState(people[0]?.id||"");
  const [channel,setChannel]=useState<Channel>(people[0]?.preferredChannel||"Email");
  const [content,setContent]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(!open)return;
    setContact(people[0]?.id||"");
    setChannel(people[0]?.preferredChannel||"Email");
    setContent("");
  },[open,customerId]);
  const contact=people.find(x=>x.id===contactId)||people[0];
  const available=MESSAGE_CHANNELS.filter(ch=>contact&&channelAvailable(contact,ch));
  const effective=available.includes(channel)?channel:available[0];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Send message</DialogTitle><DialogDescription>Choose Email, Phone, SMS, WhatsApp, or LinkedIn. An active Bomb will stop before this human message is sent.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><Select value={contact?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{people.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={effective} onValueChange={v=>setChannel(v as Channel)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{MESSAGE_CHANNELS.map(x=><SelectItem key={x} value={x} disabled={!contact||!channelAvailable(contact,x)}><ChannelOption channel={x}/></SelectItem>)}</SelectContent></Select></div><Textarea className="min-h-32" value={content} onChange={e=>setContent(e.target.value)} placeholder="Write a reply…"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!contact||!content.trim()||!effective||saving} onClick={()=>{void (async ()=>{if(!contact||!effective)return;if(onSend){setSaving(true);try{await onSend(contact.id,effective,content);toast.success("Message saved as pending");setContent("");onOpenChange(false);}catch(error){toast.error(error instanceof Error?error.message:"Send failed");}finally{setSaving(false);}return;}const r=sendHumanReply(customerId,contact.id,effective,content);show(r);if(r.ok){setContent("");onOpenChange(false);}})()}}><Send className="mr-2 size-4"/>Send</Button></DialogFooter></DialogContent></Dialog>;
}

export function ChangeCPDialog({customerId,open,onOpenChange,currentCp,cps,onSave}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void;currentCp?:string;cps?:CurrentCpOption[];onSave?:(currentCpId:string,evidence:string,note:string)=>Promise<void>}){
  const {state,changeCP}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const options=(cps?.length?cps:undefined)?.filter(item=>CURRENT_CPS.includes(item.name as (typeof CURRENT_CPS)[number]))
    || state.cps.map(item=>({id:item.code,name:item.code,fullName:item.name,criteria:item.criteria}));
  const currentName=currentCp||c?.cp||"CP1";
  const [cpId,setCP]=useState(options.find(item=>item.name===currentName)?.id||options[0]?.id||"");
  const [evidence,setEvidence]=useState("Latest contact interaction");
  const [note,setNote]=useState("");
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    if(!open)return;
    setCP(options.find(item=>item.name===currentName)?.id||options[0]?.id||"");
    setEvidence("Latest contact interaction");
    setNote("");
  },[open,currentName,customerId]);
  const selected=options.find(item=>item.id===cpId);
  const stage=selected?.criteria||state.cps.find(item=>item.code===selected?.name)?.criteria;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Change Brand CP</DialogTitle><DialogDescription>CP never changes automatically. Review evidence and confirm.</DialogDescription></DialogHeader><Select value={cpId} onValueChange={setCP}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.fullName||x.name}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900"><b>Exit criteria</b><p className="mt-1">{stage}</p></div><Input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Evidence"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!selected||selected.name===currentName||!evidence||saving} onClick={()=>{void (async ()=>{if(!selected)return;if(onSave){setSaving(true);try{await onSave(selected.id,evidence,note);toast.success(`Brand moved to ${selected.name}`);onOpenChange(false);}catch(error){toast.error(error instanceof Error?error.message:"Update failed");}finally{setSaving(false);}return;}const r=changeCP(customerId,selected.name as CPCode,evidence,note);show(r);if(r.ok)onOpenChange(false);})()}}>Move to {selected?.name||"CP"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function FollowUpDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createFollowUp}=useWorkspace();const [days,setDays]=useState("3");const [reason,setReason]=useState("");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Schedule follow-up</DialogTitle><DialogDescription>This creates a human reminder. Nothing is sent automatically.</DialogDescription></DialogHeader><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[["1","Tomorrow"],["3","In 3 days"],["5","In 5 days"],["7","In 7 days"]].map(x=><SelectItem key={x[0]} value={x[0]}>{x[1]}</SelectItem>)}</SelectContent></Select><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={()=>{const r=createFollowUp(customerId,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),reason,note);show(r);if(r.ok)onOpenChange(false)}}>Schedule</Button></DialogFooter></DialogContent></Dialog>}

export function CreateCallDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createCallTask}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const valid=c?.contacts.filter(x=>x.phone&&x.phoneValid)||[];const [contact,setContact]=useState(valid[0]?.id||"");const [days,setDays]=useState("1");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create Call Task</DialogTitle><DialogDescription>The capacity scheduler chooses the Caller and may move the date.</DialogDescription></DialogHeader><Select value={contact||valid[0]?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue placeholder="Valid phone contact"/></SelectTrigger><SelectContent>{valid.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.phone}</SelectItem>)}</SelectContent></Select><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Today</SelectItem><SelectItem value="1">Tomorrow</SelectItem><SelectItem value="3">In 3 days</SelectItem></SelectContent></Select><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Goal and context"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!valid.length} onClick={()=>{const r=createCallTask(customerId,contact||valid[0].id,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),note);show(r);if(r.ok)onOpenChange(false)}}>Create Task</Button></DialogFooter></DialogContent></Dialog>}

function ContactDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {updateContact}=useWorkspace();const [name,setName]=useState("");const [role,setRole]=useState<Contact['role']>("Other");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add Contact</DialogTitle><DialogDescription>Channel availability is derived from valid contact details.</DialogDescription></DialogHeader><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Contact name"/><Select value={role} onValueChange={v=>setRole(v as Contact['role'])}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Connector","Owner","Other"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!name} onClick={()=>{const r=updateContact(customerId,{id:uid('ct'),name,role,email:email||undefined,phone:phone||undefined,whatsapp:phone||undefined,preferredChannel:email?'Email':'Phone',emailValid:!!email,phoneValid:!!phone});show(r);if(r.ok)onOpenChange(false)}}>Save Contact</Button></DialogFooter></DialogContent></Dialog>}
