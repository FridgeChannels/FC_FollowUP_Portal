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
        reason: "No target contact selected; Follow-up Task was not created",
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
      reason: `Client follow-up status is ${client.followUpStatus}; new tasks cannot be created`,
    }];
  }

  if (!client.ownerId.trim()) {
    return [{
      scope: "client",
      clientId: client.clientId,
      code: "MISSING_OWNER",
      reason: "Client has no Owner assigned; tasks cannot be created",
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
      reason: `Contact follow-up status is ${contact.followUpStatus}; new tasks cannot be created`,
    }];
  }

  if (creationMethod === "Automated" && contact.followUpMode === "Manual") {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      code: "CONTACT_MODE_BLOCKS_AUTOMATED",
      reason: "Contact is on manual follow-up; automated standard tasks are not created",
    }];
  }

  if (contact.channels.length === 0) {
    return [{
      scope: "contact",
      clientId,
      contactId: contact.contactId,
      code: "NO_CHANNELS_SELECTED",
      reason: "No target channel selected; Follow-up Task was not created",
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
      reason: "A do-not-contact rule applies; this contact needs review",
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
      reason: "A selected channel is missing a valid endpoint; this contact needs review",
    }];
  }

  return [];
}
