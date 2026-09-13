import type { Candidate, ClientSelection, ContactSelection, CreationMethod, NeedsReviewItem, Priority } from "./types.ts";
import { resolveTaskPriority } from "./priority.ts";

const BLOCKED_CLIENT_STATUS = new Set(["Completed", "Terminated"]);
const BLOCKED_CONTACT_STATUS = new Set(["Completed", "Terminated"]);

export function evaluateEligibility(
  clients: ClientSelection[],
  creationMethod: CreationMethod,
): { candidates: Candidate[]; needsReview: NeedsReviewItem[] } {
  const candidates: Candidate[] = [];
  const needsReview: NeedsReviewItem[] = [];
  let sourceIndex = 0;

  for (const client of clients) {
    const clientReviews = reviewClient(client);
    if (clientReviews.length) {
      needsReview.push(...clientReviews);
      continue;
    }

    if (client.contacts.length === 0) {
      needsReview.push({
        scope: "client",
        clientId: client.clientId,
        code: "NO_CONTACTS_SELECTED",
        reason: "未选择任何目标联系人，不生成 Follow-up Task",
      });
      continue;
    }

    const clientPriority: Priority = client.clientPriority ?? "P2";

    for (const contact of client.contacts) {
      const contactReviews = reviewContact(client.clientId, contact, creationMethod);
      if (contactReviews.length) {
        needsReview.push(...contactReviews);
        continue;
      }

      for (const channel of contact.channels) {
        candidates.push({
          sourceIndex: sourceIndex++,
          clientId: client.clientId,
          contactId: contact.contactId,
          channel: channel.channel,
          ownerId: client.ownerId,
          clientPriority,
          priority: resolveTaskPriority(creationMethod, contact.followUpStatus),
          creationMethod,
          templateId: channel.templateId,
        });
      }
    }
  }

  return { candidates, needsReview };
}

function reviewClient(client: ClientSelection): NeedsReviewItem[] {
  if (client.followUpStatus && BLOCKED_CLIENT_STATUS.has(client.followUpStatus)) {
    return [{
      scope: "client",
      clientId: client.clientId,
      code: "CLIENT_STATUS_BLOCKED",
      reason: `客户跟进状态为 ${client.followUpStatus}，不可继续生成任务`,
    }];
  }

  if (!client.ownerId.trim()) {
    return [{
      scope: "client",
      clientId: client.clientId,
      code: "MISSING_OWNER",
      reason: "客户未分配 Owner，不可生成任务",
    }];
  }

  return [];
}

function reviewContact(
  clientId: string,
  contact: ContactSelection,
  creationMethod: CreationMethod,
): NeedsReviewItem[] {
  if (BLOCKED_CONTACT_STATUS.has(contact.followUpStatus)) {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      code: "CONTACT_STATUS_BLOCKED",
      reason: `联系人跟进状态为 ${contact.followUpStatus}，不可继续生成任务`,
    }];
  }

  if (creationMethod === "Automated" && contact.followUpMode === "Manual") {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      code: "CONTACT_MODE_BLOCKS_AUTOMATED",
      reason: "联系人已转为人工跟进，自动流程不再生成标准任务",
    }];
  }

  if (contact.channels.length === 0) {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      code: "NO_CHANNELS_SELECTED",
      reason: "未选择目标渠道，不生成 Follow-up Task",
    }];
  }

  const blocked = contact.channels.filter(channel => channel.doNotContact);
  if (blocked.length) {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      channels: blocked.map(channel => channel.channel),
      code: "DO_NOT_CONTACT",
      reason: "存在禁止继续联系的规则，整位联系人进入复核",
    }];
  }

  const unreachable = contact.channels.filter(channel => !channel.reachable);
  if (unreachable.length) {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      channels: unreachable.map(channel => channel.channel),
      code: "CHANNEL_UNREACHABLE",
      reason: "选中渠道缺少有效联系方式，整位联系人进入复核",
    }];
  }

  return [];
}
