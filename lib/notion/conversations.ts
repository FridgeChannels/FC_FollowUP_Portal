import type { BrandActivity } from "../brand-list";
import {
  firstRelationId,
  notionFetch,
  propertyDate,
  propertyText,
  queryDatabasePages,
  relationIds,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupConversationDbId } from "./config";

const CONTACT_CONVERSATION_KEYS = ["Interactions", "Conversations", "Conversation Records"];

function asDirection(value: string): BrandActivity["direction"] {
  if (value === "Inbound" || value === "Outbound") return value;
  return null;
}

function asReplyStatus(value: string): BrandActivity["replyStatus"] {
  if (value === "Needs Reply" || value === "Replied") return value;
  return null;
}

function mapConversation(page: NotionPage): BrandActivity {
  const properties = page.properties || {};
  const subject = propertyText(properties.Subject) || null;
  return {
    id: page.id,
    contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    taskId: firstRelationId(properties["Follow-up Task"]) || null,
    channel: propertyText(properties.Channel) || null,
    direction: asDirection(propertyText(properties.Direction)),
    status: propertyText(properties["Message Status"]) || null,
    subject,
    content: propertyText(properties.Content) || titleFromProperties(properties),
    sender: propertyText(properties.Sender) || null,
    notes: propertyText(properties.Notes) || null,
    callResult: propertyText(properties["Call Result"]) || null,
    sourceUrl: propertyText(properties["Source URL"]) || null,
    threadId: propertyText(properties["Thread ID"]) || null,
    messageId: propertyText(properties["Message ID"]) || null,
    replyStatus: asReplyStatus(propertyText(properties["Reply Status"])),
    createdAt:
      propertyDate(properties["Interaction At"]) || page.created_time || null,
    recordedAt: page.created_time || propertyDate(properties["Interaction At"]),
  };
}

function contactRelationFilter(contactIds: string[]) {
  if (contactIds.length === 1) {
    return {
      property: "Follow-up Contact",
      relation: { contains: contactIds[0] },
    };
  }
  return {
    or: contactIds.map((id) => ({
      property: "Follow-up Contact",
      relation: { contains: id },
    })),
  };
}

async function queryConversationsByContacts(contactIds: string[]) {
  const pages: NotionPage[] = [];
  for (let index = 0; index < contactIds.length; index += 100) {
    const chunk = contactIds.slice(index, index + 100);
    let cursor: string | undefined;
    do {
      const data = await notionFetch<{
        results: NotionPage[];
        has_more?: boolean;
        next_cursor?: string | null;
      }>(`/databases/${getFollowupConversationDbId()}/query`, {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
          filter: contactRelationFilter(chunk),
        }),
      });
      pages.push(...data.results);
      cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
    } while (cursor);
  }
  return pages;
}

async function listFromContactRelations(contactIds: string[]) {
  const conversationIds = new Set<string>();
  const contacts = await Promise.all(
    contactIds.map((id) => retrievePage(id).catch(() => null)),
  );
  for (const page of contacts) {
    if (!page) continue;
    const properties = page.properties || {};
    for (const key of CONTACT_CONVERSATION_KEYS) {
      for (const id of relationIds(properties[key])) conversationIds.add(id);
    }
  }
  const pages = await Promise.all(
    [...conversationIds].map((id) => retrievePage(id).catch(() => null)),
  );
  return pages.filter((page): page is NotionPage => !!page);
}

export async function listConversationsByIds(ids: string[]): Promise<BrandActivity[]> {
  if (!ids.length) return [];
  const pages = await Promise.all(ids.map((id) => retrievePage(id).catch(() => null)));
  return pages
    .filter((page): page is NotionPage => !!page)
    .map(mapConversation)
    .sort((a, b) => {
      const left = a.createdAt || "";
      const right = b.createdAt || "";
      return right.localeCompare(left) || a.id.localeCompare(b.id);
    });
}

export async function listFollowupConversations(
  contactIds: string[],
): Promise<BrandActivity[]> {
  if (!contactIds.length) return [];

  let pages: NotionPage[] = [];
  try {
    pages = await queryConversationsByContacts(contactIds);
  } catch {
    pages = [];
  }
  if (!pages.length) {
    try {
      pages = await listFromContactRelations(contactIds);
    } catch {
      pages = [];
    }
  }

  return pages
    .map(mapConversation)
    .sort((a, b) => {
      const left = a.createdAt || "";
      const right = b.createdAt || "";
      return right.localeCompare(left) || a.id.localeCompare(b.id);
    });
}

function sortConversations(items: BrandActivity[]) {
  return items.sort((a, b) => {
    const left = a.createdAt || "";
    const right = b.createdAt || "";
    return right.localeCompare(left) || a.id.localeCompare(b.id);
  });
}

async function findConversationsByText(
  property: "Message ID" | "Thread ID",
  value?: string | null,
) {
  const text = value?.trim();
  if (!text) return [];
  const pages = await queryDatabasePages(getFollowupConversationDbId(), {
    property,
    rich_text: { equals: text },
  });
  return sortConversations(pages.map(mapConversation));
}

export function findConversationsByMessageId(messageId?: string | null) {
  return findConversationsByText("Message ID", messageId);
}

export function findConversationsByThreadId(threadId?: string | null) {
  return findConversationsByText("Thread ID", threadId);
}
