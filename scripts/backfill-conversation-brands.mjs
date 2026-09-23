const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const CONVERSATION_DB_ID =
  process.env.NOTION_FOLLOWUP_CONVERSATION_DB_ID ||
  "a7ded397-b23f-47f1-a911-3855fc3d10ce";

const key = process.env.NOTION_API_KEY;
if (!key) throw new Error("NOTION_API_KEY is not configured");

const headers = {
  Authorization: `Bearer ${key}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json",
};

async function notionFetch(path, init = {}) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    if (response.ok) return response.json();
    const body = await response.text();
    if (![429, 502, 503, 504].includes(response.status) || attempt === 5) {
      throw new Error(`Notion ${response.status}: ${body.slice(0, 300)}`);
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter)
      ? retryAfter * 1000
      : Math.min(400 * 2 ** (attempt - 1), 8_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function listMissingConversations() {
  const pages = [];
  let cursor;
  do {
    const data = await notionFetch(`/databases/${CONVERSATION_DB_ID}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: {
          and: [
            { property: "Follow-up Client", relation: { is_empty: true } },
            { property: "Follow-up Contact", relation: { is_not_empty: true } },
          ],
        },
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

const contactBrandCache = new Map();

async function brandIdForContact(contactId) {
  if (contactBrandCache.has(contactId)) return contactBrandCache.get(contactId);
  const contact = await notionFetch(`/pages/${contactId}`);
  const brandId =
    contact.properties?.["Follow-up Client"]?.relation?.[0]?.id || null;
  contactBrandCache.set(contactId, brandId);
  return brandId;
}

const conversations = await listMissingConversations();
let updated = 0;
let unresolved = 0;

for (const conversation of conversations) {
  const contactId =
    conversation.properties?.["Follow-up Contact"]?.relation?.[0]?.id || null;
  const brandId = contactId ? await brandIdForContact(contactId) : null;
  if (!brandId) {
    unresolved += 1;
    continue;
  }
  await notionFetch(`/pages/${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Follow-up Client": { relation: [{ id: brandId }] },
      },
    }),
  });
  updated += 1;
}

const remaining = await listMissingConversations();
console.log(
  JSON.stringify(
    {
      found: conversations.length,
      updated,
      unresolved,
      remaining: remaining.length,
    },
    null,
    2,
  ),
);
