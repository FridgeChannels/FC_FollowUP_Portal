import type { BrandActivity } from "../brand-list";
import { interactionCpCode } from "../outreach-domain";
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
import { listCheckpoints } from "./cps";
import { isRetryableNotionError } from "./rate-limit";
import { parseQuoCallData, quoFromMessageId } from "../quo/call-payload";
import { attachmentsFromExtendedParameters } from "../media-attachments";

const CONTACT_CONVERSATION_KEYS = ["Interactions", "Conversations", "Conversation Records"];

function asDirection(value: string): BrandActivity["direction"] {
  if (value === "Inbound" || value === "Outbound") return value;
  return null;
}

function asReplyStatus(value: string): BrandActivity["replyStatus"] {
  if (value === "Needs Reply" || value === "Replied") return value;
  return null;
}

function mapConversation(
  page: NotionPage,
  options: { trimPayload?: boolean } = {},
): BrandActivity {
  const properties = page.properties || {};
  const subject = propertyText(properties.Subject) || null;
  const notes = propertyText(properties.Notes) || null;
  const extendedParameters = propertyText(properties["Extended Parameters"]) || null;
  const messageId = propertyText(properties["Message ID"]) || null;
  return {
    id: page.id,
    contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    taskId: firstRelationId(properties["Follow-up Task"]) || null,
    channel: propertyText(properties.Channel) || null,
    direction: asDirection(propertyText(properties.Direction)),
    // Send state lives on Follow-up Task Status; ConversationDB no longer has Message Status.
    status: null,
    subject,
    content: propertyText(properties.Content) || titleFromProperties(properties),
    sender: propertyText(properties.Sender) || null,
    notes,
    callResult: propertyText(properties["Call Result"]) || null,
    sourceUrl: propertyText(properties["Source URL"]) || null,
    threadId: propertyText(properties["Thread ID"]) || null,
    messageId,
    extendedParameters: options.trimPayload ? null : extendedParameters,
    attachments: attachmentsFromExtendedParameters(extendedParameters),
    replyStatus: asReplyStatus(propertyText(properties["Reply Status"])),
    cpId: firstRelationId(properties.CP) || null,
    cpAtInteraction: null,
    createdAt: page.created_time || null,
    // Prefer Interaction At (actual occurrence) over page created_time.
    recordedAt:
      propertyDate(properties["Interaction At"]) || page.created_time || null,
    scheduledAt: propertyDate(properties["Scheduled At"]) || null,
    replyDueAt: propertyDate(properties["Reply Due At"]) || null,
    // Prefer full Extended Parameters; fall back to Message ID so Call results still appear
    // when Notion truncates the rich_text payload on list/query responses.
    quo: parseQuoCallData(extendedParameters) || quoFromMessageId(messageId),
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

export type ListConversationsPageOptions = {
  limit?: number;
  cursor?: string | null;
  /** Drop raw Extended Parameters from JSON (parsed quo is kept). */
  trimPayload?: boolean;
};

export type ConversationsPage = {
  activities: BrandActivity[];
  nextCursor: string | null;
  hasMore: boolean;
};

async function queryConversationsPageByContacts(
  contactIds: string[],
  options: { limit: number; cursor?: string | null },
) {
  // Pagination cursors are only safe for a single Notion filter; brands rarely exceed 100 contacts.
  const chunk = contactIds.slice(0, 100);
  const body: Record<string, unknown> = {
    page_size: Math.min(Math.max(options.limit, 1), 100),
    filter: contactRelationFilter(chunk),
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  };
  if (options.cursor) body.start_cursor = options.cursor;
  try {
    return await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupConversationDbId()}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (isRetryableNotionError(error)) throw error;
    // Fallback when created_time sort is unavailable.
    const { sorts: _sorts, ...withoutSorts } = body;
    return notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupConversationDbId()}/query`, {
      method: "POST",
      body: JSON.stringify(withoutSorts),
    });
  }
}

export async function listFollowupConversationsPage(
  contactIds: string[],
  options: ListConversationsPageOptions = {},
): Promise<ConversationsPage> {
  if (!contactIds.length) {
    return { activities: [], nextCursor: null, hasMore: false };
  }
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  let data: {
    results: NotionPage[];
    has_more?: boolean;
    next_cursor?: string | null;
  };
  try {
    data = await queryConversationsPageByContacts(contactIds, {
      limit,
      cursor: options.cursor,
    });
  } catch (error) {
    if (isRetryableNotionError(error)) throw error;
    try {
      const pages = await listFromContactRelations(contactIds);
      const mapped = await attachConversationCp(
        sortConversations(
          pages.map((page) => mapConversation(page, { trimPayload: options.trimPayload })),
        ),
      );
      const offset = options.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
      const slice = mapped.slice(offset, offset + limit);
      const nextOffset = offset + slice.length;
      return {
        activities: slice,
        nextCursor: nextOffset < mapped.length ? String(nextOffset) : null,
        hasMore: nextOffset < mapped.length,
      };
    } catch (fallbackError) {
      if (isRetryableNotionError(fallbackError)) throw fallbackError;
      return { activities: [], nextCursor: null, hasMore: false };
    }
  }

  const activities = await attachConversationCp(
    data.results.map((page) => mapConversation(page, { trimPayload: options.trimPayload })),
  );
  // When Notion couldn't sort, keep newest-first within the page.
  sortConversations(activities);
  // Only advertise another page when this response filled the requested page size.
  const hasMore = Boolean(
    data.has_more && data.next_cursor && data.results.length >= limit,
  );
  return {
    activities,
    nextCursor: hasMore ? data.next_cursor || null : null,
    hasMore,
  };
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
  return attachConversationCp(
    pages
      .filter((page): page is NotionPage => !!page)
      .map((page) => mapConversation(page)),
  ).then(sortConversations);
}

export async function listFollowupConversations(
  contactIds: string[],
): Promise<BrandActivity[]> {
  if (!contactIds.length) return [];

  let pages: NotionPage[] = [];
  try {
    pages = await queryConversationsByContacts(contactIds);
  } catch (error) {
    if (isRetryableNotionError(error)) throw error;
    try {
      pages = await listFromContactRelations(contactIds);
    } catch (fallbackError) {
      if (isRetryableNotionError(fallbackError)) throw fallbackError;
      pages = [];
    }
  }

  return attachConversationCp(pages.map((page) => mapConversation(page))).then(sortConversations);
}

function activitySortAt(item: BrandActivity) {
  return item.scheduledAt || item.recordedAt || item.createdAt || "";
}

function sortConversations(items: BrandActivity[]) {
  return items.sort((a, b) => {
    const left = activitySortAt(a);
    const right = activitySortAt(b);
    return right.localeCompare(left) || a.id.localeCompare(b.id);
  });
}

async function attachConversationCp(items: BrandActivity[]): Promise<BrandActivity[]> {
  const ids = [...new Set(items.map((item) => item.cpId).filter((id): id is string => !!id))];
  if (!ids.length) return items;
  const checkpoints = await listCheckpoints();
  const byId = new Map(checkpoints.map((item) => [item.id, item]));
  return items.map((item) => {
    const checkpoint = item.cpId ? byId.get(item.cpId) : undefined;
    const code = interactionCpCode(checkpoint?.name);
    return {
      ...item,
      cpAtInteraction:
        code === "CP1"
        || code === "CP2"
        || code === "CP3"
        || code === "CP4"
        || code === "CP5"
        || code === "CP6"
          ? code
          : null,
    };
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
  return attachConversationCp(pages.map((page) => mapConversation(page))).then(sortConversations);
}

export function findConversationsByMessageId(messageId?: string | null) {
  return findConversationsByText("Message ID", messageId);
}

export function findConversationsByThreadId(threadId?: string | null) {
  return findConversationsByText("Thread ID", threadId);
}

export function findQuoCallConversation(callId: string) {
  return findConversationsByMessageId(`QUO_CALL:${callId}`);
}
