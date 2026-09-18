import {
  createPage,
  firstRelationId,
  retrievePage,
  richText,
  titleFromProperties,
} from "./client";
import { getFollowupConversationDbId } from "./config";
import { findFollowupContactsByEmail, listFollowupContacts } from "./contacts";
import { conversationCpRelation } from "./cps";
import { mapFollowupClientPage } from "./followup-clients";
import { markFollowupClientEngaged, resolveConversationThread } from "./followup-writes";
import { contactMatchesReplySender } from "./inbound-reply";
import { InboundReplyError } from "./inbound-errors";
import {
  normalizeInboundColdInput,
  type InboundColdInput,
} from "./inbound-cold-input";
import { allocateReplyDueAt, replyDueAtProperty, REPLY_DUE_PROPERTY } from "./reply-due";
import { senderForChannel } from "./reply-target";
import { interactionCpCode } from "../outreach-domain";

export type { InboundColdInput };
export { normalizeInboundColdInput } from "./inbound-cold-input";

export type InboundColdResult = {
  duplicate: false;
  conversationId: string;
  threadId: string | null;
  messageId: string | null;
  contactId: string;
  taskId: null;
  brandId: string;
  inboxStatus: "Needs Reply" | null;
};

type ResolvedTarget = {
  brandId: string;
  brandName: string;
  contactId: string;
  contactName: string;
  currentCp?: "CP1" | "CP2" | "CP3" | "CP4" | "CP5" | "CP6" | null;
  currentCpId?: string | null;
  inferredSender?: string | null;
};

async function loadContactContext(contactId: string, channel: string): Promise<ResolvedTarget> {
  const contactPage = await retrievePage(contactId).catch(() => null);
  if (!contactPage) throw new InboundReplyError("Contact not found", 404);
  const brandId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
  if (!brandId) throw new InboundReplyError("Brand not found", 404);
  const brandPage = await retrievePage(brandId).catch(() => null);
  if (!brandPage) throw new InboundReplyError("Brand not found", 404);
  const brand = await mapFollowupClientPage(brandPage);
  const contacts = await listFollowupContacts(brandId, [contactId]);
  const contact = contacts.find((item) => item.id === contactId);
  return {
    brandId: brand.id,
    brandName: brand.name,
    contactId,
    contactName: contact?.name || titleFromProperties(contactPage.properties) || "KeyPerson",
    currentCp: interactionCpCode(brand.currentCp),
    currentCpId: brand.currentCpId,
    inferredSender: contact ? senderForChannel(contact, channel) || null : null,
  };
}

async function resolveBySenderInBrand(brandId: string, channel: string, sender: string) {
  const brandPage = await retrievePage(brandId).catch(() => null);
  if (!brandPage) throw new InboundReplyError("Brand not found", 404);
  const contacts = await listFollowupContacts(brandId);
  const matches = contacts.filter((item) => contactMatchesReplySender(item, channel, sender));
  if (matches.length > 1) {
    throw new InboundReplyError("Multiple contacts match this sender", 409);
  }
  if (!matches[0]) {
    throw new InboundReplyError("Contact not found", 404);
  }
  return loadContactContext(matches[0].id, channel);
}

/** Email only: FollowUpClientId empty → KeyPerson email → Follow-up Contact(s) → brand. */
async function resolveByEmailGlobally(sender: string) {
  const matches = await findFollowupContactsByEmail(sender);
  if (matches.length > 1) {
    throw new InboundReplyError("Multiple contacts match this sender", 409);
  }
  if (!matches[0]) {
    throw new InboundReplyError("Contact not found", 404);
  }
  return loadContactContext(matches[0].id, "Email");
}

async function resolveInboundColdTarget(
  input: ReturnType<typeof normalizeInboundColdInput>,
): Promise<ResolvedTarget> {
  if (input.brandId) {
    return resolveBySenderInBrand(input.brandId, input.channel, input.sender);
  }
  // Only Email may omit FollowUpClientId (validated in normalizeInboundColdInput).
  return resolveByEmailGlobally(input.sender);
}

export async function ingestInboundCold(
  raw: InboundColdInput,
  assertAccess?: (target: { brandId: string }) => Promise<void>,
): Promise<InboundColdResult> {
  const input = normalizeInboundColdInput(raw);
  const target = await resolveInboundColdTarget(input);
  if (assertAccess) await assertAccess({ brandId: target.brandId });

  // Cold inbound is a new topic (no matching outbound task) → always open a new thread.
  const { threadId } = await resolveConversationThread(
    target.contactId,
    input.channel,
    null,
    undefined,
    { forceNew: true },
  );
  const messageId = `IN-${input.channel}-${Date.now()}`;
  const occurredAt = new Date().toISOString();
  const sender = input.sender || target.inferredSender || "";
  const subject = input.channel === "Email" ? input.object : "";

  const properties: Record<string, unknown> = {
    "Conversation Record": {
      title: richText(`${target.brandName} — ${target.contactName} — ${input.channel} — Inbound`),
    },
    "Conversation Record ID": { rich_text: richText(`PORTAL-IN-${messageId}`) },
    "Follow-up Contact": { relation: [{ id: target.contactId }] },
    Channel: { select: { name: input.channel } },
    Direction: { select: { name: "Inbound" } },
    Subject: { rich_text: subject ? richText(subject) : [] },
    Content: { rich_text: richText(input.content) },
    Sender: { rich_text: sender ? richText(sender) : [] },
    Notes: { rich_text: richText("客户主动来信，无对应已发任务。") },
    "Thread ID": { rich_text: richText(threadId) },
    "Message ID": { rich_text: richText(messageId) },
    "Interaction At": { date: { start: occurredAt } },
  };
  const cp = await conversationCpRelation(target.currentCpId || target.currentCp);
  if (cp) properties.CP = cp;
  if (input.channel !== "Phone") {
    properties["Reply Status"] = { select: { name: "Needs Reply" } };
    try {
      properties[REPLY_DUE_PROPERTY] = replyDueAtProperty(
        await allocateReplyDueAt({ occurredAt, channel: input.channel }),
      );
    } catch {
      // Capacity lookup failed — still ingest; brands list falls back to Interaction At.
    }
  }

  const page = await createPage(getFollowupConversationDbId(), properties);
  await markFollowupClientEngaged(target.brandId, {
    handlingMode: "Human",
    note: "客户主动来信，待人工处理。",
  });

  return {
    duplicate: false,
    conversationId: page.id,
    threadId,
    messageId,
    contactId: target.contactId,
    taskId: null,
    brandId: target.brandId,
    inboxStatus: input.channel === "Phone" ? null : "Needs Reply",
  };
}
