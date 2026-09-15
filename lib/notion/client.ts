import { getFollowupClientDbId, getNotionApiKey, NOTION_VERSION } from "./config";
import { ownerRelationFilter } from "./owner-filter";
import { notionRetry, runWithNotionLimit } from "./rate-limit";

const NOTION_API = "https://api.notion.com/v1";

type NotionRichText = { plain_text?: string };
type NotionUser = { id: string; name?: string | null };
type NotionDate = { start?: string | null } | null;
type NotionRollup = {
  type?: string;
  date?: NotionDate;
  array?: Array<{ type?: string; date?: NotionDate; title?: NotionRichText[] }>;
};

export type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  status?: { name?: string } | null;
  select?: { name?: string } | null;
  people?: NotionUser[];
  checkbox?: boolean;
  email?: string | null;
  url?: string | null;
  phone_number?: string | null;
  date?: NotionDate;
  relation?: Array<{ id: string }>;
  rollup?: NotionRollup;
  created_time?: string;
  last_edited_time?: string;
  number?: number | null;
};

export type NotionPage = {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
};

function notionHeaders() {
  const key = getNotionApiKey();
  if (!key) throw new Error("NOTION_API_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

export async function notionFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return runWithNotionLimit(() => notionFetchWithRetry<T>(path, init));
}

async function notionFetchWithRetry<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await notionRetry.fetchWithRetry(() => fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      ...notionHeaders(),
      ...(init?.headers || {}),
    },
  }));
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export function plainText(parts?: NotionRichText[]) {
  return (parts || []).map((part) => part.plain_text || "").join("").trim();
}

export function titleFromProperties(properties?: Record<string, NotionProperty>) {
  if (!properties) return "";
  for (const property of Object.values(properties)) {
    if (property.type === "title") return plainText(property.title);
  }
  return "";
}

export function propertyNumber(property?: NotionProperty) {
  return typeof property?.number === "number" ? property.number : null;
}

export function propertyText(property?: NotionProperty) {
  if (!property) return "";
  if (property.type === "title") return plainText(property.title);
  if (property.type === "rich_text") return plainText(property.rich_text);
  if (property.type === "status") return property.status?.name || "";
  if (property.type === "select") return property.select?.name || "";
  if (property.type === "email") return property.email || "";
  if (property.type === "url") return property.url || "";
  if (property.type === "phone_number") return property.phone_number || "";
  return "";
}

export function firstRelationId(property?: NotionProperty) {
  return property?.relation?.[0]?.id;
}

export function relationIds(property?: NotionProperty) {
  return (property?.relation || []).map((item) => item.id).filter(Boolean);
}

export function firstPerson(property?: NotionProperty) {
  const person = property?.people?.[0];
  if (!person) return { id: null, name: null };
  return { id: person.id, name: person.name || null };
}

export function propertyDate(property?: NotionProperty) {
  return property?.date?.start || property?.created_time || property?.last_edited_time || null;
}

export function rollupDate(property?: NotionProperty) {
  const rollup = property?.rollup;
  if (!rollup) return null;
  if (rollup.date?.start) return rollup.date.start;
  const nested = rollup.array?.find((item) => item.date?.start)?.date?.start;
  return nested || null;
}

export async function queryDatabasePages(
  databaseId: string,
  filter?: Record<string, unknown>,
) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        ...(filter ? { filter } : {}),
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export async function queryFollowupClientPages(ownerPageId?: string | null) {
  return queryDatabasePages(getFollowupClientDbId(), ownerRelationFilter(ownerPageId));
}

export async function retrievePage(pageId: string) {
  return notionFetch<NotionPage>(`/pages/${pageId}`);
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
) {
  return notionFetch<NotionPage>(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>,
) {
  return notionFetch<NotionPage>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });
}

export function richText(value: string) {
  const chunks = value.match(/[\s\S]{1,2000}/g) || [];
  return chunks.map((content) => ({ type: "text", text: { content } }));
}
