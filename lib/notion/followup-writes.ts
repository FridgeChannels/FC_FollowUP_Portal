import { FOLLOW_UP_STATUSES, HANDLING_MODES } from "../brand-list";
import { createPage, retrievePage, richText, updatePage } from "./client";
import { getFollowupConversationDbId } from "./config";
import { listCurrentCps } from "./cps";
import { retrieveOwner } from "./owners";

const TASK_STATUSES = new Set(["Pending", "In Progress", "Completed", "Failed", "Cancelled"]);
const CALL_RESULTS = new Set(["Connected", "No Answer", "Voicemail", "Declined", "Invalid Number"]);
const CALL_OUTCOME_MAP: Record<string, string | null> = {
  "Contact Responded": "Connected",
  "Connected — No Useful Response": "Connected",
  "No Answer": "No Answer",
  Voicemail: "Voicemail",
  "Call Back Requested": "Connected",
  "Wrong Number": "Invalid Number",
  "Wrong Contact": "Declined",
  Other: null,
};

const CHANNELS = new Set(["Email", "LinkedIn", "SMS", "WhatsApp", "Phone"]);

function asStatus(value?: string | null) {
  return FOLLOW_UP_STATUSES.includes(value as (typeof FOLLOW_UP_STATUSES)[number])
    ? value
    : null;
}

function asHandlingMode(value?: string | null) {
  return HANDLING_MODES.includes(value as (typeof HANDLING_MODES)[number])
    ? value
    : null;
}

export async function updateFollowupClient(
  pageId: string,
  patch: {
    currentCpId?: string | null;
    ownerId?: string | null;
    status?: string | null;
    handlingMode?: string | null;
    notes?: string | null;
  },
) {
  const properties: Record<string, unknown> = {};

  if (patch.currentCpId !== undefined) {
    if (patch.currentCpId) {
      const cps = await listCurrentCps();
      if (!cps.some((item) => item.id === patch.currentCpId)) {
        throw new Error("Unknown Current CP");
      }
    }
    properties["Current CP"] = {
      relation: patch.currentCpId ? [{ id: patch.currentCpId }] : [],
    };
  }

  if (patch.ownerId !== undefined) {
    if (patch.ownerId) {
      const owner = await retrieveOwner(patch.ownerId);
      if (!owner) throw new Error("Unknown Owner");
    }
    properties.Owner = {
      relation: patch.ownerId ? [{ id: patch.ownerId }] : [],
    };
  }

  if (patch.status !== undefined) {
    const status = asStatus(patch.status);
    if (!status) throw new Error("Invalid Follow-up Status");
    properties["Follow-up Status"] = { status: { name: status } };
  }

  if (patch.handlingMode !== undefined) {
    const handlingMode = asHandlingMode(patch.handlingMode);
    if (!handlingMode) throw new Error("Invalid Handling Mode");
    properties["Handling Mode"] = { select: { name: handlingMode } };
  }

  if (patch.notes !== undefined) {
    properties.Notes = { rich_text: richText(patch.notes || "") };
  }

  if (!Object.keys(properties).length) {
    throw new Error("No brand fields to update");
  }

  return updatePage(pageId, properties);
}

export async function createOutboundConversation(input: {
  brandName: string;
  contactId: string;
  contactName: string;
  channel: string;
  content: string;
  sender?: string | null;
  taskId?: string;
  messageStatus?: string | null;
  callResult?: string | null;
  interactionAt?: string | null;
  notes?: string;
  titleSuffix?: string;
}) {
  if (!CHANNELS.has(input.channel)) throw new Error("Invalid channel");
  const content = input.content.trim();
  if (!content) throw new Error("Message content is required");

  const contact = await retrievePage(input.contactId);
  const suffix = input.titleSuffix || (input.messageStatus === null ? input.channel : "Pending");
  const title = `${input.brandName} — ${input.contactName} — ${input.channel} — ${suffix}`;
  const subject = input.channel === "Email" ? content.split("\n")[0].slice(0, 120) : "";
  const properties: Record<string, unknown> = {
    "Conversation Record": { title: richText(title) },
    "Conversation Record ID": { rich_text: richText(`PORTAL-${Date.now()}`) },
    "Follow-up Contact": { relation: [{ id: contact.id }] },
    Channel: { select: { name: input.channel } },
    Direction: { select: { name: "Outbound" } },
    Subject: { rich_text: subject ? richText(subject) : [] },
    Content: { rich_text: richText(content) },
    Sender: { rich_text: input.sender ? richText(input.sender) : [] },
    Notes: { rich_text: richText(input.notes || "人工消息，尚未实际发送。") },
  };
  if (input.taskId) {
    properties["Follow-up Task"] = { relation: [{ id: input.taskId }] };
  }
  if (input.messageStatus !== null) {
    properties["Message Status"] = { select: { name: input.messageStatus || "Pending" } };
  }
  if (input.callResult && CALL_RESULTS.has(input.callResult)) {
    properties["Call Result"] = { select: { name: input.callResult } };
  }
  if (input.interactionAt) {
    properties["Interaction At"] = { date: { start: input.interactionAt } };
  }

  return createPage(getFollowupConversationDbId(), properties);
}

export async function updateFollowupTask(
  pageId: string,
  patch: {
    status?: string;
    ownerId?: string | null;
    notes?: string | null;
    endedAt?: string | null;
  },
) {
  const properties: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!TASK_STATUSES.has(patch.status)) throw new Error("Invalid Task Status");
    properties["Task Status"] = { status: { name: patch.status } };
  }
  if (patch.ownerId !== undefined) {
    if (patch.ownerId) {
      const owner = await retrieveOwner(patch.ownerId);
      if (!owner) throw new Error("Unknown Owner");
    }
    properties.Owner = { relation: patch.ownerId ? [{ id: patch.ownerId }] : [] };
  }
  if (patch.notes !== undefined) {
    properties.Notes = { rich_text: richText(patch.notes || "") };
  }
  if (patch.endedAt !== undefined) {
    properties["Ended At"] = patch.endedAt ? { date: { start: patch.endedAt } } : { date: null };
  }
  if (!Object.keys(properties).length) throw new Error("No task fields to update");
  return updatePage(pageId, properties);
}

export function mapCallOutcome(outcome: string) {
  return CALL_OUTCOME_MAP[outcome] ?? null;
}

export async function completeFollowupCall(input: {
  taskId: string;
  brandName: string;
  contactId: string;
  contactName: string;
  outcome: string;
  summary?: string;
  sender?: string | null;
}) {
  const callResult = mapCallOutcome(input.outcome);
  const now = new Date().toISOString();
  const notes = [`电话结果：${input.outcome}。`, input.summary?.trim() || ""].filter(Boolean).join("");
  await createOutboundConversation({
    brandName: input.brandName,
    contactId: input.contactId,
    contactName: input.contactName,
    channel: "Phone",
    content: input.summary?.trim() || input.outcome,
    sender: input.sender,
    taskId: input.taskId,
    messageStatus: null,
    callResult,
    interactionAt: now,
    notes,
    titleSuffix: callResult || "Phone",
  });
  return updateFollowupTask(input.taskId, {
    status: "Completed",
    endedAt: now,
    notes,
  });
}
