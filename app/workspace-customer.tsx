"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bomb, CircleAlert, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import { Channel, Contact, CPCode, dateOnly, uid } from "@/lib/outreach-domain";
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

export function BrandDetail({customerId}:{customerId:string}){
  const {state,can,assignBrand}=useWorkspace();
  const router=useRouter(); const [launch,setLaunch]=useState(false); const [reply,setReply]=useState(false); const [cp,setCP]=useState(false); const [contact,setContact]=useState(false); const [ownerDraft,setOwnerDraft]=useState<string>();
  useEffect(()=>{setOwnerDraft(undefined)},[customerId]);
  const manager=state.currentRole==="Admin";
  const c=state.customers.find(x=>x.id===customerId); if(!c||!manager&&c.ownerId!==state.currentUserId)return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><CircleAlert className="mx-auto mb-3 size-8 text-slate-300"/><h1 className="font-bold">Brand not found</h1><Button variant="link" onClick={()=>router.push("/customers")}>Back to Brands</Button></div></div>;
  const interactions=state.interactions.filter(i=>i.customerId===c.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const last=interactions[0];
  return <div className="mx-auto max-w-[1480px]"><button onClick={()=>router.push("/customers")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4"/>Brands</button><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-4"><Avatar className="size-14"><AvatarFallback className="bg-violet-100 font-bold text-violet-700">{c.initials}</AvatarFallback></Avatar><div><h1 className="text-2xl font-bold tracking-tight">{c.name}</h1><div className="mt-2 flex gap-2"><CP value={c.cp}/><Status value={c.status}/></div><p className="mt-2 text-sm text-slate-500">{state.cps.find(x=>x.code===c.cp)?.goal||"—"} · {last?.title||"None"} · {c.source} · FC-Owner {state.users.find(u=>u.id===c.ownerId)?.name||"Unassigned"}</p>{can("assignOwner")&&<div className="mt-3 flex flex-wrap items-center gap-2"><Select value={ownerDraft??c.ownerId??"unassigned"} onValueChange={setOwnerDraft}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Select owner"/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{state.users.filter(u=>["Admin","Human Responder"].includes(u.role)).map(u=><SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={(ownerDraft??c.ownerId??"unassigned")===(c.ownerId||"unassigned")} onClick={()=>show(assignBrand(c.id,ownerDraft??c.ownerId??"unassigned"))}>Assign</Button></div>}</div></div><div className="flex flex-wrap gap-2">{can("reply")&&<Button variant="outline" onClick={()=>setReply(true)}><Send className="mr-2 size-4"/>Send message</Button>}{can("launch")&&<Button variant="outline" disabled={!!c.activeBombId||c.status==="Bomb Running"} onClick={()=>setLaunch(true)}><Bomb className="mr-2 size-4"/>Launch Bomb</Button>}{can("changeCP")&&<Button onClick={()=>setCP(true)}>Change CP</Button>}</div></div>
  <div className="grid gap-6 xl:grid-cols-[1fr_340px]"><section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h2 className="font-bold">Brand timeline</h2><p className="text-xs text-slate-500">Every KeyPerson, channel and complete exchange</p></div><InteractionFeed interactions={interactions} contacts={c.contacts}/><BrandReplyBox customerId={c.id}/></section>
  <aside className="space-y-5"><section className="rounded-2xl border bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-bold">KeyPerson</h2>{can("editBrand")&&<Button variant="ghost" size="icon-sm" onClick={()=>setContact(true)}><Plus className="size-4"/></Button>}</div><div className="mt-3 space-y-3">{c.contacts.map(x=><div key={x.id} className="rounded-xl bg-slate-50 p-3"><div className="text-sm font-semibold">{x.name}</div><div className="mt-1 text-xs text-slate-500">{x.role}</div><div className="mt-3 space-y-1.5">{([["Email",x.email],["Phone",x.phone],["SMS",x.phone],["WhatsApp",x.whatsapp],["LinkedIn",x.linkedin?`linkedin.com/in/${x.linkedin}`:undefined]] as const).map(([ch,value])=><div key={ch} className="flex items-center gap-2 text-xs text-slate-600"><ChannelIcon channel={ch} className="size-4"/><span className={value?"":"text-slate-400"}>{value||"—"}</span></div>)}</div></div>)}</div></section></aside></div>
  <LaunchBombDialog customerId={c.id} open={launch} onOpenChange={setLaunch}/><ReplyDialog customerId={c.id} open={reply} onOpenChange={setReply}/><ChangeCPDialog customerId={c.id} open={cp} onOpenChange={setCP}/><ContactDialog customerId={c.id} open={contact} onOpenChange={setContact}/></div>;
}

function BrandReplyBox({customerId}:{customerId:string}){
  const {state,can,sendHumanReply}=useWorkspace();
  const customer=state.customers.find(x=>x.id===customerId);
  const lastInbound=state.interactions.filter(i=>i.customerId===customerId&&i.direction==="Inbound").sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const inbox=state.inbox.find(i=>i.customerId===customerId&&i.status!=="Resolved");
  const [contactId,setContactId]=useState(lastInbound?.contactId||customer?.contacts[0]?.id||"");
  const [content,setContent]=useState("");
  const contact=customer?.contacts.find(x=>x.id===contactId)||customer?.contacts[0];
  const options=(["Email","SMS","WhatsApp","LinkedIn"] as Channel[]).filter(ch=>contact&&channelAvailable(contact,ch));
  const defaultChannel=lastInbound?.channel&&options.includes(lastInbound.channel)?lastInbound.channel:contact?.preferredChannel&&options.includes(contact.preferredChannel)?contact.preferredChannel:options[0];
  const [channel,setChannel]=useState<Channel>(defaultChannel||"Email");
  if(!can("reply")||!customer||customer.status==="Closed"||!lastInbound&&inbox?.status!=="Needs Reply")return null;
  const effective=options.includes(channel)?channel:options[0];
  return <section className="border-t bg-white p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><Select value={contact?.id} onValueChange={setContactId}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="KeyPerson"/></SelectTrigger><SelectContent>{customer.contacts.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={effective} onValueChange={v=>setChannel(v as Channel)}><SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Channel"/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x} value={x}><ChannelOption channel={x}/></SelectItem>)}</SelectContent></Select></div><span className="text-xs text-slate-400">Reply needed</span></div><div className="flex gap-2"><Textarea value={content} onChange={e=>setContent(e.target.value)} className="min-h-20 resize-none" placeholder="Write a reply…"/><Button className="h-20 px-5" disabled={!contact||!content.trim()||!effective} onClick={()=>{if(!contact||!effective)return;const r=sendHumanReply(customer.id,contact.id,effective,content);show(r);if(r.ok)setContent("")}}><Send className="size-4"/></Button></div></section>;
}

type LaunchStepCopy = { subject?: string; content?: string; callGoal?: string; script?: string };
const delayLabel = (n: number) => n === 0 ? "Immediately" : `${n} day${n > 1 ? "s" : ""} later`;

export function LaunchBombDialog({customerId,open,onOpenChange}:{customerId?:string;open:boolean;onOpenChange:(v:boolean)=>void}){
  const {state,launchBomb}=useWorkspace();
  const c=state.customers.find(x=>x.id===customerId);
  const bombs=state.bombs.filter(b=>b.status==="Active"&&b.cp===c?.cp);
  const [bombId,setBombId]=useState("");
  const [target,setTarget]=useState("");
  const [copies,setCopies]=useState<Record<string,LaunchStepCopy>>({});
  const [launchedInstanceId,setLaunchedInstanceId]=useState("");
  const selected=bombs.find(b=>b.id===bombId);
  const targets=c?.contacts.filter(x=>x.role===selected?.targetRole)||[];
  const person=targets.find(t=>t.id===target)||targets[0];
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
  const assignedActions=launchedInstanceId?state.actions.filter(a=>a.bombInstanceId===launchedInstanceId):[];
  return <Dialog open={open} onOpenChange={value=>{if(!value){setLaunchedInstanceId("");}onOpenChange(value)}}><DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl"><DialogHeader><DialogTitle>{launchedInstanceId?"Bomb launched · execution plan":"Launch Bomb"}</DialogTitle><DialogDescription>{launchedInstanceId?"The system assigned this execution order and schedule. This plan is read-only.":"Review and edit each step’s copy for this launch only. The template is not changed. After confirmation, the system assigns timing and order based on channel availability and caller capacity. Any meaningful reply stops the run."}</DialogDescription></DialogHeader>
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      {launchedInstanceId&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="text-sm font-semibold text-emerald-900">System assignment complete</div><p className="mt-1 text-xs text-emerald-800">The order and timing below are informational only and cannot be edited.</p><div className="mt-4 space-y-2">{assignedActions.map((action,index)=><div key={action.id} className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-white px-3 py-3"><span className="grid size-7 place-items-center rounded-md bg-emerald-100 text-xs font-bold text-emerald-700">{index+1}</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{action.channel}{action.status==="Skipped"?" · Skipped":""}</div><div className="text-xs text-slate-500">{action.status==="Skipped"?action.note||"Channel unavailable":`${dateOnly(action.actualDate)} · ${action.status}`}</div></div></div>)}</div></div>}
      {!launchedInstanceId&&<>
      <label className="text-sm font-medium">Bomb<Select value={bombId} onValueChange={v=>{setBombId(v);setTarget("");}}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Select a Bomb"/></SelectTrigger><SelectContent>{bombs.map(b=><SelectItem key={b.id} value={b.id}>{b.name} · V{b.version}</SelectItem>)}</SelectContent></Select></label>
      {selected&&<>
        <label className="text-sm font-medium">Target KeyPerson<Select value={target||targets[0]?.id} onValueChange={setTarget}><SelectTrigger className="mt-2 w-full"><SelectValue placeholder={`Requires ${selected.targetRole}`}/></SelectTrigger><SelectContent>{targets.map(t=><SelectItem key={t.id} value={t.id}>{t.name} · {t.role}</SelectItem>)}</SelectContent></Select></label>
        <div className="rounded-xl bg-slate-50 p-4 text-sm"><b>{selected.goal}</b><p className="mt-1 text-xs text-slate-500">Edits apply only to this launch.</p>{unavailable.length>0&&<div className="mt-2 text-xs text-amber-700">Unavailable steps will be skipped: {[...new Set(unavailable)].join(", ")}</div>}</div>
        {selected.steps.map((s,index)=>{
          const copy=copies[s.id]||{};
          const skipped=!!person&&!channelAvailable(person,s.channel);
          return <div key={s.id} className={`rounded-xl border p-4 ${skipped?"opacity-60":""}`}>
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-slate-50 text-xs font-bold text-violet-600">{index+1}</span><ChannelOption channel={s.channel}/></div><span className="text-xs text-slate-500">System will schedule this step{skipped?" · will skip":""}</span></div>
            {s.channel==="Email"&&<div className="grid gap-2"><Input value={copy.subject||""} onChange={e=>updateCopy(s.id,{subject:e.target.value})} placeholder="Email subject"/><Textarea className="min-h-24" value={copy.content||""} onChange={e=>updateCopy(s.id,{content:e.target.value})} placeholder="Email body"/></div>}
            {s.channel==="Phone"&&<div className="grid gap-2"><Input value={copy.callGoal||""} onChange={e=>updateCopy(s.id,{callGoal:e.target.value})} placeholder="Call goal"/><Textarea className="min-h-24" value={copy.script||""} onChange={e=>updateCopy(s.id,{script:e.target.value})} placeholder="Suggested script"/></div>}
            {s.channel!=="Email"&&s.channel!=="Phone"&&<Textarea className="min-h-24" value={copy.content||""} onChange={e=>updateCopy(s.id,{content:e.target.value})} placeholder={`${s.channel} content`}/>}
          </div>;
        })}
      </>}
      </>}
    </div>
    <DialogFooter>{launchedInstanceId?<Button onClick={()=>onOpenChange(false)}>Done</Button>:<><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!selected||!targets.length||incomplete||!!c?.activeBombId||c?.status==="Bomb Running"} onClick={()=>{if(!c||!selected)return;const r=launchBomb(c.id,selected.id,target||targets[0]?.id,copies);show(r);if(r.ok&&r.id)setLaunchedInstanceId(r.id);}}>Launch Bomb</Button></>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function ReplyDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,sendHumanReply}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const [contactId,setContact]=useState(c?.contacts[0]?.id||"");const contact=c?.contacts.find(x=>x.id===contactId)||c?.contacts[0];const options=(['Email','SMS','WhatsApp','LinkedIn'] as Channel[]).filter(ch=>contact&&channelAvailable(contact,ch));const [channel,setChannel]=useState<Channel>(contact?.preferredChannel||"Email");const [content,setContent]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Send message</DialogTitle><DialogDescription>An active Bomb will stop before this human message is sent.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3"><Select value={contact?.id} onValueChange={setContact}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{c?.contacts.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select><Select value={options.includes(channel)?channel:options[0]} onValueChange={v=>setChannel(v as Channel)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{options.map(x=><SelectItem key={x} value={x}><ChannelOption channel={x}/></SelectItem>)}</SelectContent></Select></div><Textarea className="min-h-32" value={content} onChange={e=>setContent(e.target.value)} placeholder="Write a reply…"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!contact||!content.trim()} onClick={()=>{if(!contact)return;const r=sendHumanReply(customerId,contact.id,options.includes(channel)?channel:options[0],content);show(r);if(r.ok){setContent("");onOpenChange(false)}}}><Send className="mr-2 size-4"/>Send</Button></DialogFooter></DialogContent></Dialog>}

export function ChangeCPDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,changeCP}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const [cp,setCP]=useState<CPCode>(c?.cp||"CP0");const [evidence,setEvidence]=useState("Latest contact interaction");const [note,setNote]=useState("");const stage=state.cps.find(x=>x.code===cp);return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Change Brand CP</DialogTitle><DialogDescription>CP never changes automatically. Review evidence and confirm.</DialogDescription></DialogHeader><Select value={cp} onValueChange={v=>setCP(v as CPCode)}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{state.cps.map(x=><SelectItem key={x.code} value={x.code}>{x.code} · {x.name}</SelectItem>)}</SelectContent></Select><div className="rounded-xl bg-violet-50 p-4 text-sm text-violet-900"><b>Exit criteria</b><p className="mt-1">{stage?.criteria}</p></div><Input value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Evidence"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={cp===c?.cp||!evidence} onClick={()=>{const r=changeCP(customerId,cp,evidence,note);show(r);if(r.ok)onOpenChange(false)}}>Move to {cp}</Button></DialogFooter></DialogContent></Dialog>}

export function FollowUpDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createFollowUp}=useWorkspace();const [days,setDays]=useState("3");const [reason,setReason]=useState("");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Schedule follow-up</DialogTitle><DialogDescription>This creates a human reminder. Nothing is sent automatically.</DialogDescription></DialogHeader><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{[["1","Tomorrow"],["3","In 3 days"],["5","In 5 days"],["7","In 7 days"]].map(x=><SelectItem key={x[0]} value={x[0]}>{x[1]}</SelectItem>)}</SelectContent></Select><Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason"/><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Note"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={()=>{const r=createFollowUp(customerId,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),reason,note);show(r);if(r.ok)onOpenChange(false)}}>Schedule</Button></DialogFooter></DialogContent></Dialog>}

export function CreateCallDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {state,createCallTask}=useWorkspace();const c=state.customers.find(x=>x.id===customerId);const valid=c?.contacts.filter(x=>x.phone&&x.phoneValid)||[];const [contact,setContact]=useState(valid[0]?.id||"");const [days,setDays]=useState("1");const [note,setNote]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create Call Task</DialogTitle><DialogDescription>The capacity scheduler chooses the Caller and may move the date.</DialogDescription></DialogHeader><Select value={contact||valid[0]?.id} onValueChange={setContact}><SelectTrigger className="w-full"><SelectValue placeholder="Valid phone contact"/></SelectTrigger><SelectContent>{valid.map(x=><SelectItem key={x.id} value={x.id}>{x.name} · {x.phone}</SelectItem>)}</SelectContent></Select><Select value={days} onValueChange={setDays}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="0">Today</SelectItem><SelectItem value="1">Tomorrow</SelectItem><SelectItem value="3">In 3 days</SelectItem></SelectContent></Select><Textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Goal and context"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!valid.length} onClick={()=>{const r=createCallTask(customerId,contact||valid[0].id,new Date(Date.parse(state.simulatedDate)+Number(days)*86400000).toISOString(),note);show(r);if(r.ok)onOpenChange(false)}}>Create Task</Button></DialogFooter></DialogContent></Dialog>}

function ContactDialog({customerId,open,onOpenChange}:{customerId:string;open:boolean;onOpenChange:(v:boolean)=>void}){const {updateContact}=useWorkspace();const [name,setName]=useState("");const [role,setRole]=useState<Contact['role']>("Other");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add Contact</DialogTitle><DialogDescription>Channel availability is derived from valid contact details.</DialogDescription></DialogHeader><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Contact name"/><Select value={role} onValueChange={v=>setRole(v as Contact['role'])}><SelectTrigger className="w-full"><SelectValue/></SelectTrigger><SelectContent>{["Connector","Owner","Other"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><Input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone"/><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={!name} onClick={()=>{const r=updateContact(customerId,{id:uid('ct'),name,role,email:email||undefined,phone:phone||undefined,whatsapp:phone||undefined,preferredChannel:email?'Email':'Phone',emailValid:!!email,phoneValid:!!phone});show(r);if(r.ok)onOpenChange(false)}}>Save Contact</Button></DialogFooter></DialogContent></Dialog>}
