import type { BrandTask } from "../brand-list";
import { CHANNELS, type Channel, type ExistingTask, type TaskStatus } from "../scheduling-engine/types";
import {
  firstRelationId,
  notionFetch,
  propertyDate,
  propertyText,
  relationIds,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupTaskDbId } from "./config";
import { taskListFilter, type TaskListQuery } from "./owner-filter";
import { retrieveOwner, type FollowupOwner } from "./owners";

const CONTACT_TASK_KEYS = ["Follow-up Tasks", "Tasks"];

function relationFilter(property: string, ids: string[]) {
  if (ids.length === 1) {
    return { property, relation: { contains: ids[0] } };
  }
  return {
    or: ids.map((id) => ({
      property,
      relation: { contains: id },
    })),
  };
}

async function queryTaskPages(filter?: Record<string, unknown>) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupTaskDbId()}/query`, {
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

async function queryTasksByContacts(contactIds: string[]) {
  const pages: NotionPage[] = [];
  for (let index = 0; index < contactIds.length; index += 100) {
    pages.push(
      ...(await queryTaskPages(relationFilter("Follow-up Contact", contactIds.slice(index, index + 100)))),
    );
  }
  return pages;
}

async function listFromContactRelations(contactIds: string[]) {
  const taskIds = new Set<string>();
  const contacts = await Promise.all(
    contactIds.map((id) => retrievePage(id).catch(() => null)),
  );
  for (const page of contacts) {
    if (!page) continue;
    const properties = page.properties || {};
    for (const key of CONTACT_TASK_KEYS) {
      for (const id of relationIds(properties[key])) taskIds.add(id);
    }
  }
  const pages = await Promise.all(
    [...taskIds].map((id) => retrievePage(id).catch(() => null)),
  );
  return pages.filter((page): page is NotionPage => !!page);
}

type TaskCaches = {
  titles: Map<string, string>;
  owners: Map<string, FollowupOwner | null>;
  contacts: Map<string, NotionPage | null>;
  brands: Map<string, { id: string; name: string; ownerId: string | null } | null>;
};

function emptyCaches(): TaskCaches {
  return {
    titles: new Map(),
    owners: new Map(),
    contacts: new Map(),
    brands: new Map(),
  };
}

async function resolveContactPage(contactId: string | undefined, caches: TaskCaches) {
  if (!contactId) return null;
  if (caches.contacts.has(contactId)) return caches.contacts.get(contactId) || null;
  const page = await retrievePage(contactId).catch(() => null);
  caches.contacts.set(contactId, page);
  return page;
}

async function relatedTitle(pageId: string | undefined, caches: TaskCaches) {
  if (!pageId) return "";
  const cached = caches.titles.get(pageId);
  if (cached !== undefined) return cached;
  try {
    const page = await retrievePage(pageId);
    const title = titleFromProperties(page.properties);
    caches.titles.set(pageId, title);
    return title;
  } catch {
    caches.titles.set(pageId, "");
    return "";
  }
}

async function resolveBrandFromContact(contact: NotionPage | null, caches: TaskCaches) {
  const clientId = firstRelationId(contact?.properties?.["Follow-up Client"]);
  if (!clientId) return null;
  if (caches.brands.has(clientId)) return caches.brands.get(clientId) || null;
  try {
    const page = await retrievePage(clientId);
    const properties = page.properties || {};
    const name =
      (await relatedTitle(firstRelationId(properties.Client), caches)) ||
      titleFromProperties(properties) ||
      "Untitled Client";
    const mapped = {
      id: page.id,
      name,
      ownerId: firstRelationId(properties.Owner) || null,
    };
    caches.brands.set(clientId, mapped);
    return mapped;
  } catch {
    caches.brands.set(clientId, null);
    return null;
  }
}

async function contactDisplayName(contact: NotionPage | null, fallbackTitle: string) {
  if (!contact) return fallbackTitle || null;
  const keyPersonId = firstRelationId(contact.properties?.["Key Person"]);
  if (keyPersonId) {
    try {
      const person = await retrievePage(keyPersonId);
      return titleFromProperties(person.properties) || fallbackTitle || null;
    } catch {
      /* use contact title */
    }
  }
  return titleFromProperties(contact.properties) || fallbackTitle || null;
}

async function mapTaskPage(page: NotionPage, caches: TaskCaches): Promise<BrandTask> {
  const properties = page.properties || {};
  const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
  const ownerId = firstRelationId(properties.Owner) || null;
  const [contact, owner] = await Promise.all([
    resolveContactPage(contactId || undefined, caches),
    ownerId
      ? caches.owners.has(ownerId)
        ? Promise.resolve(caches.owners.get(ownerId) || null)
        : retrieveOwner(ownerId).then((value) => {
            caches.owners.set(ownerId, value);
            return value;
          })
      : Promise.resolve(null),
  ]);
  const brand = await resolveBrandFromContact(contact, caches);
  const contactTitle = titleFromProperties(contact?.properties);
  return {
    id: page.id,
    title: titleFromProperties(properties) || "Untitled Task",
    contactId,
    contactName: await contactDisplayName(contact, contactTitle),
    brandId: brand?.id || null,
    brandName: brand?.name || null,
    brandOwnerId: brand?.ownerId || null,
    ownerId: owner?.id || ownerId,
    ownerName: owner?.name || null,
    contactPhone: propertyText(contact?.properties?.Phone) || propertyText(contact?.properties?.["Phone Number"]) || null,
    channel: propertyText(properties.Channel) || null,
    status: propertyText(properties["Task Status"]) || null,
    priority: propertyText(properties.Priority) || null,
    creationMethod: propertyText(properties["Creation Method"]) || null,
    scheduledAt: propertyDate(properties["Scheduled At"]),
    endedAt: propertyDate(properties["Ended At"]),
    notes: propertyText(properties.Notes) || null,
    conversationIds: relationIds(properties.Conversations),
    templateId: firstRelationId(properties.Template) || null,
    sourceBombId: firstRelationId(properties["Source Bomb"]) || null,
  };
}

function sortTasks(tasks: BrandTask[]) {
  const closed = new Set(["Completed", "Failed", "Cancelled"]);
  return tasks.sort((a, b) => {
    const aClosed = closed.has(a.status || "");
    const bClosed = closed.has(b.status || "");
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    const left = a.scheduledAt || "";
    const right = b.scheduledAt || "";
    return left.localeCompare(right) || a.title.localeCompare(b.title);
  });
}

export async function listFollowupTasks(contactIds: string[]): Promise<BrandTask[]> {
  if (!contactIds.length) return [];
  let pages: NotionPage[] = [];
  try {
    pages = await queryTasksByContacts(contactIds);
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
  const caches = emptyCaches();
  const tasks = await Promise.all(pages.map((page) => mapTaskPage(page, caches)));
  return sortTasks(tasks);
}

export async function listFollowupTasksForViewer(query: TaskListQuery = {}) {
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(taskListFilter(query));
  } catch {
    pages = [];
  }
  const caches = emptyCaches();
  const tasks = await Promise.all(pages.map((page) => mapTaskPage(page, caches)));
  return sortTasks(tasks);
}

export async function retrieveFollowupTask(pageId: string) {
  const page = await retrievePage(pageId);
  return mapTaskPage(page, emptyCaches());
}

const NOTION_PAGE_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function isNotionPageId(value: string) {
  return NOTION_PAGE_ID.test(value.trim());
}

export function normalizeTaskTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[—–−-]+/g, "-");
}

export function taskMatchesRef(task: Pick<BrandTask, "id" | "title">, ref: string) {
  const value = ref.trim();
  if (!value) return false;
  const compactId = task.id.replace(/-/g, "");
  const compactRef = value.replace(/-/g, "");
  if (task.id === value || compactId === compactRef) return true;
  return normalizeTaskTitle(task.title) === normalizeTaskTitle(value);
}

export async function findFollowupTasksByTitle(title: string): Promise<BrandTask[]> {
  const query = title.trim();
  if (!query) return [];
  const pages = await queryTaskPages({
    property: "Follow-up Task",
    title: { equals: query },
  });
  const caches = emptyCaches();
  return Promise.all(pages.map((page) => mapTaskPage(page, caches)));
}

const TASK_STATUSES = new Set<TaskStatus>([
  "Pending",
  "In Progress",
  "Completed",
  "Failed",
  "Cancelled",
]);

export async function listExistingTasksForSchedule(): Promise<ExistingTask[]> {
  const pages = await queryTaskPages();
  const caches = emptyCaches();
  const tasks = await Promise.all(pages.map((page) => mapTaskPage(page, caches)));
  return tasks.flatMap((task) => {
    const channel = task.channel;
    const scheduledAt = task.scheduledAt?.slice(0, 10);
    const status = task.status as TaskStatus | null;
    if (!task.brandId || !scheduledAt || !status || !TASK_STATUSES.has(status)) return [];
    if (!channel || !CHANNELS.includes(channel as Channel)) return [];
    return [{
      clientId: task.brandId,
      contactId: task.contactId || undefined,
      channel: channel as Channel,
      scheduledAt,
      status,
    }];
  });
}
