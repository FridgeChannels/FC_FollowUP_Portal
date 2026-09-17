import type { QuoCallData } from "./quo/types";

export type Role = "Admin" | "AccountManager" | "Caller";
export type Channel = "Email" | "SMS" | "WhatsApp" | "LinkedIn" | "Phone";
export type NumericCPCode = "CP1" | "CP2" | "CP3" | "CP4" | "CP5" | "CP6";
export type CPCode = "NONE" | NumericCPCode | "Nurture";
export const CP_CODES: NumericCPCode[] = ["CP1", "CP2", "CP3", "CP4", "CP5", "CP6"];

export function interactionCpCode(value?: string | null): NumericCPCode | null {
  const raw = (value || "").trim().toUpperCase();
  if (/^CP[1-6]$/.test(raw)) return raw as NumericCPCode;
  const match = raw.match(/^CP([1-6])/);
  return match ? (`CP${match[1]}` as NumericCPCode) : null;
}
export type CustomerStatus = "Ready" | "Bomb Running" | "Waiting for Reply" | "Human Handling" | "Paused" | "Closed";
export type ActionStatus = "Scheduled" | "Sending" | "Sent" | "Delivered" | "Failed" | "Cancelled" | "Skipped" | "Completed";
export type CallOutcome = "Contact Responded" | "Connected — No Useful Response" | "No Answer" | "Voicemail" | "Call Back Requested" | "Wrong Number" | "Wrong Contact" | "Other";

export type Contact = {
  id: string; name: string; role: "Connector" | "Owner" | "Other"; title?: string; contactRole?: string;
  email?: string; phone?: string; whatsapp?: string; linkedin?: string; preferredChannel: Channel; emailValid: boolean; phoneValid: boolean;
};
export type Customer = {
  id: string; name: string; initials: string; cp: CPCode; status: CustomerStatus; source: string;
  ownerId?: string; contacts: Contact[]; activeBombId?: string; closedReason?: string; partnershipContext?: { headline: string; summary: string; signals: string[]; updatedAt: string }; createdAt: string; updatedAt: string;
};
export type BombStep = { id: string; channel: Channel; delayDays: number; subject?: string; content: string; callGoal?: string; script?: string };
export type BombCustomVariable = { id: string; key: string; label: string; defaultValue: string };
export type Scenario = {
  id: string; name: string; cp: CPCode; description: string;
};
export type BombTemplate = {
  id: string; name: string; cp: CPCode; goal: string; targetRole: Contact["role"]; priority: "Urgent" | "High" | "Normal" | "Low";
  status: "Active" | "Draft" | "Inactive" | "Archived"; version: number; steps: BombStep[]; customVariables?: BombCustomVariable[]; launches: number; updatedAt: string;
  scenarioId?: string;
};
export type BombInstance = {
  id: string; customerId: string; templateId: string; templateName: string; version: number; goal: string;
  targetContactId: string; cp?: CPCode; status: "Running" | "Paused" | "Completed" | "Stopped" | "Cancelled"; startedAt: string; stoppedAt?: string; stopReason?: string;
};
export type ScheduledAction = {
  id: string; bombInstanceId: string; customerId: string; stepId: string; channel: Channel; plannedDate: string;
  actualDate: string; status: ActionStatus; content: string; note?: string; callTaskId?: string;
};
export type Interaction = {
  id: string; customerId: string; contactId?: string; bombInstanceId?: string; cp?: CPCode; type: "Message" | "Phone" | "Bomb" | "CP" | "Follow-up" | "Human" | "System";
  channel?: Channel; direction?: "Inbound" | "Outbound"; title: string; content: string; createdAt: string; outcome?: CallOutcome; recording?: string;
  /** Notion page created_time; preferred for feed ordering/display. */
  recordedAt?: string;
  creationMethod?: "Automated" | "Manual"; threadId?: string; taskId?: string; replyStatus?: "Needs Reply" | "Replied";
  taskStatus?: string; scheduledAt?: string; callResult?: string;
  quo?: QuoCallData | null;
};

/**
 * Feed sort key.
 * Inbound: prefer actual occurrence (Interaction At / created_time) — never the parent
 * task's Scheduled At, or replies sort as if they happened at send time.
 * Outbound / other: Scheduled At first (pending sends), then recorded/created.
 */
export function interactionSortAt(
  item: Pick<Interaction, "scheduledAt" | "recordedAt" | "createdAt" | "id" | "direction">,
) {
  if (item.direction === "Inbound") {
    return item.recordedAt || item.createdAt || item.scheduledAt || "";
  }
  return item.scheduledAt || item.recordedAt || item.createdAt || "";
}

/** Card timestamp: Notion page created_time only. */
/** Conversation card corner time: Notion page created_time only. */
export function interactionPageAt(item: Pick<Interaction, "createdAt">) {
  return item.createdAt || "";
}
export type InboxItem = {
  id: string; customerId: string; contactId?: string; type: "Reply";
  status: "Needs Reply" | "Waiting for Reply" | "Follow-up Scheduled" | "Resolved"; ownerId?: string; createdAt: string; updatedAt: string; preview: string;
};
export type FollowUp = { id: string; customerId: string; inboxItemId?: string; dueAt: string; reason: string; note?: string; suggestedAction?: string; status: "Scheduled" | "Due" | "Completed" | "Cancelled" };
export type CallTask = {
  id: string; customerId: string; contactId: string; bombInstanceId?: string; scheduledActionId?: string; callerId: string;
  scheduledDate: string; priority: "Urgent" | "High" | "Normal" | "Low"; goal: string; script: string;
  status: "Scheduled" | "In Progress" | "Completed" | "Cancelled"; outcome?: CallOutcome; responseSummary?: string; recordingStatus?: "Attached" | "Upload manually" | "Unavailable";
};
export type AuditEntry = { id: string; actorId: string; customerId?: string; action: string; previousValue?: string; newValue?: string; createdAt: string };
export type User = { id: string; name: string; initials: string; role: Role; dailyCapacity?: number; workingDays?: number[] };
export type CPStage = { code: CPCode; name: string; goal: string; criteria: string; color: string };
export type ChannelIntegration = { channel: Channel; status: "Connected" | "Needs Attention" | "Disconnected"; account: string };

export type WorkspaceState = {
  version: number; simulatedDate: string; currentRole: Role; currentUserId: string;
  users: User[]; customers: Customer[]; bombs: BombTemplate[]; bombInstances: BombInstance[];
  actions: ScheduledAction[]; interactions: Interaction[]; inbox: InboxItem[]; followUps: FollowUp[];
  callTasks: CallTask[]; audit: AuditEntry[]; cps: CPStage[]; integrations: ChannelIntegration[];
  scenarios: Scenario[];
};

export const isCancelledTaskStatus = (status?: string | null) =>
  status === "Cancelled" || status === "Canceled";
export const isClosedTaskStatus = (status: string) =>
  ["Completed", "Resolved", "Failed"].includes(status) || isCancelledTaskStatus(status);
export const canSeeTask = (state: WorkspaceState, customerId: string, assigneeId?: string) => {
  if (state.currentRole === "Admin") return true;
  const customer = state.customers.find(item => item.id === customerId);
  return assigneeId === state.currentUserId || customer?.ownerId === state.currentUserId;
};
export const visibleOpenTaskCount = (state: WorkspaceState) => {
  const calls = state.callTasks.filter(task => !isClosedTaskStatus(task.status) && canSeeTask(state, task.customerId, task.callerId)).length;
  const replies = state.inbox.filter(item => !isClosedTaskStatus(item.status) && canSeeTask(state, item.customerId, item.ownerId)).length;
  return calls + replies;
};

export const roleCapabilities: Record<Role, string[]> = {
  Admin: ["dashboard","customers","tasks","inbox","calls","bombs","workflow","analytics","reply","launch","changeCP","editBrand","assignOwner","manageCalls","editBomb","editWorkflow","audit","importBrands"],
  "AccountManager": ["dashboard","customers","bombs","reply","launch","changeCP","editBrand","createCall","editBomb"],
  Caller: ["tasks","calls"],
};

export const normalizeRole = (value: unknown): Role => value === "Admin" || value === "Caller" || value === "AccountManager" ? value : "AccountManager";

const at = (day: string, time = "09:00:00") => `${day}T${time.length === 5 ? `${time}:00` : time}.000Z`;
export const addDays = (iso: string, days: number) => { const d = new Date(iso); d.setUTCDate(d.getUTCDate()+days); return d.toISOString(); };
export const dateOnly = (iso: string) => iso.slice(0,10);
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;

const contacts: Record<string, Contact[]> = {
  acme: [{id:"ct_acme_john",name:"John Smith",role:"Connector",email:"john@acme.co",phone:"+1 415 555 0182",whatsapp:"+1 415 555 0182",linkedin:"john-smith",preferredChannel:"WhatsApp",emailValid:true,phoneValid:true},{id:"ct_acme_mike",name:"Mike Evans",role:"Owner",email:"mike@acme.co",phone:"+1 415 555 0133",preferredChannel:"Email",emailValid:true,phoneValid:true}],
  northstar: [{id:"ct_north_maya",name:"Maya Brooks",role:"Owner",email:"maya@northstar.co",phone:"+1 312 555 0174",whatsapp:"+1 312 555 0174",preferredChannel:"Email",emailValid:true,phoneValid:true}],
  brightland: [{id:"ct_bright_neil",name:"Neil Patel",role:"Connector",email:"neil@brightland.io",phone:"+1 646 555 0198",preferredChannel:"SMS",emailValid:true,phoneValid:true}],
  goodkind: [{id:"ct_good_ana",name:"Ana Torres",role:"Other",email:"ana@goodkind.com",phone:"+1 213 555 0122",preferredChannel:"Email",emailValid:true,phoneValid:true}],
  olive: [{id:"ct_olive_liam",name:"Liam Carter",role:"Owner",email:"liam@oliveoak.co",phone:"+1 202 555 0166",linkedin:"liam-carter",preferredChannel:"LinkedIn",emailValid:true,phoneValid:true}],
  harbor: [{id:"ct_harbor_rachel",name:"Rachel Kim",role:"Connector",email:"rachel@harbor.house",phone:"+1 617 555 0104",preferredChannel:"Phone",emailValid:true,phoneValid:true}],
  kite: [{id:"ct_kite_emma",name:"Emma Wu",role:"Connector",email:"emma@kitekey.co",phone:"+1 206 555 0112",preferredChannel:"Email",emailValid:true,phoneValid:true}],
  field: [{id:"ct_field_sam",name:"Sam Lewis",role:"Owner",email:"sam@fieldtheory.co",phone:"+1 512 555 0148",preferredChannel:"SMS",emailValid:true,phoneValid:true}],
};

export function createSeedState(): WorkspaceState {
  const today = at("2026-09-11");
  const users: User[] = [
    {id:"u_sarah",name:"Sarah Chen",initials:"SC",role:"Admin"},
    {id:"u_mike",name:"Mike Ross",initials:"MR",role:"AccountManager"},
    {id:"u_alex",name:"Alex Morgan",initials:"AM",role:"Caller",dailyCapacity:6,workingDays:[1,2,3,4,5]},
    {id:"u_priya",name:"Priya Shah",initials:"PS",role:"Caller",dailyCapacity:6,workingDays:[1,2,3,4,5]},
    {id:"u_jordan",name:"Jordan Lee",initials:"JL",role:"Caller",dailyCapacity:6,workingDays:[1,2,3,4,5]},
  ];
  const customers: Customer[] = [
    {id:"c_acme",name:"Acme Foods",initials:"AF",cp:"CP1",status:"Human Handling",source:"Expo West 2026",ownerId:"u_sarah",contacts:contacts.acme,createdAt:addDays(today,-12),updatedAt:addDays(today,-0.02)},
    {id:"c_northstar",name:"Northstar Coffee",initials:"NC",cp:"CP2",status:"Bomb Running",source:"Natural Products Expo",ownerId:"u_sarah",contacts:contacts.northstar,activeBombId:"bi_north",createdAt:addDays(today,-18),updatedAt:addDays(today,-0.08)},
    {id:"c_brightland",name:"Brightland Labs",initials:"BL",cp:"CP1",status:"Human Handling",source:"Inbound",ownerId:"u_mike",contacts:contacts.brightland,createdAt:addDays(today,-21),updatedAt:addDays(today,-3)},
    {id:"c_goodkind",name:"Goodkind Market",initials:"GM",cp:"CP1",status:"Ready",source:"Expo West 2026",contacts:contacts.goodkind,createdAt:addDays(today,-1),updatedAt:addDays(today,-0.15)},
    {id:"c_olive",name:"Olive & Oak",initials:"OO",cp:"CP2",status:"Waiting for Reply",source:"Referral",ownerId:"u_mike",contacts:contacts.olive,activeBombId:"bi_olive",createdAt:addDays(today,-30),updatedAt:addDays(today,-0.25)},
    {id:"c_harbor",name:"Harbor House",initials:"HH",cp:"CP1",status:"Paused",source:"Expo West 2026",ownerId:"u_sarah",contacts:contacts.harbor,activeBombId:"bi_harbor",createdAt:addDays(today,-16),updatedAt:addDays(today,-1)},
    {id:"c_kite",name:"Kite & Key",initials:"KK",cp:"CP1",status:"Human Handling",source:"Inbound",ownerId:"u_sarah",contacts:contacts.kite,createdAt:addDays(today,-7),updatedAt:addDays(today,-0.18)},
    {id:"c_field",name:"Field Theory",initials:"FT",cp:"CP2",status:"Waiting for Reply",source:"Referral",ownerId:"u_mike",contacts:contacts.field,createdAt:addDays(today,-25),updatedAt:addDays(today,-1)},
    {id:"c_sunridge",name:"Sunridge Pantry",initials:"SP",cp:"CP1",status:"Human Handling",source:"Trade show follow-up",ownerId:"u_sarah",contacts:[{id:"ct_sunridge_olivia",name:"Olivia Grant",role:"Owner",email:"olivia@sunridgepantry.com",phone:"+1 303 555 0118",whatsapp:"+1 303 555 0118",linkedin:"olivia-grant",preferredChannel:"Email",emailValid:true,phoneValid:true}],createdAt:addDays(today,-6),updatedAt:addDays(today,-0.04)},
    {id:"c_moss",name:"Moss & Mill",initials:"MM",cp:"CP1",status:"Human Handling",source:"Inbound",ownerId:"u_mike",contacts:[{id:"ct_moss_daniel",name:"Daniel Reed",role:"Connector",email:"daniel@mossmill.co",phone:"+1 415 555 0191",preferredChannel:"Email",emailValid:true,phoneValid:true}],createdAt:addDays(today,-9),updatedAt:addDays(today,-0.12)},
    {id:"c_wildgrain",name:"Wildgrain Collective",initials:"WC",cp:"CP2",status:"Human Handling",source:"Referral",ownerId:"u_sarah",contacts:[{id:"ct_wildgrain_nora",name:"Nora Ellis",role:"Owner",email:"nora@wildgrain.co",phone:"+1 206 555 0164",whatsapp:"+1 206 555 0164",preferredChannel:"WhatsApp",emailValid:true,phoneValid:true}],createdAt:addDays(today,-11),updatedAt:addDays(today,-0.22)},
    {id:"c_cedar",name:"Cedar & Salt",initials:"CS",cp:"CP3",status:"Human Handling",source:"Website",ownerId:"u_mike",contacts:[{id:"ct_cedar_jamie",name:"Jamie Park",role:"Other",email:"jamie@cedarandsalt.com",phone:"+1 617 555 0186",linkedin:"jamie-park",preferredChannel:"LinkedIn",emailValid:true,phoneValid:true}],partnershipContext:{headline:"Cedar & Salt is ready for partnership handoff",summary:"The partnership is qualified for an FC handoff after the team aligned on pilot scope, decision makers, and timing.",signals:["Jamie confirmed the final Owner and operating sponsor.","The team completed the FC Magnet review and requested a pilot plan.","Pilot scope: retention workflow for the spring product launch."],updatedAt:today},createdAt:addDays(today,-4),updatedAt:addDays(today,-0.08)},
    {id:"c_lumen",name:"Lumen Goods",initials:"LG",cp:"CP2",status:"Closed",source:"Inbound",ownerId:"u_sarah",closedReason:"Owner declined the pilot",contacts:[{id:"ct_lumen_ava",name:"Ava Cole",role:"Owner",email:"ava@lumengoods.co",phone:"+1 303 555 0144",preferredChannel:"Email",emailValid:true,phoneValid:true}],createdAt:addDays(today,-40),updatedAt:addDays(today,-8)},
    {id:"c_pine",name:"Pine & Petal",initials:"PP",cp:"CP1",status:"Ready",source:"Website",contacts:[{id:"ct_pine_iris",name:"Iris Bell",role:"Other",email:"iris@pineandpetal.co",preferredChannel:"Email",emailValid:true,phoneValid:true}],createdAt:addDays(today,-2),updatedAt:addDays(today,-0.3)},
  ];
  const bombs: BombTemplate[] = [
    {id:"b_initial",name:"Initial Connector Outreach",cp:"CP1",scenarioId:"sc_find_connector",goal:"Identify and reach the right Connector",targetRole:"Other",priority:"Normal",status:"Active",version:2,launches:63,updatedAt:addDays(today,-5),steps:[{id:"s_i1",channel:"Email",delayDays:0,subject:"Quick question about your team",content:"Hi {{first_name}}, who owns retention and lifecycle at {{brand.name}}?"},{id:"s_i2",channel:"LinkedIn",delayDays:1,content:"Hi {{first_name}} — quick question about the right owner at {{brand.name}}."},{id:"s_i3",channel:"Phone",delayDays:1,content:"",callGoal:"Identify the Owner",script:"Ask who owns lifecycle and retention."}]},
    {id:"b_delivery",name:"Confirm Magnet Delivery",cp:"CP1",scenarioId:"sc_confirm_delivery",goal:"Confirm the FC Magnet reached the Owner",targetRole:"Connector",priority:"High",status:"Active",version:3,launches:184,updatedAt:addDays(today,-2),steps:[{id:"s_d1",channel:"Email",delayDays:0,subject:"Did the Magnet make it to {{owner.first_name}}?",content:"Hi {{first_name}}, did the FC Magnet make it to {{owner.first_name}}?"},{id:"s_d2",channel:"Phone",delayDays:1,content:"",callGoal:"Confirm Magnet delivery",script:"Confirm whether the Magnet reached the Owner."},{id:"s_d3",channel:"SMS",delayDays:1,content:"Quick check — did the FC Magnet arrive?"},{id:"s_d4",channel:"WhatsApp",delayDays:2,content:"Hi {{first_name}}, just checking that the FC Magnet reached the right person."},{id:"s_d5",channel:"LinkedIn",delayDays:2,content:"Following up on the FC Magnet delivery."}]},
    {id:"b_owner",name:"Owner Meeting",cp:"CP2",scenarioId:"sc_setup_form",goal:"Complete the key form and book a review",targetRole:"Owner",priority:"High",status:"Active",version:4,launches:92,updatedAt:addDays(today,-1),steps:[{id:"s_o1",channel:"Email",delayDays:0,subject:"Your FC setup",content:"Hi {{first_name}}, here is the short setup form."},{id:"s_o2",channel:"Phone",delayDays:1,content:"",callGoal:"Book a product review",script:"Confirm receipt and offer review times."},{id:"s_o3",channel:"WhatsApp",delayDays:1,content:"Would one of these review times work?"},{id:"s_o4",channel:"Email",delayDays:2,subject:"Review times",content:"Following up with two review options."}]},
    {id:"b_reengage",name:"Re-engage Owner",cp:"CP2",scenarioId:"sc_reengage_owner",goal:"Restart a stalled Owner conversation",targetRole:"Owner",priority:"Normal",status:"Inactive",version:1,launches:37,updatedAt:addDays(today,-14),steps:[{id:"s_r1",channel:"Email",delayDays:0,subject:"Still useful?",content:"Should we keep this open?"},{id:"s_r2",channel:"Phone",delayDays:2,content:"",callGoal:"Confirm interest",script:"Ask whether timing has changed."}]},
  ];
  const bombInstances: BombInstance[] = [
    {id:"bi_north",customerId:"c_northstar",templateId:"b_owner",templateName:"Owner Meeting",version:4,goal:"Complete the key form and book a review",targetContactId:"ct_north_maya",status:"Running",startedAt:addDays(today,-1)},
    {id:"bi_olive",customerId:"c_olive",templateId:"b_reengage",templateName:"Re-engage Owner",version:1,goal:"Restart a stalled Owner conversation",targetContactId:"ct_olive_liam",status:"Running",startedAt:addDays(today,-3)},
    {id:"bi_harbor",customerId:"c_harbor",templateId:"b_delivery",templateName:"Confirm Magnet Delivery",version:3,goal:"Confirm the FC Magnet reached the Owner",targetContactId:"ct_harbor_rachel",status:"Paused",startedAt:addDays(today,-2)},
  ];
  const actions: ScheduledAction[] = [
    {id:"a_n1",bombInstanceId:"bi_north",customerId:"c_northstar",stepId:"s_o1",channel:"Email",plannedDate:addDays(today,-1),actualDate:addDays(today,-1),status:"Delivered",content:"Hi Maya, here is the short setup form."},
    {id:"a_n2",bombInstanceId:"bi_north",customerId:"c_northstar",stepId:"s_o2",channel:"Phone",plannedDate:today,actualDate:today,status:"Scheduled",content:"",callTaskId:"call_north"},
    {id:"a_n3",bombInstanceId:"bi_north",customerId:"c_northstar",stepId:"s_o3",channel:"WhatsApp",plannedDate:addDays(today,1),actualDate:addDays(today,1),status:"Scheduled",content:"Would one of these review times work?"},
    {id:"a_o1",bombInstanceId:"bi_olive",customerId:"c_olive",stepId:"s_r1",channel:"Email",plannedDate:addDays(today,-3),actualDate:addDays(today,-3),status:"Delivered",content:"Should we keep this open?"},
    {id:"a_o2",bombInstanceId:"bi_olive",customerId:"c_olive",stepId:"s_r2",channel:"Phone",plannedDate:addDays(today,-1),actualDate:addDays(today,-1),status:"Completed",content:"",callTaskId:"call_olive"},
  ];
  const interactions: Interaction[] = [
    {id:"int_acme_reply",customerId:"c_acme",contactId:"ct_acme_john",type:"Message",channel:"WhatsApp",direction:"Inbound",title:"WhatsApp · Contact → FC",content:"Yes, I handed the FC Magnet to Mike yesterday afternoon. He has it on his desk now. Mike asked me to send him the setup link as well, so please use mike@acme.co for anything that needs his direct response.",createdAt:at("2026-09-11","08:41:27")},
    {id:"int_acme_stop",customerId:"c_acme",type:"Bomb",title:"OmniReach stopped automatically",content:"John Smith replied via WhatsApp. Four future actions were cancelled and one reserved phone slot was released.",createdAt:at("2026-09-11","08:41:29")},
    {id:"int_acme_owner_email",customerId:"c_acme",contactId:"ct_acme_mike",type:"Message",channel:"Email",direction:"Outbound",title:"Email · FC → Contact",content:"Subject: Your FC Magnet setup link\n\nHi Mike,\n\nJohn mentioned that the FC Magnet reached you yesterday. Here is the short setup link he requested: https://example.com/fc-setup\n\nIf anything is unclear, reply directly to this email and our team will help.\n\nBest,\nSarah",createdAt:at("2026-09-10","16:08:42")},
    {id:"int_acme_call",customerId:"c_acme",contactId:"ct_acme_john",type:"Phone",channel:"Phone",direction:"Outbound",title:"Phone · No Answer",content:"Caller: Alex Morgan\nDialed: +1 415 555 0182\nDuration: 00:24\nResult: The call rang four times and then disconnected. No voicemail message was left.",outcome:"No Answer",createdAt:at("2026-09-10","15:16:09")},
    {id:"int_acme_linkedin",customerId:"c_acme",contactId:"ct_acme_john",type:"Message",channel:"LinkedIn",direction:"Inbound",title:"LinkedIn · Contact → FC",content:"Hi Sarah — I saw your note. I am checking with Mike this afternoon and will confirm once the package is in his hands.",createdAt:at("2026-09-09","11:27:55")},
    {id:"int_acme_email",customerId:"c_acme",contactId:"ct_acme_john",type:"Message",channel:"Email",direction:"Outbound",title:"Email · FC → Contact",content:"Subject: Did the FC Magnet make it to Mike?\n\nHi John,\n\nI wanted to check whether the FC Magnet reached Mike. If it has, could you confirm when it was handed over? If not, I can help arrange another delivery.\n\nThanks,\nSarah",createdAt:at("2026-09-09","09:00:12")},
    {id:"int_n_bomb",customerId:"c_northstar",contactId:"ct_north_maya",bombInstanceId:"bi_north",type:"Bomb",title:"OmniReach started",content:"Owner Meeting · Version 4",createdAt:addDays(today,-1)},
    {id:"int_n_email",customerId:"c_northstar",contactId:"ct_north_maya",type:"Message",channel:"Email",direction:"Outbound",title:"Email · FC → Contact",content:"Subject: Your FC setup\n\nHi Maya,\n\nHere is the short setup form we discussed: https://example.com/northstar-setup\n\nOnce it is complete, reply here and I will send two review times.\n\nBest,\nSarah",createdAt:at("2026-09-10","09:04:18")},
    {id:"int_kite_reply",customerId:"c_kite",contactId:"ct_kite_emma",type:"Message",channel:"Email",direction:"Inbound",title:"Email · Contact → FC",content:"Hi Sarah,\n\nCould you send me more details about how this works, including the expected setup time and what information our team needs to provide? I can review it with our operations lead tomorrow morning.\n\nThanks,\nEmma",createdAt:at("2026-09-11","05:00:44")},
    {id:"int_sunridge_reply",customerId:"c_sunridge",contactId:"ct_sunridge_olivia",type:"Message",channel:"Email",direction:"Inbound",title:"Email · Contact → FC",content:"Hi Sarah,\n\nThanks for sending the FC Magnet details. We are interested, but I want to understand the setup effort and timeline before I loop in our operations lead. Could you send the short overview and two times for a call?\n\nBest,\nOlivia",createdAt:at("2026-09-11","07:52:18")},
    {id:"int_sunridge_out",customerId:"c_sunridge",contactId:"ct_sunridge_olivia",type:"Message",channel:"Email",direction:"Outbound",title:"Email · FC → Contact",content:"Subject: Re: FC Magnet setup\n\nHi Olivia,\n\nAbsolutely. I can send a one-page overview and walk through the setup in 20 minutes. Would Tuesday at 10:00 AM or Wednesday at 2:00 PM work?\n\nBest,\nSarah",createdAt:at("2026-09-11","08:10:04")},
    {id:"int_moss_reply",customerId:"c_moss",contactId:"ct_moss_daniel",type:"Message",channel:"Email",direction:"Inbound",title:"Email · Contact → FC",content:"Hi Mike,\n\nI am the right person for the initial review. Please resend the setup link and include what information you need from our team.\n\nThanks,\nDaniel",createdAt:at("2026-09-11","06:38:42")},
    {id:"int_wildgrain_reply",customerId:"c_wildgrain",contactId:"ct_wildgrain_nora",type:"Message",channel:"WhatsApp",direction:"Inbound",title:"WhatsApp · Contact → FC",content:"The Magnet arrived. I can review the form this afternoon, but I may have questions about the data fields. Can someone from FC be available tomorrow?",createdAt:at("2026-09-11","08:02:11")},
    {id:"int_cedar_linkedin",customerId:"c_cedar",contactId:"ct_cedar_jamie",type:"Message",channel:"LinkedIn",direction:"Inbound",title:"LinkedIn · Contact → FC",content:"Hi Mike — I saw the note from your team. Could you share a short example of the workflow before we book time?",createdAt:at("2026-09-11","04:18:33")},
  ];
  const inbox: InboxItem[] = [
    {id:"in_acme",customerId:"c_acme",contactId:"ct_acme_john",type:"Reply",status:"Needs Reply",ownerId:"u_sarah",createdAt:at("2026-09-11","08:41"),updatedAt:at("2026-09-11","08:41"),preview:"Yes, I gave it to Mike yesterday."},
    {id:"in_bright",customerId:"c_brightland",contactId:"ct_bright_neil",type:"Reply",status:"Follow-up Scheduled",ownerId:"u_mike",createdAt:addDays(today,-3),updatedAt:addDays(today,-0.1),preview:"Follow-up overdue by 2 hours"},
    {id:"in_kite",customerId:"c_kite",contactId:"ct_kite_emma",type:"Reply",status:"Needs Reply",ownerId:"u_sarah",createdAt:at("2026-09-11","05:00"),updatedAt:at("2026-09-11","05:00"),preview:"Could you send me more details?"},
    {id:"in_field",customerId:"c_field",contactId:"ct_field_sam",type:"Reply",status:"Waiting for Reply",ownerId:"u_mike",createdAt:addDays(today,-2),updatedAt:addDays(today,-1),preview:"Tuesday afternoon works for me."},
    {id:"in_sunridge",customerId:"c_sunridge",contactId:"ct_sunridge_olivia",type:"Reply",status:"Needs Reply",ownerId:"u_sarah",createdAt:at("2026-09-11","07:52"),updatedAt:at("2026-09-11","07:52"),preview:"Interested, but needs setup timeline and call times."},
    {id:"in_moss",customerId:"c_moss",contactId:"ct_moss_daniel",type:"Reply",status:"Needs Reply",ownerId:"u_mike",createdAt:at("2026-09-11","06:38"),updatedAt:at("2026-09-11","06:38"),preview:"Please resend the setup link and requirements."},
    {id:"in_wildgrain",customerId:"c_wildgrain",contactId:"ct_wildgrain_nora",type:"Reply",status:"Follow-up Scheduled",ownerId:"u_sarah",createdAt:at("2026-09-11","08:02"),updatedAt:at("2026-09-11","08:20"),preview:"Magnet arrived; questions about the form."},
    {id:"in_cedar",customerId:"c_cedar",contactId:"ct_cedar_jamie",type:"Reply",status:"Needs Reply",ownerId:"u_mike",createdAt:at("2026-09-11","04:18"),updatedAt:at("2026-09-11","04:18"),preview:"Wants a workflow example before booking."},
  ];
  const followUps: FollowUp[] = [{id:"fu_bright",customerId:"c_brightland",inboxItemId:"in_bright",dueAt:at("2026-09-11","07:00"),reason:"No response after SMS",note:"Try Email or create a Call Task",suggestedAction:"Reply",status:"Due"}];
  const callTasks: CallTask[] = [
    {id:"call_north",customerId:"c_northstar",contactId:"ct_north_maya",bombInstanceId:"bi_north",scheduledActionId:"a_n2",callerId:"u_alex",scheduledDate:today,priority:"Urgent",goal:"Book a product review",script:"Confirm receipt and offer review times.",status:"Scheduled"},
    {id:"call_morrow",customerId:"c_goodkind",contactId:"ct_good_ana",callerId:"u_alex",scheduledDate:today,priority:"High",goal:"Identify decision maker",script:"Ask who owns lifecycle and retention.",status:"Scheduled"},
    {id:"call_juniper",customerId:"c_kite",contactId:"ct_kite_emma",callerId:"u_priya",scheduledDate:today,priority:"High",goal:"Confirm pilot interest",script:"Ask whether a short pilot is relevant.",status:"Scheduled"},
    {id:"call_sunday",customerId:"c_harbor",contactId:"ct_harbor_rachel",callerId:"u_jordan",scheduledDate:today,priority:"Normal",goal:"Confirm sample received",script:"Confirm delivery.",status:"Scheduled"},
    {id:"call_olive",customerId:"c_olive",contactId:"ct_olive_liam",bombInstanceId:"bi_olive",scheduledActionId:"a_o2",callerId:"u_alex",scheduledDate:addDays(today,-1),priority:"Normal",goal:"Confirm interest",script:"Ask whether timing has changed.",status:"Completed",outcome:"No Answer",recordingStatus:"Unavailable"},
  ];
  const cps: CPStage[] = [
    {code:"NONE",name:"Not Started",goal:"Not Started",criteria:"No checkpoint has been completed yet.",color:"slate"},
    {code:"CP1",name:"Post-Tap Brand Experience Delivered",goal:"Post-Tap Brand Experience Delivered",criteria:"The customized post-tap brand experience has been completed and is ready for the client to tap and experience at any time.\nThe brand's internal team has received the physical FC product.",color:"violet"},
    {code:"CP2",name:"Sample Delivered to Owner",goal:"Sample Delivered to Owner",criteria:"The correct Owner has been identified.\nThe Owner has personally confirmed receipt of the sample.\nThe Owner's contact information across all five OmniReach channels has been collected as completely as possible.",color:"blue"},
    {code:"CP3",name:"Owner Input & Plan Review Completed",goal:"Owner Input & Plan Review Completed",criteria:"The Owner has submitted the required information through the form, and the FC Activation Plan Review Meeting has been scheduled.\nThe FC Activation Plan has been completed.\nThe FC Activation Plan Review Meeting has been completed in full with the Owner.",color:"emerald"},
    {code:"CP4",name:"Plan Confirmed & Paid",goal:"Plan Confirmed & Paid",criteria:"The current plan has been confirmed.\nPayment has been received or successfully confirmed by the finance team.",color:"amber"},
    {code:"CP5",name:"Fulfillment Delivered",goal:"Fulfillment Delivered",criteria:"The physical product design has been completed.\nThe client has approved the final design.\nProduction has been completed.\nThe technical setup has been completed and successfully tested.\nDistribution preparations have been completed.\nThe product has been delivered.",color:"sky"},
    {code:"CP6",name:"Scale",goal:"Scale",criteria:"Measurement and performance review have been completed.\nThe expanded scope has been confirmed.\nPayment for the expanded scope has been completed.",color:"rose"},
    {code:"Nurture",name:"Nurture",goal:"Nurture",criteria:"The brand has been internally assessed and confirmed by FC as a fit for the FC3.0 ICP.\nThe partnership is temporarily on hold due to insufficient budget, a lack of strategic alignment, timing constraints, low internal priority, or similar reasons.\nThe reason for pausing has been documented.\nThe date of the next follow-up has been recorded.",color:"slate"},
  ];
  const integrations: ChannelIntegration[] = [
    {channel:"Email",status:"Connected",account:"sales@fridgechannel.com"},{channel:"SMS",status:"Connected",account:"+1 415 555 0100"},{channel:"WhatsApp",status:"Needs Attention",account:"FC Outreach"},{channel:"LinkedIn",status:"Disconnected",account:"No account"},{channel:"Phone",status:"Connected",account:"Quo workspace"},
  ];
  const scenarios: Scenario[] = [
    {id:"sc_find_connector",name:"Find the Connector",cp:"CP1",description:"Identify who can route the FC Magnet inside the brand."},
    {id:"sc_confirm_delivery",name:"Confirm Magnet delivery",cp:"CP1",description:"Confirm the Magnet reached the Owner."},
    {id:"sc_sample_owner",name:"Sample with Owner",cp:"CP2",description:"The Owner has the sample and needs a review booked."},
    {id:"sc_setup_form",name:"Complete setup form",cp:"CP2",description:"Get the Owner to finish the key setup form."},
    {id:"sc_reengage_owner",name:"Re-engage stalled Owner",cp:"CP2",description:"Restart a quiet Owner conversation."},
    {id:"sc_owner_input",name:"Collect Owner input",cp:"CP3",description:"Capture remaining Owner answers to close the loop."},
    {id:"sc_partnership_review",name:"Partnership review",cp:"CP3",description:"Review partnership context and the next commercial step."},
  ];
  const audit: AuditEntry[] = [
    {id:"au1",actorId:"system",customerId:"c_acme",action:"OmniReach stopped on contact response",previousValue:"OmniReach Running",newValue:"Human Handling",createdAt:at("2026-09-11","08:41:29")},
    {id:"au2",actorId:"u_sarah",customerId:"c_northstar",action:"OmniReach launched",newValue:"Owner Meeting V4",createdAt:addDays(today,-1)},
    {id:"au3",actorId:"u_mike",customerId:"c_brightland",action:"Follow-up created",newValue:"Sep 11, 7:00 AM",createdAt:addDays(today,-3)},
  ];
  return {version:4,simulatedDate:today,currentRole:"Admin",currentUserId:"u_sarah",users,customers,bombs,bombInstances,actions,interactions,inbox,followUps,callTasks,audit,cps,integrations,scenarios};
}
