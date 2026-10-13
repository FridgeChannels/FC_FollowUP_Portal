import { notionFetch, propertyText, richText, titleFromProperties, updatePage, type NotionPage } from "./client";
import { getFollowupOwnerDbId } from "./config";
import { isAdminRole, ownerRoleFromRecord, type PortalRole } from "./owner-role";

export type FollowupOwner = {
  id: string;
  name: string;
  account: string | null;
  role: PortalRole;
  isAdmin: boolean;
  status: string;
};

export type OwnerLogin = FollowupOwner & {
  passwordHash: string | null;
};

function mapOwner(page: NotionPage): FollowupOwner {
  const properties = page.properties || {};
  const role = ownerRoleFromRecord(propertyText(properties.Role));
  return {
    id: page.id,
    name: titleFromProperties(properties) || "Untitled Owner",
    account: propertyText(properties.Account) || null,
    role,
    isAdmin: isAdminRole(role),
    status: propertyText(properties["Owner Status"]),
  };
}

function isMissingObject(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("object_not_found") || error.message.includes("Could not find database"))
  );
}

const OWNER_DB_SHARE_ERROR =
  "Share FC3.0-Follow-up-OwnerDB with the Notion integration so Portal can match Owner Account emails.";

async function findOwnerPageByAccount(email?: string | null) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getFollowupOwnerDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        filter: {
          property: "Account",
          rich_text: { equals: normalized },
        },
      }),
    },
  );
  const matched = data.results.find(
    (page) => mapOwner(page).account?.trim().toLowerCase() === normalized,
  );
  if (matched) return matched;
  const pages = await queryOwnerPagesRaw();
  return pages.find((page) => mapOwner(page).account?.trim().toLowerCase() === normalized) || null;
}

async function queryOwnerPagesRaw() {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupOwnerDbId()}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export async function queryOwnerPages() {
  return (await queryOwnerPagesRaw()).map(mapOwner);
}

/**
 * Viewer identity is resolved on every authenticated request, and each miss
 * costs a Notion query (plus a full owner-DB scan when the Account filter finds
 * nothing). The identity behind an email changes rarely, so it is cached and
 * concurrent lookups for the same account share one request.
 */
const OWNER_LOOKUP_CACHE_MS = 60_000;
const ownerLookupCache = new Map<
  string,
  { at: number; owner: FollowupOwner | null }
>();
const ownerLookupPending = new Map<string, Promise<FollowupOwner | null>>();

export async function findOwnerByAccount(email?: string | null) {
  const key = email?.trim().toLowerCase() || "";
  if (!key) return null;
  const cached = ownerLookupCache.get(key);
  if (cached && Date.now() - cached.at < OWNER_LOOKUP_CACHE_MS) {
    return cached.owner;
  }
  const pending = ownerLookupPending.get(key);
  if (pending) return pending;
  const task = (async () => {
    try {
      const page = await findOwnerPageByAccount(email);
      return page ? mapOwner(page) : null;
    } catch (error) {
      if (isMissingObject(error)) throw new Error(OWNER_DB_SHARE_ERROR);
      throw error;
    }
  })();
  ownerLookupPending.set(key, task);
  try {
    const owner = await task;
    ownerLookupCache.set(key, { at: Date.now(), owner });
    return owner;
  } finally {
    if (ownerLookupPending.get(key) === task) ownerLookupPending.delete(key);
  }
}

export async function findOwnerLoginByAccount(email?: string | null): Promise<OwnerLogin | null> {
  try {
    const page = await findOwnerPageByAccount(email);
    if (!page) return null;
    return {
      ...mapOwner(page),
      passwordHash: propertyText(page.properties?.["Password Hash"]) || null,
    };
  } catch (error) {
    if (isMissingObject(error)) throw new Error(OWNER_DB_SHARE_ERROR);
    throw error;
  }
}

export async function updateOwnerPasswordHash(ownerId: string, passwordHash: string) {
  await updatePage(ownerId, {
    "Password Hash": { rich_text: richText(passwordHash) },
  });
}

export async function retrieveOwner(pageId?: string | null) {
  if (!pageId) return null;
  try {
    const page = await notionFetch<NotionPage>(`/pages/${pageId}`);
    return mapOwner(page);
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}
