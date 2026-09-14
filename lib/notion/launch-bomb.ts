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

function stepContent(channel: Channel, copy?: LaunchStepCopy) {
  if (channel === "Phone") return copy?.script?.trim() || copy?.callGoal?.trim() || "";
  if (channel === "Email") {
    const subject = copy?.subject?.trim() || "";
    const body = copy?.content?.trim() || "";
    return subject && body ? `${subject}\n\n${body}` : body || subject;
  }
  return copy?.content?.trim() || "";
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
  if (!brand.ownerId) throw new Error("客户未分配 Owner，不可生成任务");
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

  for (const write of result.writes) {
    const copy = input.copies?.[write.templateId || ""];
    const content = stepContent(write.channel, copy);
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
        content,
        sender: input.sender,
        taskId: task.id,
        cpAtInteraction: interactionCpCode(brand.currentCp),
        notes: "Bomb 方案已排班，尚未实际发送。",
      });
    }
  }

  await markFollowupClientEngaged(input.brandId, {
    handlingMode: "Automated",
    note: "已发起 Bomb。",
  });

  return {
    scheduled: result.writes.length,
    unscheduled: result.unscheduled.length,
    message: `${bomb.name} launched`,
  };
}
