/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  addDays, CallOutcome, Channel, Contact, CPCode, createSeedState, dateOnly, roleCapabilities,
  Role, uid, WorkspaceState, BombTemplate, CPStage,
} from "@/lib/outreach-domain";

const STORAGE_KEY = "outreach-control-demo-v3";
type Result = { ok: true; message: string; id?: string } | { ok: false; message: string };
type Store = {
  state: WorkspaceState; hydrated: boolean; can: (capability: string) => boolean;
  reset: () => void; setRole: (role: Role) => void; advanceDay: (days?: number) => void;
  launchBomb: (customerId: string, bombId: string, targetContactId?: string, stepCopies?: Record<string, { subject?: string; content?: string; callGoal?: string; script?: string }>) => Result;
  receiveReply: (customerId: string, channel: Channel, content: string) => Result;
  sendHumanReply: (customerId: string, contactId: string, channel: Channel, content: string) => Result;
  submitCallResult: (taskId: string, outcome: CallOutcome, summary?: string, callbackDate?: string, recordingStatus?: "Attached" | "Upload manually" | "Unavailable") => Result;
  changeCP: (customerId: string, cp: CPCode, evidence: string, note?: string) => Result;
  createFollowUp: (customerId: string, dueAt: string, reason: string, note?: string) => Result;
  resolveInbox: (inboxId: string) => Result; pauseBrand: (customerId: string) => Result;
  assignBrand: (customerId: string, ownerId: string) => Result; createCallTask: (customerId: string, contactId: string, date: string, note: string) => Result;
  createBrand: (name: string, contactName: string, email: string, phone: string, role: Contact["role"]) => Result;
  importBrands: (rows: { name: string; contactName: string; role?: Contact["role"]; email?: string; phone?: string; whatsapp?: string; linkedin?: string; source?: string }[]) => Result;
  updateContact: (customerId: string, contact: Contact) => Result; closeBrand: (customerId: string, reason: string) => Result;
  reassignCall: (taskId: string, callerId: string, date?: string) => Result; updateCallerCapacity: (callerId: string, capacity: number) => Result;
  saveBomb: (bomb: BombTemplate) => Result; createBomb: (bomb: Omit<BombTemplate,"id"|"version"|"launches"|"updatedAt">) => Result;
  setBombStatus: (bombId: string, status: BombTemplate["status"]) => Result; updateCPStage: (stage: CPStage) => Result;
  updateIntegration: (channel: Channel, status: "Connected" | "Needs Attention" | "Disconnected") => Result;
  fillTodayCapacity: () => void; simulateFailure: () => void;
};

const WorkspaceContext = createContext<Store | null>(null);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function stopBomb(draft: WorkspaceState, customerId: string, reason: string) {
  const customer = draft.customers.find(c=>c.id===customerId); if(!customer?.activeBombId) return 0;
  const instance = draft.bombInstances.find(b=>b.id===customer.activeBombId); if(!instance) return 0;
  instance.status="Stopped"; instance.stoppedAt=draft.simulatedDate; instance.stopReason=reason;
  let released=0;
  draft.actions.filter(a=>a.bombInstanceId===instance.id&&["Scheduled","Sending"].includes(a.status)).forEach(a=>{a.status="Cancelled"; if(a.callTaskId) released++;});
  draft.callTasks.filter(t=>t.bombInstanceId===instance.id&&t.status==="Scheduled").forEach(t=>t.status="Cancelled");
  customer.activeBombId=undefined;
  draft.interactions.unshift({id:uid("int"),customerId,type:"Bomb",title:"Bomb stopped",content:`${reason} · Future actions cancelled${released?` · ${released} phone slot released`:""}`,createdAt:draft.simulatedDate});
  return released;
}

function chooseCallSlot(draft: WorkspaceState, earliest: string) {
  const callers=draft.users.filter(u=>u.role==="Caller"); let date=earliest;
  for(let tries=0;tries<30;tries++){
    const weekday=new Date(date).getUTCDay();
    const eligible=callers.filter(c=>(c.workingDays||[1,2,3,4,5]).includes(weekday)).map(c=>({caller:c,count:draft.callTasks.filter(t=>t.callerId===c.id&&dateOnly(t.scheduledDate)===dateOnly(date)&&t.status!=="Cancelled").length})).filter(x=>x.count<(x.caller.dailyCapacity||30)).sort((a,b)=>a.count-b.count);
    if(eligible.length) return {callerId:eligible[0].caller.id,date};
    date=addDays(date,1);
  }
  return {callerId:callers[0]?.id||"u_alex",date};
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state,setState]=useState<WorkspaceState>(()=>createSeedState());
  const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{try{const saved=localStorage.getItem(STORAGE_KEY);if(saved){const parsed=JSON.parse(saved) as WorkspaceState;if(parsed.version===3||parsed.version===4){if((parsed.currentRole as string)==="Outreach Manager")parsed.currentRole="Admin";parsed.users=parsed.users.map(u=>(u.role as string)==="Outreach Manager"?{...u,role:"Admin"}:u);parsed.customers=parsed.customers.map(c=>(c.status as string)==="Follow-up Due"?{...c,status:"Human Handling"}:c);parsed.inbox=parsed.inbox.map(i=>(i.status as string)==="Waiting for Contact"?{...i,status:"Waiting for Reply"}:i);const seed=createSeedState();const demoCustomerIds=["c_sunridge","c_moss","c_wildgrain","c_cedar"];parsed.customers.push(...seed.customers.filter(c=>demoCustomerIds.includes(c.id)&&!parsed.customers.some(existing=>existing.id===c.id)));parsed.inbox.push(...seed.inbox.filter(i=>demoCustomerIds.includes(i.customerId)&&!parsed.inbox.some(existing=>existing.id===i.id)));parsed.interactions.push(...seed.interactions.filter(i=>(demoCustomerIds.includes(i.customerId)||i.id==="int_n_bomb")&&!parsed.interactions.some(existing=>existing.id===i.id)));parsed.interactions=parsed.interactions.map(i=>{if(i.type!=="Bomb"||i.title!=="Bomb started"||i.bombInstanceId)return i;const match=parsed.bombInstances.find(b=>b.customerId===i.customerId&&(b.startedAt===i.createdAt||dateOnly(b.startedAt)===dateOnly(i.createdAt)))||parsed.bombInstances.find(b=>b.customerId===i.customerId&&i.content.includes(b.templateName));return match?{...i,bombInstanceId:match.id,contactId:i.contactId||match.targetContactId,content:i.content.split(" · Execution plan:")[0]}:i;});parsed.version=4;setState(parsed);}}}catch{}setHydrated(true);},[]);
  useEffect(()=>{if(hydrated)localStorage.setItem(STORAGE_KEY,JSON.stringify(state));},[state,hydrated]);
  useEffect(()=>{if(hydrated){const seed=createSeedState();const seedCedar=seed.customers.find(c=>c.id==="c_cedar");const cedar=state.customers.find(c=>c.id==="c_cedar");if(seedCedar&&(state.customers.some(c=>c.id==="c_harvest")||cedar?.cp!=="CP3"||!cedar?.partnershipContext))setState(prev=>({...prev,customers:prev.customers.filter(c=>c.id!=="c_harvest").map(c=>c.id==="c_cedar"?{...c,cp:"CP3",partnershipContext:seedCedar.partnershipContext}:c)}));}},[hydrated]);
  const mutate=useCallback((fn:(draft:WorkspaceState)=>void)=>setState(prev=>{const draft=clone(prev);fn(draft);return draft;}),[]);
  const can=useCallback((capability:string)=>roleCapabilities[state.currentRole].includes(capability),[state.currentRole]);

  const reset=()=>{const fresh=createSeedState();setState(fresh);localStorage.setItem(STORAGE_KEY,JSON.stringify(fresh));};
  const setRole=(role:Role)=>mutate(d=>{d.currentRole=role;d.currentUserId=role==="Caller"?"u_alex":role==="Human Responder"?"u_mike":"u_sarah";});
  const addAudit=(d:WorkspaceState,action:string,customerId?:string,previousValue?:string,newValue?:string)=>d.audit.unshift({id:uid("au"),actorId:d.currentUserId,customerId,action,previousValue,newValue,createdAt:d.simulatedDate});

  const advanceDay=(days=1)=>mutate(d=>{d.simulatedDate=addDays(d.simulatedDate,days);d.followUps.filter(f=>f.status==="Scheduled"&&new Date(f.dueAt)<=new Date(d.simulatedDate)).forEach(f=>{f.status="Due";const customer=d.customers.find(c=>c.id===f.customerId);const item=d.inbox.find(i=>i.id===f.inboxItemId);if(item){item.status="Follow-up Scheduled";item.updatedAt=d.simulatedDate;}});d.actions.filter(a=>a.status==="Scheduled"&&a.channel!=="Phone"&&new Date(a.actualDate)<=new Date(d.simulatedDate)).forEach(a=>{a.status="Sent";const instance=d.bombInstances.find(b=>b.id===a.bombInstanceId);d.interactions.unshift({id:uid("int"),customerId:a.customerId,contactId:instance?.targetContactId,type:"Message",channel:a.channel,direction:"Outbound",title:`${a.channel} · Sent`,content:a.content,createdAt:d.simulatedDate});});d.bombInstances.filter(b=>b.status==="Running").forEach(b=>{const remaining=d.actions.some(a=>a.bombInstanceId===b.id&&["Scheduled","Sending"].includes(a.status));if(!remaining){b.status="Completed";const c=d.customers.find(c=>c.id===b.customerId);if(c){c.activeBombId=undefined;c.status="Waiting for Reply";}d.interactions.unshift({id:uid("int"),customerId:b.customerId,type:"Bomb",title:"Bomb completed",content:"All available actions were executed",createdAt:d.simulatedDate});}});addAudit(d,`Date advanced by ${days} day(s)`);});

  const launchBomb=(customerId:string,bombId:string,targetContactId?:string,stepCopies?:Record<string,{subject?:string;content?:string;callGoal?:string;script?:string}>):Result=>{
    let result:Result={ok:false,message:"Unable to launch Bomb"};
    mutate(d=>{const customer=d.customers.find(c=>c.id===customerId);const bomb=d.bombs.find(b=>b.id===bombId);if(!customer||!bomb){result={ok:false,message:"Brand or Bomb not found"};return;}if(customer.activeBombId){result={ok:false,message:"This Brand already has an active Bomb"};return;}if(bomb.status!=="Active"){result={ok:false,message:"Only Active Bombs can be launched"};return;}const target=customer.contacts.find(c=>c.id===targetContactId)||customer.contacts.find(c=>c.role===bomb.targetRole);if(!target){result={ok:false,message:`This Bomb requires a ${bomb.targetRole} contact`};return;}
      const instanceId=uid("bi");d.bombInstances.unshift({id:instanceId,customerId,templateId:bomb.id,templateName:bomb.name,version:bomb.version,goal:bomb.goal,targetContactId:target.id,status:"Running",startedAt:d.simulatedDate});
      bomb.steps.forEach((step,index)=>{const planned=addDays(d.simulatedDate,index);let actual=planned;let status:"Scheduled"|"Sent"|"Skipped"="Scheduled";let note:string|undefined;const channelAvailable=step.channel==="Email"?!!target.email&&target.emailValid:step.channel==="SMS"||step.channel==="Phone"?!!target.phone&&target.phoneValid:step.channel==="WhatsApp"?!!target.whatsapp:step.channel==="LinkedIn"?!!target.linkedin:true;if(!channelAvailable){status="Skipped";note=`${step.channel} unavailable for ${target.name}`;}
        const actionId=uid("act");let callTaskId:string|undefined;
        const copy=stepCopies?.[step.id];const subject=copy?.subject??step.subject;const body=copy?.content??step.content;const callGoal=copy?.callGoal??step.callGoal;const script=copy?.script??step.script;const content=step.channel==="Email"&&subject?`Subject: ${subject}\n\n${body}`:body;
        if(step.channel==="Phone"&&status!=="Skipped"){const slot=chooseCallSlot(d,planned);actual=slot.date;callTaskId=uid("call");d.callTasks.push({id:callTaskId,customerId,contactId:target.id,bombInstanceId:instanceId,scheduledActionId:actionId,callerId:slot.callerId,scheduledDate:actual,priority:bomb.priority,goal:callGoal||bomb.goal,script:script||"Call the KeyPerson and record the outcome.",status:"Scheduled"});if(dateOnly(actual)!==dateOnly(planned))note="Phone rescheduled due to capacity";}
        if(index===0&&step.channel!=="Phone"&&status!=="Skipped"){status="Sent";d.interactions.unshift({id:uid("int"),customerId,contactId:target.id,type:"Message",channel:step.channel,direction:"Outbound",title:`${step.channel} · Sent`,content,createdAt:d.simulatedDate});}
        d.actions.push({id:actionId,bombInstanceId:instanceId,customerId,stepId:step.id,channel:step.channel,plannedDate:planned,actualDate:actual,status,content,note,callTaskId});
      });
      customer.activeBombId=instanceId;customer.status="Bomb Running";customer.updatedAt=d.simulatedDate;bomb.launches++;d.interactions.unshift({id:uid("int"),customerId,contactId:target.id,bombInstanceId:instanceId,type:"Bomb",title:"Bomb started",content:`${bomb.name} · Version ${bomb.version}`,createdAt:d.simulatedDate});addAudit(d,"Bomb launched",customerId,undefined,`${bomb.name} V${bomb.version}`);result={ok:true,message:`${bomb.name} launched`,id:instanceId};
    });return result;
  };

  const receiveReply=(customerId:string,channel:Channel,content:string):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const customer=d.customers.find(c=>c.id===customerId);if(!customer)return;const contact=customer.contacts[0];stopBomb(d,customerId,`${channel} contact response`);customer.status="Human Handling";customer.updatedAt=d.simulatedDate;d.interactions.unshift({id:uid("int"),customerId,contactId:contact?.id,type:"Message",channel,direction:"Inbound",title:`${channel} · Contact → FC`,content,createdAt:d.simulatedDate});const existing=d.inbox.find(i=>i.customerId===customerId&&i.status!=="Resolved");if(existing){existing.status="Needs Reply";existing.contactId=contact?.id;existing.preview=content;existing.updatedAt=d.simulatedDate;}else d.inbox.unshift({id:uid("in"),customerId,contactId:contact?.id,type:"Reply",status:"Needs Reply",ownerId:customer.ownerId,createdAt:d.simulatedDate,updatedAt:d.simulatedDate,preview:content});addAudit(d,"Contact response received",customerId,undefined,channel);result={ok:true,message:"Response added; automation stopped"};});return result;};

  const sendHumanReply=(customerId:string,contactId:string,channel:Channel,content:string):Result=>{if(!content.trim())return{ok:false,message:"Message cannot be empty"};let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const customer=d.customers.find(c=>c.id===customerId);if(!customer)return;const contact=customer.contacts.find(c=>c.id===contactId);if(!contact){result={ok:false,message:"Contact not found"};return;}stopBomb(d,customerId,"Human sent a message");customer.status="Waiting for Reply";customer.updatedAt=d.simulatedDate;d.interactions.unshift({id:uid("int"),customerId,contactId,type:"Message",channel,direction:"Outbound",title:`${channel} · FC → Contact`,content,createdAt:d.simulatedDate});const item=d.inbox.find(i=>i.customerId===customerId&&i.status!=="Resolved");if(item){item.status="Waiting for Reply";item.contactId=contactId;item.preview=`You: ${content}`;item.updatedAt=d.simulatedDate;}addAudit(d,"Human message sent",customerId,undefined,channel);result={ok:true,message:`Reply sent via ${channel}`};});return result;};

  const submitCallResult=(taskId:string,outcome:CallOutcome,summary="",callbackDate?:string,recordingStatus:"Attached"|"Upload manually"|"Unavailable"="Attached"):Result=>{let result:Result={ok:false,message:"Call task not found"};mutate(d=>{const task=d.callTasks.find(t=>t.id===taskId);if(!task)return;const customer=d.customers.find(c=>c.id===task.customerId);if(!customer)return;task.status="Completed";task.outcome=outcome;task.responseSummary=summary;task.recordingStatus=recordingStatus;const action=d.actions.find(a=>a.id===task.scheduledActionId);if(action)action.status="Completed";d.interactions.unshift({id:uid("int"),customerId:customer.id,contactId:task.contactId,type:"Phone",channel:"Phone",direction:"Outbound",title:`Phone · ${outcome}`,content:summary||outcome,createdAt:d.simulatedDate,outcome,recording:recordingStatus==="Attached"?"call-recording.mp3":undefined});
      if(outcome==="Contact Responded"||outcome==="Connected — No Useful Response"||outcome==="Call Back Requested"){stopBomb(d,customer.id,`Phone connected · ${outcome}`);customer.status="Human Handling";const itemId=uid("in");d.inbox.unshift({id:itemId,customerId:customer.id,contactId:task.contactId,type:"Reply",status:outcome==="Call Back Requested"?"Follow-up Scheduled":"Needs Reply",ownerId:customer.ownerId,createdAt:d.simulatedDate,updatedAt:d.simulatedDate,preview:summary||outcome});if(outcome==="Call Back Requested"){const due=callbackDate||addDays(d.simulatedDate,1);d.followUps.push({id:uid("fu"),customerId:customer.id,inboxItemId:itemId,dueAt:due,reason:"Contact requested a call back",note:summary,suggestedAction:"Phone",status:"Scheduled"});const slot=chooseCallSlot(d,due);d.callTasks.push({id:uid("call"),customerId:customer.id,contactId:task.contactId,callerId:slot.callerId,scheduledDate:slot.date,priority:"High",goal:"Complete requested call back",script:summary||"Return the requested call.",status:"Scheduled"});}}
      if(outcome==="Wrong Number"){const contact=customer.contacts.find(c=>c.id===task.contactId);if(contact)contact.phoneValid=false;d.actions.filter(a=>a.customerId===customer.id&&a.channel==="Phone"&&a.status==="Scheduled").forEach(a=>a.status="Skipped");}
      if(outcome==="Wrong Contact")d.inbox.unshift({id:uid("in"),customerId:customer.id,contactId:task.contactId,type:"Reply",status:"Needs Reply",ownerId:customer.ownerId,createdAt:d.simulatedDate,updatedAt:d.simulatedDate,preview:"Caller reported wrong contact"});addAudit(d,"Call result submitted",customer.id,undefined,outcome);result={ok:true,message:"Call result submitted"};});return result;};

  const changeCP=(customerId:string,cp:CPCode,evidence:string,note=""):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;const previous=c.cp;c.cp=cp;c.updatedAt=d.simulatedDate;d.interactions.unshift({id:uid("int"),customerId,type:"CP",title:`${previous} → ${cp}`,content:`Evidence: ${evidence}${note?` · ${note}`:""}`,createdAt:d.simulatedDate});addAudit(d,"CP changed",customerId,previous,cp);result={ok:true,message:`Brand moved to ${cp}`};});return result;};
  const createFollowUp=(customerId:string,dueAt:string,reason:string,note=""):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;const item=d.inbox.find(i=>i.customerId===customerId&&i.status!=="Resolved");const inboxId=item?.id||uid("in");if(item){item.status="Follow-up Scheduled";item.updatedAt=d.simulatedDate;}else d.inbox.unshift({id:inboxId,customerId,type:"Reply",status:"Follow-up Scheduled",ownerId:c.ownerId,createdAt:d.simulatedDate,updatedAt:d.simulatedDate,preview:reason});d.followUps.push({id:uid("fu"),customerId,inboxItemId:inboxId,dueAt,reason,note,status:new Date(dueAt)<=new Date(d.simulatedDate)?"Due":"Scheduled"});d.interactions.unshift({id:uid("int"),customerId,type:"Follow-up",title:"Follow-up scheduled",content:`${reason} · ${dateOnly(dueAt)}`,createdAt:d.simulatedDate});addAudit(d,"Follow-up scheduled",customerId,undefined,dueAt);result={ok:true,message:"Reply task scheduled"};});return result;};
  const resolveInbox=(inboxId:string):Result=>{let result:Result={ok:false,message:"Inbox item not found"};mutate(d=>{const item=d.inbox.find(i=>i.id===inboxId);if(!item)return;item.status="Resolved";item.updatedAt=d.simulatedDate;addAudit(d,"Inbox item resolved",item.customerId);result={ok:true,message:"Conversation resolved"};});return result;};
  const pauseBrand=(customerId:string):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;if(c.status==="Paused"){c.status=c.activeBombId?"Bomb Running":"Ready";const bi=d.bombInstances.find(b=>b.id===c.activeBombId);if(bi)bi.status="Running";result={ok:true,message:"Outreach resumed"};}else{c.status="Paused";const bi=d.bombInstances.find(b=>b.id===c.activeBombId);if(bi)bi.status="Paused";result={ok:true,message:"Outreach paused"};}addAudit(d,result.message,customerId);});return result;};
  const assignBrand=(customerId:string,ownerId:string):Result=>{if(!roleCapabilities[state.currentRole].includes("assignOwner"))return{ok:false,message:"You cannot assign an owner"};let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;const prev=c.ownerId;c.ownerId=ownerId==="unassigned"?undefined:ownerId;d.inbox.filter(i=>i.customerId===customerId&&i.status!=="Resolved").forEach(i=>i.ownerId=c.ownerId);addAudit(d,"Human assignment changed",customerId,prev,c.ownerId);result={ok:true,message:"Owner assigned"};});return result;};
  const createCallTask=(customerId:string,contactId:string,date:string,note:string):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;const contact=c.contacts.find(x=>x.id===contactId);if(!contact?.phone||!contact.phoneValid){result={ok:false,message:"A valid phone number is required"};return;}const slot=chooseCallSlot(d,date);const id=uid("call");d.callTasks.push({id,customerId,contactId,callerId:slot.callerId,scheduledDate:slot.date,priority:"Normal",goal:note||"Human follow-up call",script:note||"Follow up with the Contact.",status:"Scheduled"});addAudit(d,"Call task created",customerId,undefined,slot.date);result={ok:true,message:`Call scheduled for ${dateOnly(slot.date)}`,id};});return result;};
  const createBrand=(name:string,contactName:string,email:string,phone:string,role:Contact["role"]):Result=>{if(!name.trim()||!contactName.trim())return{ok:false,message:"Brand and contact names are required"};let id="";mutate(d=>{id=uid("c");const contactId=uid("ct");d.customers.unshift({id,name:name.trim(),initials:name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(),cp:"CP0",status:"Ready",source:"Manual",ownerId:d.currentUserId,contacts:[{id:contactId,name:contactName.trim(),role,email:email||undefined,phone:phone||undefined,whatsapp:phone||undefined,preferredChannel:email?"Email":"Phone",emailValid:!!email,phoneValid:!!phone}],createdAt:d.simulatedDate,updatedAt:d.simulatedDate});addAudit(d,"Brand created",id,undefined,name);});return{ok:true,message:"Brand created",id};};
  const importBrands=(rows:{name:string;contactName:string;role?:Contact["role"];email?:string;phone?:string;whatsapp?:string;linkedin?:string;source?:string}[]):Result=>{
    if(state.currentRole!=="Admin")return{ok:false,message:"Only Admin can import brands"};
    const valid=rows.filter(r=>r.name.trim()&&r.contactName.trim());
    if(!valid.length)return{ok:false,message:"No valid rows to import"};
    let count=0;
    mutate(d=>{
      const grouped=new Map<string,typeof valid>();
      valid.forEach(row=>{const key=row.name.trim().toLowerCase();const current=grouped.get(key)||[];current.push(row);grouped.set(key,current);});
      grouped.forEach(group=>{
        const first=group[0];
        const id=uid("c");
        const contacts=group.map(r=>{
          const role=(["Connector","Owner","Other"] as const).includes(r.role as Contact["role"])?r.role as Contact["role"]:"Connector";
          const preferredChannel: Channel=r.email?"Email":r.phone?"Phone":r.whatsapp?"WhatsApp":r.linkedin?"LinkedIn":"Email";
          return {id:uid("ct"),name:r.contactName.trim(),role,email:r.email||undefined,phone:r.phone||undefined,whatsapp:r.whatsapp||undefined,linkedin:r.linkedin||undefined,preferredChannel,emailValid:!!r.email,phoneValid:!!r.phone};
        });
        d.customers.unshift({id,name:first.name.trim(),initials:first.name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(),cp:"CP0",status:"Ready",source:group.find(r=>r.source?.trim())?.source?.trim()||"CSV import",ownerId:undefined,contacts,createdAt:d.simulatedDate,updatedAt:d.simulatedDate});
        count++;
      });
      addAudit(d,"Brands imported from CSV",undefined,undefined,`${count} brands; ${valid.length} contacts`);
    });
    return{ok:true,message:`Imported ${count} brand${count>1?"s":""} with ${valid.length} contact${valid.length>1?"s":""}`};
  };
  const updateContact=(customerId:string,contact:Contact):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;const i=c.contacts.findIndex(x=>x.id===contact.id);if(i>=0)c.contacts[i]=contact;else c.contacts.push(contact);c.updatedAt=d.simulatedDate;addAudit(d,"Contact updated",customerId,undefined,contact.name);result={ok:true,message:"Contact saved"};});return result;};
  const closeBrand=(customerId:string,reason:string):Result=>{let result:Result={ok:false,message:"Brand not found"};mutate(d=>{const c=d.customers.find(c=>c.id===customerId);if(!c)return;stopBomb(d,customerId,"Brand closed");c.status="Closed";c.closedReason=reason;c.updatedAt=d.simulatedDate;d.inbox.filter(i=>i.customerId===customerId&&i.status!=="Resolved").forEach(i=>i.status="Resolved");addAudit(d,"Brand closed",customerId,undefined,reason);result={ok:true,message:"Brand closed"};});return result;};
  const reassignCall=(taskId:string,callerId:string,date?:string):Result=>{let result:Result={ok:false,message:"Call task not found"};mutate(d=>{const t=d.callTasks.find(t=>t.id===taskId);if(!t)return;const previous=t.callerId;t.callerId=callerId;if(date)t.scheduledDate=date;addAudit(d,"Call task reassigned",t.customerId,previous,callerId);result={ok:true,message:"Call reassigned"};});return result;};
  const updateCallerCapacity=(callerId:string,capacity:number):Result=>{mutate(d=>{const u=d.users.find(u=>u.id===callerId&&u.role==="Caller");if(u){const previous=u.dailyCapacity;u.dailyCapacity=Math.max(1,Math.min(100,capacity));addAudit(d,"Caller capacity changed",undefined,String(previous),String(u.dailyCapacity));}});return{ok:true,message:"Capacity updated"};};

  const saveBomb=(bomb:BombTemplate):Result=>{mutate(d=>{const index=d.bombs.findIndex(b=>b.id===bomb.id);d.bombs[index]={...bomb,version:bomb.status==="Active"?bomb.version+1:bomb.version,updatedAt:d.simulatedDate};addAudit(d,"Bomb template edited",undefined,`V${bomb.version}`,`V${d.bombs[index].version}`);});return{ok:true,message:"Bomb version saved"};};
  const createBomb=(bomb:Omit<BombTemplate,"id"|"version"|"launches"|"updatedAt">):Result=>{let id="";mutate(d=>{id=uid("b");d.bombs.unshift({...bomb,id,version:1,launches:0,updatedAt:d.simulatedDate});addAudit(d,"Bomb template created",undefined,undefined,bomb.name);});return{ok:true,message:"Bomb created",id};};
  const setBombStatus=(bombId:string,status:BombTemplate["status"]):Result=>{mutate(d=>{const b=d.bombs.find(b=>b.id===bombId);if(b){const prev=b.status;b.status=status;b.updatedAt=d.simulatedDate;addAudit(d,"Bomb status changed",undefined,prev,status);}});return{ok:true,message:`Bomb ${status.toLowerCase()}`};};
  const updateCPStage=(stage:CPStage):Result=>{mutate(d=>{const i=d.cps.findIndex(c=>c.code===stage.code);d.cps[i]=stage;addAudit(d,"CP workflow edited",undefined,stage.code,stage.name);});return{ok:true,message:`${stage.code} updated`};};
  const updateIntegration=(channel:Channel,status:"Connected"|"Needs Attention"|"Disconnected"):Result=>{mutate(d=>{const x=d.integrations.find(i=>i.channel===channel);if(x){const prev=x.status;x.status=status;addAudit(d,"Channel integration changed",undefined,`${channel}: ${prev}`,status);}});return{ok:true,message:`${channel} ${status.toLowerCase()}`};};
  const fillTodayCapacity=()=>mutate(d=>{const callers=d.users.filter(u=>u.role==="Caller");callers.forEach(caller=>{const count=d.callTasks.filter(t=>t.callerId===caller.id&&dateOnly(t.scheduledDate)===dateOnly(d.simulatedDate)&&t.status!=="Cancelled").length;for(let i=count;i<(caller.dailyCapacity||6);i++){const c=d.customers[i%d.customers.length];const contact=c.contacts.find(x=>x.phoneValid&&x.phone);if(contact)d.callTasks.push({id:uid("call"),customerId:c.id,contactId:contact.id,callerId:caller.id,scheduledDate:d.simulatedDate,priority:"Normal",goal:"Follow-up call",script:"Follow up with the KeyPerson.",status:"Scheduled"});}});addAudit(d,"Today call capacity filled");});
  const simulateFailure=()=>mutate(d=>{const action=d.actions.find(a=>a.status==="Scheduled"&&a.channel!=="Phone");if(action){action.status="Failed";action.note="Provider rejected the send";d.interactions.unshift({id:uid("int"),customerId:action.customerId,type:"System",title:`${action.channel} action failed`,content:action.note,createdAt:d.simulatedDate});addAudit(d,"Channel action failed",action.customerId,action.channel,"Failed");}});

  const value:Store={state,hydrated,can,reset,setRole,advanceDay,launchBomb,receiveReply,sendHumanReply,submitCallResult,changeCP,createFollowUp,resolveInbox,pauseBrand,assignBrand,createCallTask,createBrand,importBrands,updateContact,closeBrand,reassignCall,updateCallerCapacity,saveBomb,createBomb,setBombStatus,updateCPStage,updateIntegration,fillTodayCapacity,simulateFailure};
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(){const context=useContext(WorkspaceContext);if(!context)throw new Error("useWorkspace must be used inside WorkspaceProvider");return context;}
