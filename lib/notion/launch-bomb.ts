import type { BrandContact } from "../brand-list";
import { easternDateOnly } from "../scheduling-engine/calendar";
import { commitSchedule } from "../scheduling-engine";
import type {
  Channel,
  ClientFollowUpStatus,
  ContactFollowUpStatus,
  FollowUpMode,
  Priority,
} from "../scheduling-engine/types";
import { CHANNELS } from "../scheduling-engine/types";
import { interactionCpCode } from "../outreach-domain";
import {
  buildTemplateVariableContext,
  resolveOutboundFields,
} from "../template-variables";
import { retrieveFollowupBomb } from "./bombs";
import { listChannelCapacityConfig } from "./capacity";
import { isScheduleTestMode } from "./config";
import {
  firstRelationId,
  propertyText,
  relationIds,
  retrievePage,
  titleFromProperties,
  updatePage,
  type NotionPage,
} from "./client";
import { listFollowupContacts } from "./contacts";
import { listFollowupConversations } from "./conversations";
import { mapFollowupClientPage } from "./followup-clients";
import { createFollowupTask, createOutboundConversation, markFollowupClientEngaged } from "./followup-writes";
import { hasOpenOmniReachTasks, listExistingTasksForSchedule } from "./tasks";

export type LaunchStepCopy = {
  subject?: string;
  content?: string;
  callGoal?: string;
  script?: string;
};

export type LaunchPlanStep = {
  taskId: string;
  conversationId?: string;
  channel: Channel;
  scheduledAt: string;
  templateId?: string;
  content: string;
  status: "Pending";
};

function asChannel(value?: string | null): Channel | null {
  return value && CHANNELS.includes(value as Channel) ? (value as Channel) : null;
}

function asClientStatus(value?: string | null): ClientFollowUpStatus | undefined {
  if (value === "Unassigned" || value === "In Progress" || value === "Completed" || value === "Terminated") {
    return value;
  }
  if (value === "Ready") return "Not Started";
  return undefined;
}

function asContactStatus(value?: string | null): ContactFollowUpStatus {
  if (value === "In Progress" || value === "Completed" || value === "Terminated") return value;
  return "Not Contacted";
}

function asFollowUpMode(value?: string | null): FollowUpMode | undefined {
  return value === "Automated" || value === "Manual" ? value : undefined;
}

function asPriority(value?: string | null): Priority | undefined {
  return value === "P0" || value === "P1" || value === "P2" ? value : undefined;
}

function channelReachable(contact: BrandContact, channel: Channel) {
  if (channel === "Email") return contact.emailValid;
  if (channel === "LinkedIn") return !!contact.linkedin;
  return contact.phoneValid;
}

function outboundFromTemplate(
  channel: Channel,
  copy: LaunchStepCopy | undefined,
  context: ReturnType<typeof buildTemplateVariableContext>,
) {
  return resolveOutboundFields({
    channel,
    subject: copy?.subject,
    content: copy?.content,
    callGoal: copy?.callGoal,
    script: copy?.script,
  }, context);
}

async function resolveLaunchCompany(page: NotionPage) {
  const clientId = firstRelationId(page.properties?.Client);
  const exhibitionId = firstRelationId(page.properties?.["Follow-up Exhibition"]);
  const [clientPage, exhibitionPage] = await Promise.all([
    clientId ? retrievePage(clientId).catch(() => null) : Promise.resolve(null),
    exhibitionId ? retrievePage(exhibitionId).catch(() => null) : Promise.resolve(null),
  ]);
  const clientProps = clientPage?.properties || {};
  return {
    companyName:
      propertyText(clientProps["Company Name"]) ||
      (clientPage ? titleFromProperties(clientProps) : null),
    productDescription: propertyText(clientProps["Product Description"]) || null,
    matchedCategory: null as string | null,
    followupExhibition: exhibitionPage
      ? titleFromProperties(exhibitionPage.properties) || null
      : null,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) || 0 }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function launchFollowupBomb(input: {
  brandId: string;
  bombId: string;
  contactId: string;
  copies?: Record<string, LaunchStepCopy>;
  sender?: string | null;
  page?: NotionPage;
  brand?: Awaited<ReturnType<typeof mapFollowupClientPage>>;
}) {
  const page = input.page || await retrievePage(input.brandId);
  const relatedContactIds = relationIds(page.properties?.["Follow-up Contacts"]);
  const priority = propertyText(page.properties?.Priority) || null;

  const [brand, contacts, bomb, capacity, existingTasks, company, relatedHasActive] = await Promise.all([
    input.brand ? Promise.resolve(input.brand) : mapFollowupClientPage(page),
    listFollowupContacts(page.id, relatedContactIds),
    retrieveFollowupBomb(input.bombId),
    listChannelCapacityConfig(),
    listExistingTasksForSchedule(),
    resolveLaunchCompany(page),
    relatedContactIds.length
      ? hasOpenOmniReachTasks(relatedContactIds)
      : Promise.resolve(false),
  ]);

  const contact = contacts.find((item) => item.id === input.contactId);
  if (!contact) throw new Error("Contact not found on this brand");
  if (!brand.ownerId) throw new Error("Client has no Owner assigned; tasks cannot be created");
  if (bomb.status !== "Active") throw new Error("Only Active OmniReach can be launched");
  const hasActive = relatedContactIds.length
    ? relatedHasActive
    : await hasOpenOmniReachTasks(contacts.map((item) => item.id));
  if (hasActive) {
    throw new Error("This Brand already has an active OmniReach");
  }

  const selectedChannels = bomb.templates
    .map((item) => {
      const channel = asChannel(item.channel);
      if (!channel) return null;
      if (!channelReachable(contact, channel)) return null;
      return { channel, templateId: item.id, reachable: true as const };
    })
    .filter((item): item is { channel: Channel; templateId: string; reachable: true } => !!item);

  if (!selectedChannels.length) {
    throw new Error("No reachable channels for this KeyPerson; nothing to launch");
  }

  const result = commitSchedule({
    request: {
      preferredStartDate: easternDateOnly(),
      creationMethod: "Automated",
      testMode: isScheduleTestMode(),
      clients: [{
        clientId: brand.id,
        ownerId: brand.ownerId,
        clientPriority: asPriority(priority),
        followUpStatus: asClientStatus(brand.status),
        contacts: [{
          contactId: contact.id,
          followUpStatus: asContactStatus(contact.followupStatus),
          followUpMode: asFollowUpMode(contact.followupMode),
          channels: selectedChannels,
        }],
      }],
    },
    snapshot: {
      dailyMax: capacity.dailyMax,
      timeInterval: capacity.timeInterval,
      existingTasks,
    },
  });

  if (result.needsReview.length && !result.writes.length) {
    throw new Error(result.needsReview[0]?.reason || "Launch needs review");
  }
  if (!result.writes.length) {
    throw new Error(result.unscheduled[0]?.reason || "No working-day capacity for this OmniReach");
  }

  const brandName = company.companyName || brand.name;
  const context = buildTemplateVariableContext({
    companyName: brandName,
    productDescription: company.productDescription,
    matchedCategory: company.matchedCategory,
    followupExhibition: company.followupExhibition,
    hasContact: true,
    contactName: contact.name,
    contactTitle: contact.title,
    contactRole: contact.contactRole,
    email: contact.email,
    phone: contact.phone,
    ownerOrConnector: contact.role,
    linkedinUrl: contact.linkedin,
  });
  const omniReachRunId = crypto.randomUUID();
  const existingConversations = await listFollowupConversations([contact.id]);

  const planSteps = await mapPool(result.writes, 3, async (write) => {
    const template = bomb.templates.find((item) => item.id === write.templateId);
    const incoming = input.copies?.[write.templateId || ""];
    const resolved = outboundFromTemplate(write.channel, {
      subject: incoming?.subject ?? template?.subject ?? undefined,
      content: incoming?.content ?? (write.channel === "Phone" ? undefined : template?.content || undefined),
      callGoal: incoming?.callGoal ?? (write.channel === "Phone" ? template?.name || undefined : undefined),
      script: incoming?.script ?? (write.channel === "Phone" ? template?.content || undefined : undefined),
    }, context);
    const content = resolved.content.trim() || resolved.subject.trim();
    const task = await createFollowupTask({
      brandName,
      contactId: write.followUpContactId,
      contactName: contact.name,
      ownerId: write.ownerId,
      channel: write.channel,
      scheduledAt: write.scheduledAt,
      priority: write.priority,
      creationMethod: write.creationMethod,
      templateId: write.templateId,
      sourceBombId: input.bombId,
      omniReachRunId,
      notes: `由 OmniReach 排班生成，尚未实际发送。方案：${bomb.name}。`,
    });

    let conversationId: string | undefined;
    let displayContent = content;
    if (content) {
      const page = await createOutboundConversation({
        brandName,
        contactId: contact.id,
        contactName: contact.name,
        channel: write.channel,
        subject: resolved.subject || null,
        content,
        sender: input.sender,
        taskId: task.id,
        cpId: brand.currentCpId,
        cpAtInteraction: interactionCpCode(brand.currentCp),
        existingConversations,
        scheduledAt: write.scheduledAt,
        notes: "OmniReach 方案已排班，尚未实际发送。",
      });
      conversationId = page.id;
      await updatePage(task.id, {
        Conversations: { relation: [{ id: page.id }] },
      });
      displayContent = resolved.subject?.trim()
        ? `Subject: ${resolved.subject.trim()}\n\n${resolved.content.trim() || content}`
        : content;
    }

    return {
      taskId: task.id,
      conversationId,
      channel: write.channel,
      scheduledAt: write.scheduledAt,
      templateId: write.templateId,
      content: displayContent,
      status: "Pending" as const,
    } satisfies LaunchPlanStep;
  });

  await markFollowupClientEngaged(input.brandId, {
    handlingMode: "Automated",
    note: "已发起 OmniReach。",
    knownStatus: brand.status,
    knownHandlingMode: brand.handlingMode,
  });

  return {
    scheduled: planSteps.length,
    unscheduled: result.unscheduled.length,
    message: `${bomb.name} launched`,
    omniReachRunId,
    bombId: input.bombId,
    bombName: bomb.name,
    contactId: contact.id,
    steps: planSteps,
  };
}
