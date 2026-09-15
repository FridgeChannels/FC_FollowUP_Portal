import type { BrandContact } from "../brand-list";
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
import { skipUnavailableChannels } from "./config";
import { listChannelDailyMax } from "./capacity";
import { retrievePage } from "./client";
import { mapFollowupClientDetail } from "./followup-clients";
import { createFollowupTask, createOutboundConversation, markFollowupClientEngaged } from "./followup-writes";
import { listExistingTasksForSchedule } from "./tasks";

export type LaunchStepCopy = {
  subject?: string;
  content?: string;
  callGoal?: string;
  script?: string;
};

export type LaunchedBombTask = {
  id: string;
  templateId?: string;
  channel: Channel;
  scheduledAt: string;
  content: string;
};

function todayDateOnly() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

export async function launchFollowupBomb(input: {
  brandId: string;
  bombId: string;
  contactId: string;
  copies?: Record<string, LaunchStepCopy>;
  sender?: string | null;
}) {
  const [page, bomb, dailyMax, existingTasks] = await Promise.all([
    retrievePage(input.brandId),
    retrieveFollowupBomb(input.bombId),
    listChannelDailyMax(),
    listExistingTasksForSchedule(),
  ]);
  const brand = await mapFollowupClientDetail(page);
  const contact = brand.contacts.find((item) => item.id === input.contactId);
  if (!contact) throw new Error("Contact not found on this brand");
  if (!brand.ownerId) throw new Error("Client has no Owner assigned; tasks cannot be created");
  if (bomb.status !== "Active") throw new Error("Only Active OmniReach can be launched");

  const enforceReachable = skipUnavailableChannels();
  const selectedChannels = bomb.templates
    .map((item) => {
      const channel = asChannel(item.channel);
      if (!channel) return null;
      if (enforceReachable && !channelReachable(contact, channel)) return null;
      return { channel, templateId: item.id, reachable: true };
    })
    .filter((item): item is { channel: Channel; templateId: string } => !!item);

  const result = commitSchedule({
    request: {
      preferredStartDate: todayDateOnly(),
      creationMethod: "Automated",
      clients: [{
        clientId: brand.id,
        ownerId: brand.ownerId,
        clientPriority: asPriority(brand.priority),
        followUpStatus: asClientStatus(brand.status),
        contacts: [{
          contactId: contact.id,
          followUpStatus: asContactStatus(contact.followupStatus),
          followUpMode: asFollowUpMode(contact.followupMode),
          channels: selectedChannels,
        }],
      }],
    },
    snapshot: { dailyMax, existingTasks },
  });

  if (result.needsReview.length && !result.writes.length) {
    throw new Error(result.needsReview[0]?.reason || "Launch needs review");
  }
  if (!result.writes.length) {
    throw new Error(result.unscheduled[0]?.reason || "No working-day capacity for this OmniReach");
  }

  const context = buildTemplateVariableContext({
    companyName: brand.name,
    productDescription: brand.productDescription,
    matchedCategory: brand.matchedCategory,
    hasContact: true,
    contactName: contact.name,
    contactTitle: contact.title,
    contactRole: contact.contactRole,
    email: contact.email,
    phone: contact.phone,
    ownerOrConnector: contact.role,
    linkedinUrl: contact.linkedin,
  });
  const scheduledTasks: LaunchedBombTask[] = [];
  for (const write of result.writes) {
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
      brandName: brand.name,
      contactId: write.followUpContactId,
      contactName: contact.name,
      ownerId: write.ownerId,
      channel: write.channel,
      scheduledAt: write.scheduledAt,
      priority: write.priority,
      creationMethod: write.creationMethod,
      templateId: write.templateId,
      sourceBombId: input.bombId,
      notes: `由 Bomb 排班生成，尚未实际发送。方案：${bomb.name}。`,
    });
    if (content) {
      await createOutboundConversation({
        brandName: brand.name,
        contactId: contact.id,
        contactName: contact.name,
        channel: write.channel,
        subject: resolved.subject || null,
        content,
        sender: input.sender,
        taskId: task.id,
        cpId: brand.currentCpId,
        cpAtInteraction: interactionCpCode(brand.currentCp),
        notes: "Bomb 方案已排班，尚未实际发送。",
      });
    }
    scheduledTasks.push({
      id: task.id,
      templateId: write.templateId,
      channel: write.channel,
      scheduledAt: write.scheduledAt,
      content,
    });
  }

  await markFollowupClientEngaged(input.brandId, {
    handlingMode: "Automated",
    note: "已发起 Bomb。",
  });

  return {
    scheduled: result.writes.length,
    unscheduled: result.unscheduled.length,
    scheduledTasks,
    message: `${bomb.name} launched`,
  };
}
