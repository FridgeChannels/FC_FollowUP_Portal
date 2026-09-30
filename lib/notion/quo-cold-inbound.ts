import type { BrandActivity, BrandContact } from "../brand-list";
import { interactionCpCode } from "../outreach-domain";
import { normalizeNanpPhone, planQuoColdInbound } from "../quo/cold-inbound";
import { serializeQuoCallData } from "../quo/call-payload";
import { mergeQuoCallData, recordingsForQuoCall } from "../quo/data";
import type { QuoCallData } from "../quo/types";
import { invalidateBrandReplySignalCache } from "./brand-reply-signal-cache";
import {
  firstRelationId,
  propertyText,
  queryDatabasePages,
  retrievePage,
  richText,
  updatePage,
  type NotionPage,
} from "./client";
import { getFollowupContactDbId, getKeyPersonDbId } from "./config";
import { mapFollowupContact } from "./contacts";
import { findQuoCallConversation } from "./conversations";
import { mapFollowupClientPage } from "./followup-clients";
import {
  createFollowupTask,
  createOutboundConversation,
  linkConversationToTask,
  markFollowupClientEngaged,
} from "./followup-writes";
import { findOwnerByAccount } from "./owners";
import { callResult, eventTime, readableContent } from "./quo-calls";
import {
  easternDateOnly,
  easternDateTimeIso,
  easternMinuteOfDayCeil,
} from "../scheduling-engine/calendar";

export type QuoColdInboundResult =
  | {
      kind: "created";
      conversationId: string;
      contactId: string;
      brandId: string;
      brandName: string;
      ownerId: string | null;
      ownerName: string | null;
      contactName: string;
      sender: string | null;
      content: string;
      threadId: string | null;
      messageId: string;
      occurredAt: string;
      taskId: string;
    }
  | {
      kind: "updated";
      conversationId: string;
      contactId: string | null;
      brandId: string | null;
      taskId: string | null;
    }
  | { kind: "skipped"; reason: string };

const COLD_INBOUND_TASK_NOTE = "客户来电，待 Caller 评审。";
const COLD_INBOUND_CONVERSATION_NOTE = "客户来电，已生成 Phone 任务。";
const TEST_CALLER_ACCOUNT = "testcaller@fridgechannels.com";

function scheduledAtForCall(occurredAt: string) {
  const when = new Date(occurredAt);
  const date = Number.isNaN(when.getTime()) ? new Date() : when;
  const minute = Math.min(easternMinuteOfDayCeil(date), 24 * 60 - 1);
  return easternDateTimeIso(easternDateOnly(date), minute);
}

async function ownerForColdInboundTask(brand: {
  ownerId: string | null;
  ownerName: string | null;
  isTest?: boolean;
}) {
  if (brand.ownerId) return { id: brand.ownerId, name: brand.ownerName };
  if (brand.isTest) {
    const caller = await findOwnerByAccount(TEST_CALLER_ACCOUNT);
    if (caller?.id) return { id: caller.id, name: caller.name };
  }
  throw new Error("Cold inbound Phone task requires a brand owner");
}

async function createColdInboundPhoneTask(input: {
  brandId: string;
  brandName: string;
  contactId: string;
  contactName: string;
  ownerId: string;
  conversationId: string;
  occurredAt: string;
}) {
  const created = await createFollowupTask({
    brandId: input.brandId,
    brandName: input.brandName,
    contactId: input.contactId,
    contactName: input.contactName,
    ownerId: input.ownerId,
    channel: "Phone",
    scheduledAt: scheduledAtForCall(input.occurredAt),
    priority: "P0",
    creationMethod: "Manual",
    notes: COLD_INBOUND_TASK_NOTE,
  });
  await updatePage(created.id, {
    "Task Status": { status: { name: "In Progress" } },
  });
  await linkConversationToTask(input.conversationId, created.id);
  await updatePage(input.conversationId, {
    Notes: { rich_text: richText(COLD_INBOUND_CONVERSATION_NOTE) },
  });
  return created.id;
}

async function ensureTaskForUntaskedConversation(
  existing: BrandActivity,
  occurredAt: string,
) {
  if (!existing.brandId || !existing.contactId) return null;
  const brand = await mapFollowupClientPage(await retrievePage(existing.brandId));
  const contact = await mapFollowupContact(await retrievePage(existing.contactId));
  return createColdInboundPhoneTask({
    brandId: brand.id,
    brandName: brand.name || "Untitled Client",
    contactId: contact.id,
    contactName: contact.name || "KeyPerson",
    ownerId: (await ownerForColdInboundTask(brand)).id,
    conversationId: existing.id,
    occurredAt,
  });
}

function keyPersonDbError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/could not find database|404|unauthorized|forbidden/i.test(message)) {
    throw new Error(
      `KeyPerson database unavailable for phone lookup (${getKeyPersonDbId()}): ${message}`,
    );
  }
  throw error;
}

async function contactsForNanp(nanp: string): Promise<BrandContact[]> {
  let people: NotionPage[];
  try {
    people = await queryDatabasePages(getKeyPersonDbId(), {
      or: [
        { property: "Phone", phone_number: { contains: nanp } },
        { property: "Phone", phone_number: { equals: `+1${nanp}` } },
      ],
    });
  } catch (error) {
    keyPersonDbError(error);
  }
  const matchedPeople = people.filter(
    (page) => normalizeNanpPhone(propertyText(page.properties?.Phone)) === nanp,
  );
  const contactPages: NotionPage[] = [];
  const seen = new Set<string>();
  for (const person of matchedPeople) {
    const pages = await queryDatabasePages(getFollowupContactDbId(), {
      property: "Key Person",
      relation: { contains: person.id },
    });
    for (const page of pages) {
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      contactPages.push(page);
    }
  }
  const contacts = await Promise.all(contactPages.map(mapFollowupContact));
  return contacts.filter((contact) => normalizeNanpPhone(contact.phone) === nanp);
}

function mergedCall(existing: BrandActivity | undefined, data: QuoCallData, eventType: string) {
  return mergeQuoCallData(existing?.quo, {
    ...data,
    eventTypes: [eventType],
    lastEventAt: data.lastEventAt || new Date().toISOString(),
  }, eventType);
}

async function updateColdConversation(
  existing: BrandActivity,
  data: QuoCallData,
  eventType: string,
): Promise<QuoColdInboundResult> {
  const merged = mergedCall(existing, data, eventType);
  const recordings = recordingsForQuoCall(merged);
  const extendedParameters = serializeQuoCallData(merged, existing.extendedParameters);
  const result = callResult(merged.call);
  await updatePage(existing.id, {
    Content: { rich_text: richText(readableContent(merged)) },
    "Extended Parameters": { rich_text: richText(extendedParameters) },
    "Message ID": { rich_text: richText(`QUO_CALL:${merged.callId}`) },
    "Call Result": { rich_text: result ? richText(result) : [] },
    Direction: { select: { name: "Inbound" } },
    "Interaction At": { date: { start: eventTime(merged) } },
    ...(recordings[0]?.url ? { "Source URL": { url: recordings[0].url } } : {}),
  });
  const taskId = await ensureTaskForUntaskedConversation(existing, eventTime(merged));
  return {
    kind: "updated",
    conversationId: existing.id,
    contactId: existing.contactId,
    brandId: existing.brandId,
    taskId,
  };
}

export async function ingestQuoColdInbound(input: {
  data: QuoCallData;
  eventType: string;
}): Promise<QuoColdInboundResult> {
  const existing = (await findQuoCallConversation(input.data.callId))[0];
  const plan = planQuoColdInbound({
    call: input.data.call,
    existingTaskId: existing?.taskId,
    hasExistingConversation: !!existing,
  });
  if (plan.action === "skip") return { kind: "skipped", reason: plan.reason };
  if (plan.action === "update") {
    if (!existing) return { kind: "skipped", reason: "missing-conversation" };
    return updateColdConversation(existing, input.data, input.eventType);
  }

  const contacts = await contactsForNanp(plan.nanp);
  if (contacts.length !== 1) {
    return {
      kind: "skipped",
      reason: contacts.length ? "multiple-contacts" : "no-contact",
    };
  }

  const contactPage = await retrievePage(contacts[0].id);
  const brandId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
  if (!brandId) return { kind: "skipped", reason: "no-brand" };

  const brand = await mapFollowupClientPage(await retrievePage(brandId));
  const merged = mergedCall(undefined, input.data, input.eventType);
  const content = readableContent(merged);
  const result = callResult(merged.call);
  const occurredAt = eventTime(merged);
  const extendedParameters = serializeQuoCallData(merged);
  const messageId = `QUO_CALL:${merged.callId}`;
  const page = await createOutboundConversation({
    brandId: brand.id,
    brandName: brand.name || "Untitled Client",
    contactId: contacts[0].id,
    contactName: contacts[0].name || "KeyPerson",
    channel: "Phone",
    content,
    sender: plan.phone,
    messageId,
    callResult: result,
    interactionAt: occurredAt,
    notes: COLD_INBOUND_CONVERSATION_NOTE,
    extendedParameters,
    titleSuffix: "Inbound",
    direction: "Inbound",
    cpId: brand.currentCpId,
    cpAtInteraction: interactionCpCode(brand.currentCp),
    forceNewThread: true,
  });
  const recordings = recordingsForQuoCall(merged);
  if (recordings[0]?.url) {
    await updatePage(page.id, { "Source URL": { url: recordings[0].url } });
  }
  invalidateBrandReplySignalCache();
  await markFollowupClientEngaged(brand.id, {
    handlingMode: "Human",
    note: "客户主动来信，待人工处理。",
  });
  const owner = await ownerForColdInboundTask(brand);
  const taskId = await createColdInboundPhoneTask({
    brandId: brand.id,
    brandName: brand.name || "Untitled Client",
    contactId: contacts[0].id,
    contactName: contacts[0].name || "KeyPerson",
    ownerId: owner.id,
    conversationId: page.id,
    occurredAt,
  });

  return {
    kind: "created",
    conversationId: page.id,
    contactId: contacts[0].id,
    brandId: brand.id,
    brandName: brand.name,
    ownerId: owner.id,
    ownerName: owner.name,
    contactName: contacts[0].name || "KeyPerson",
    sender: plan.phone,
    content,
    threadId: propertyText(page.properties?.["Thread ID"]) || null,
    messageId,
    occurredAt,
    taskId,
  };
}
