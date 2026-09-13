import { notionFetch } from "./client";

export type NotionWorkspaceUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type NotionUserResponse = {
  id: string;
  name?: string | null;
  type?: string;
  email?: string | null;
  person?: { email?: string | null };
};

export async function listNotionUsers() {
  const users: NotionWorkspaceUser[] = [];
  let cursor: string | undefined;
  do {
    const search = new URLSearchParams({ page_size: "100" });
    if (cursor) search.set("start_cursor", cursor);
    const data = await notionFetch<{
      results: NotionUserResponse[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/users?${search.toString()}`);
    for (const user of data.results) {
      if (user.type && user.type !== "person") continue;
      users.push({
        id: user.id,
        name: user.name || null,
        email: user.person?.email || user.email || null,
      });
    }
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return users;
}

export async function findNotionUserByEmail(email?: string | null) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const users = await listNotionUsers();
  return (
    users.find((user) => user.email?.trim().toLowerCase() === normalized) || null
  );
}

export function notionUserMap(users: NotionWorkspaceUser[]) {
  return new Map(users.map((user) => [user.id, user]));
}
