import { notionFetch, propertyText, titleFromProperties, type NotionPage } from "./client";
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

export async function queryOwnerPages() {
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
  return pages.map(mapOwner);
}

function isMissingObject(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("object_not_found") || error.message.includes("Could not find database"))
  );
}

const OWNER_DB_SHARE_ERROR =
  "Share FC3.0-Follow-up-OwnerDB with the Notion integration so Portal can match Owner Account emails.";

export async function findOwnerByAccount(email?: string | null) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  try {
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

    const matched = data.results
      .map(mapOwner)
      .find((owner) => owner.account?.trim().toLowerCase() === normalized);
    if (matched) return matched;

    return (
      (await queryOwnerPages()).find(
        (owner) => owner.account?.trim().toLowerCase() === normalized,
      ) || null
    );
  } catch (error) {
    if (isMissingObject(error)) throw new Error(OWNER_DB_SHARE_ERROR);
    throw error;
  }
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
