import type { BrandActivity, BrandContact, BrandDetail, BrandTask } from "./brand-list";
import { getMockCallerTaskEmails } from "./notion/config";
import type { QuoCall, QuoCallData } from "./quo/types";

type MockCallerTaskRecord = {
  task: BrandTask;
  brand: BrandDetail;
  activities: BrandActivity[];
  callerEmail: string;
  lastQuoDialAttemptAt?: string;
};

const records = new Map<string, MockCallerTaskRecord>();

function contact(input: {
  id: string;
  name: string;
  phone: string;
  email: string;
}): BrandContact {
  return {
    id: input.id,
    name: input.name,
    role: "Owner",
    title: "Key contact",
    contactRole: "Owner",
    email: input.email,
    phone: input.phone,
    linkedin: null,
    emailValid: true,
    phoneValid: true,
    followupStatus: null,
    followupMode: "Human",
    contactOrder: null,
    notes: null,
    lastInteractionAt: null,
  };
}

function createRecord(input: {
  id: string;
  brandId: string;
  brandName: string;
  contact: BrandContact;
  scheduledAt: string;
  title: string;
  notes: string;
  callerEmail: string;
}) {
  const task: BrandTask = {
    id: input.id,
    title: input.title,
    contactId: input.contact.id,
    contactName: input.contact.name,
    brandId: input.brandId,
    brandName: input.brandName,
    brandOwnerId: null,
    ownerId: null,
    ownerName: null,
    channel: "Phone",
    status: "Pending",
    priority: "High",
    creationMethod: "Mock Caller Test",
    scheduledAt: input.scheduledAt,
    endedAt: null,
    notes: input.notes,
    conversationIds: [],
    templateId: null,
    sourceBombId: null,
    contactPhone: input.contact.phone,
    inboxStatus: null,
    preview: null,
    lastInboundAt: null,
  };
  const brand: BrandDetail = {
    id: input.brandId,
    name: input.brandName,
    initials: input.brandName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    currentCp: "CP1",
    currentCpId: null,
    status: "Ready",
    handlingMode: "Human",
    lastInteractionAt: null,
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    priority: "High",
    notes: "Local-only Caller test brand.",
    createdAt: input.scheduledAt,
    lastEditedAt: input.scheduledAt,
    currentCpFullName: "CP1",
    currentCpDefinition: "Local Caller test data",
    contacts: [input.contact],
    tasks: [task],
    activities: [],
  };
  records.set(input.id, { task, brand, activities: [], callerEmail: input.callerEmail });
}

function ensureRecords() {
  if (records.size) return;
  const callerEmails = getMockCallerTaskEmails();
  const callerEmail = callerEmails[0];
  if (!callerEmail) return;
  createRecord({
    id: "mock-call-beril-001",
    brandId: "mock-brand-aurora",
    brandName: "Aurora Pantry",
    contact: contact({ id: "mock-contact-aurora", name: "Maya Chen", phone: "+1 972 900 0833", email: "maya@aurorapantry.test" }),
    scheduledAt: "2026-09-14T09:00:00.000Z",
    title: "Confirm sample delivery",
    notes: "Confirm the FC Magnet arrived and ask who owns the next step.",
    callerEmail,
  });
  createRecord({
    id: "mock-call-beril-002",
    brandId: "mock-brand-bloom",
    brandName: "Bloom & Field",
    contact: contact({ id: "mock-contact-bloom", name: "Jordan Lee", phone: "+1 312 555 0177", email: "jordan@bloomfield.test" }),
    scheduledAt: "2026-09-14T11:30:00.000Z",
    title: "Identify the decision maker",
    notes: "Ask who owns retention and lifecycle at the brand.",
    callerEmail,
  });
  createRecord({
    id: "mock-call-beril-003",
    brandId: "mock-brand-canyon",
    brandName: "Canyon Coffee",
    contact: contact({ id: "mock-contact-canyon", name: "Noah Smith", phone: "+1 646 555 0144", email: "noah@canyoncoffee.test" }),
    scheduledAt: "2026-09-14T15:00:00.000Z",
    title: "Confirm pilot interest",
    notes: "Ask whether a short FC pilot is relevant this quarter.",
    callerEmail,
  });
}

function authorized(record: MockCallerTaskRecord, email: string, isAdmin: boolean) {
  return isAdmin || record.callerEmail === email.trim().toLowerCase();
}

function normalizePhone(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function phonesFor(call?: QuoCall | null) {
  return [call?.from, call?.to, ...(call?.participants || [])]
    .map(normalizePhone)
    .filter(Boolean);
}

function callResult(call?: QuoCall | null) {
  if (!call) return null;
  if (call.voicemail) return "Voicemail";
  if (call.answeredAt) return "Connected";
  if (call.status === "completed") return "No Answer";
  return null;
}

function callContent(data: QuoCallData) {
  const summary = data.summary?.summary?.filter(Boolean) || [];
  if (summary.length) return summary.join("\n");
  const voicemail = data.voicemail?.transcript || data.call?.voicemail?.transcript;
  if (voicemail) return `Voicemail transcript:\n${voicemail}`;
  if (data.transcript?.dialogue?.length) {
    return data.transcript.dialogue
      .map((line) => `${line.identifier || line.userId || "Speaker"}: ${line.content || ""}`)
      .join("\n");
  }
  const result = callResult(data.call);
  return result ? `Quo call ${result}` : "Quo call in progress";
}

function mergeQuoData(previous: QuoCallData | null | undefined, incoming: QuoCallData, eventType: string): QuoCallData {
  return {
    ...(previous || {}),
    ...incoming,
    callId: incoming.callId,
    call: incoming.call || previous?.call || null,
    recordings: incoming.recordings?.length ? incoming.recordings : previous?.recordings || [],
    transcript: incoming.transcript || previous?.transcript || null,
    summary: incoming.summary || previous?.summary || null,
    voicemail: incoming.voicemail || previous?.voicemail || null,
    eventTypes: [...new Set([...(previous?.eventTypes || []), ...(incoming.eventTypes || []), eventType])],
    lastEventAt: incoming.lastEventAt || previous?.lastEventAt || new Date().toISOString(),
  };
}

export function listMockCallerTasks(email?: string | null) {
  ensureRecords();
  const normalized = email?.trim().toLowerCase();
  return [...records.values()]
    .filter((record) => !normalized || record.callerEmail === normalized)
    .map((record) => record.task);
}

export function getMockCallerTask(id: string, email?: string | null, isAdmin = false) {
  ensureRecords();
  const record = records.get(id);
  if (!record || !email || !authorized(record, email, isAdmin)) return null;
  return record;
}

export function markMockCallerQuoDialAttempt(id: string, email: string, isAdmin = false) {
  const record = getMockCallerTask(id, email, isAdmin);
  if (!record) return null;
  record.lastQuoDialAttemptAt = new Date().toISOString();
  return record;
}

export function findMockCallerTaskForQuoCall(call: QuoCall) {
  ensureRecords();
  const phones = new Set(phonesFor(call));
  if (!phones.size) return null;
  const candidates = [...records.values()].filter((record) =>
    record.task.channel === "Phone" && phones.has(normalizePhone(record.task.contactPhone)),
  );
  if (!candidates.length) return null;
  const open = candidates.filter((record) => record.task.status === "Pending" || record.task.status === "In Progress");
  const pool = open.length ? open : candidates;
  const callTime = new Date(call.createdAt || call.completedAt || Date.now()).getTime();
  return [...pool].sort((left, right) => {
    const leftTime = Math.abs(new Date(left.task.scheduledAt || 0).getTime() - callTime);
    const rightTime = Math.abs(new Date(right.task.scheduledAt || 0).getTime() - callTime);
    return leftTime - rightTime;
  })[0] || null;
}

export function findMockCallerTaskForQuoCallId(callId: string) {
  ensureRecords();
  return [...records.values()].find((record) =>
    record.activities.some((activity) => activity.quo?.callId === callId),
  ) || null;
}

export function findMockCallerTaskForRecentQuoAttempt(eventAt?: string | null) {
  ensureRecords();
  const occurredAt = new Date(eventAt || Date.now()).getTime();
  const maxAge = 15 * 60 * 1000;
  const candidates = [...records.values()].filter((record) => {
    if (!record.lastQuoDialAttemptAt) return false;
    const attemptedAt = new Date(record.lastQuoDialAttemptAt).getTime();
    return Number.isFinite(attemptedAt)
      && Math.abs(occurredAt - attemptedAt) <= maxAge;
  });
  return candidates.sort((left, right) =>
    new Date(right.lastQuoDialAttemptAt || 0).getTime() - new Date(left.lastQuoDialAttemptAt || 0).getTime(),
  )[0] || null;
}

export function upsertMockQuoCallActivity(input: {
  record: MockCallerTaskRecord;
  data: QuoCallData;
  eventType: string;
}) {
  const { record, eventType } = input;
  const existing = record.activities.find((activity) => activity.quo?.callId === input.data.callId);
  const quo = mergeQuoData(existing?.quo, input.data, eventType);
  const result = callResult(quo.call);
  const occurredAt = quo.call?.completedAt || quo.call?.createdAt || quo.lastEventAt || new Date().toISOString();
  const activity: BrandActivity = {
    id: existing?.id || `mock-quo-${record.task.id}-${quo.callId}`,
    contactId: record.task.contactId,
    taskId: record.task.id,
    channel: "Phone",
    direction: "Outbound",
    status: quo.call?.status || (eventType === "call.ringing" ? "Ringing" : "Completed"),
    subject: result || (eventType === "call.ringing" ? "Ringing" : "Quo call"),
    content: callContent(quo),
    sender: "Quo",
    notes: `Quo Call ID: ${quo.callId}`,
    callResult: result,
    sourceUrl: quo.recordings?.[0]?.url || null,
    threadId: quo.call?.conversationId ? `QUO_CONVERSATION:${quo.call.conversationId}` : null,
    messageId: `QUO_CALL:${quo.callId}`,
    replyStatus: null,
    cpAtInteraction: "CP1",
    createdAt: occurredAt,
    quo,
  };
  if (existing) Object.assign(existing, activity);
  else record.activities.unshift(activity);
  record.brand.activities = record.activities;

  if (eventType === "call.ringing") record.task.status = "In Progress";
  if (eventType === "call.completed" && quo.call?.status === "completed") {
    record.task.status = "Completed";
    record.task.endedAt = quo.call.completedAt || occurredAt;
    record.task.notes = [record.task.notes, `Quo Call ID: ${quo.callId}`, result ? `Call result: ${result}.` : ""]
      .filter(Boolean)
      .join("\n");
  }
  return record;
}

export function updateMockCallerTask(
  id: string,
  email: string,
  patch: { status?: string; notes?: string },
  isAdmin = false,
) {
  const record = getMockCallerTask(id, email, isAdmin);
  if (!record) return null;
  if (patch.status) {
    record.task.status = patch.status;
    if (["Completed", "Failed", "Cancelled"].includes(patch.status)) {
      record.task.endedAt = new Date().toISOString();
    }
  }
  if (patch.notes?.trim()) record.task.notes = patch.notes.trim();
  return record;
}

export function completeMockCallerTask(
  id: string,
  email: string,
  outcome: string,
  summary?: string,
  isAdmin = false,
) {
  const record = getMockCallerTask(id, email, isAdmin);
  if (!record) return null;
  record.task.status = "Completed";
  record.task.endedAt = new Date().toISOString();
  record.task.notes = [record.task.notes, `Call result: ${outcome}.`, summary?.trim() || ""]
    .filter(Boolean)
    .join("\n");
  record.activities.unshift({
    id: `mock-activity-${id}-${Date.now()}`,
    contactId: record.task.contactId,
    taskId: record.task.id,
    channel: "Phone",
    direction: "Outbound",
    status: "Completed",
    subject: outcome,
    content: summary?.trim() || `Call result: ${outcome}.`,
    sender: email,
    notes: record.task.notes,
    callResult: outcome,
    sourceUrl: null,
    threadId: null,
    messageId: null,
    replyStatus: null,
    cpAtInteraction: "CP1",
    createdAt: record.task.endedAt,
  });
  record.brand.activities = record.activities;
  return record;
}
