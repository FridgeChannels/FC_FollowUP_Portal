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
import { taskListFilter, type TaskListQuery, DEFAULT_TASK_PAGE_SIZE } from "./owner-filter";
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

export { DEFAULT_TASK_PAGE_SIZE };

const TASK_LIST_SORTS = [{ property: "Scheduled At", direction: "ascending" as const }];

async function queryTaskPagesOnce(options: {
  filter?: Record<string, unknown>;
  startCursor?: string | null;
  pageSize?: number;
  sorts?: Array<{ property: string; direction: "ascending" | "descending" }>;
}) {
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_TASK_PAGE_SIZE, 1), 100);
  const data = await notionFetch<{
    results: NotionPage[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>(`/databases/${getFollowupTaskDbId()}/query`, {
    method: "POST",
    body: JSON.stringify({
      page_size: pageSize,
      ...(options.startCursor ? { start_cursor: options.startCursor } : {}),
      ...(options.filter ? { filter: options.filter } : {}),
      ...(options.sorts?.length ? { sorts: options.sorts } : {}),
    }),
  });
  const nextCursor = data.has_more && data.next_cursor ? data.next_cursor : null;
  return {
    pages: data.results,
    nextCursor,
    hasMore: Boolean(nextCursor && data.results.length >= pageSize),
  };
}

async function queryTaskPages(filter?: Record<string, unknown>) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const batch = await queryTaskPagesOnce({
      filter,
      startCursor: cursor,
      pageSize: 100,
    });
    pages.push(...batch.pages);
    cursor = batch.nextCursor || undefined;
  } while (cursor);
  return pages;
}

function stubTaskFromPage(page: NotionPage): BrandTask {
  const properties = page.properties || {};
  return {
    id: page.id,
    title: titleFromProperties(properties) || "Untitled Task",
    contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    contactName: null,
    brandId: null,
    brandName: null,
    brandOwnerId: null,
    ownerId: firstRelationId(properties.Owner) || null,
    ownerName: null,
    channel: propertyText(properties.Channel) || null,
    status: propertyText(properties["Task Status"]) || null,
    priority: propertyText(properties.Priority) || null,
    creationMethod: null,
    scheduledAt: propertyDate(properties["Scheduled At"]),
    endedAt: null,
    createdAt: page.created_time || null,
    notes: null,
    conversationIds: [],
    templateId: null,
    sourceBombId: null,
  };
}

async function countTaskPages(filter?: Record<string, unknown>) {
  let count = 0;
  let cursor: string | undefined;
  do {
    const batch = await queryTaskPagesOnce({
      filter,
      startCursor: cursor,
      pageSize: 100,
    });
    count += batch.pages.length;
    cursor = batch.nextCursor || undefined;
  } while (cursor);
  return count;
}

/** Open Phone count — page IDs only, no Contact/Brand mapping. */
export async function countOpenPhoneTasksForViewer(query: TaskListQuery) {
  return countTaskPages(
    taskListFilter({
      ...query,
      channel: "Phone",
      channels: undefined,
      statusScope: "open",
    }),
  );
}

/**
 * Open Phone brand count for Caller ReplyTask badge.
 * Same brand with multiple Phone tasks counts as 1.
 */
export async function countOpenPhoneBrandsForViewer(query: TaskListQuery) {
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(
      taskListFilter({
        ...query,
        channel: "Phone",
        channels: undefined,
        statusScope: "open",
      }),
    );
  } catch {
    return 0;
  }
  if (!pages.length) return 0;

  const contactIds = [
    ...new Set(
      pages
        .map((page) => firstRelationId(page.properties?.["Follow-up Contact"]) || null)
        .filter((id): id is string => !!id),
    ),
  ];
  const brandByContact = new Map<string, string | null>();
  await Promise.all(
    contactIds.map(async (contactId) => {
      try {
        const contact = await retrievePage(contactId);
        brandByContact.set(
          contactId,
          firstRelationId(contact.properties?.["Follow-up Client"]) || null,
        );
      } catch {
        brandByContact.set(contactId, null);
      }
    }),
  );

  const keys = new Set<string>();
  for (const page of pages) {
    const contactId = firstRelationId(page.properties?.["Follow-up Contact"]) || null;
    const brandId = contactId ? brandByContact.get(contactId) : null;
    if (brandId) keys.add(`brand:${brandId}`);
    else if (contactId) keys.add(`contact:${contactId}`);
    else keys.add(`task:${page.id}`);
  }
  return keys.size;
}

/**
 * Open non-Phone task stubs for badge Needs Reply annotation.
 * Reads Task properties only — skips Contact/Brand N+1.
 */
export async function listOpenReplyTaskStubsForViewer(query: TaskListQuery) {
  const replyChannels = CHANNELS.filter((channel) => channel !== "Phone");
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(
      taskListFilter({
        ...query,
        channel: undefined,
        channels: [...replyChannels],
        statusScope: "open",
      }),
    );
  } catch {
    pages = [];
  }
  return pages.map(stubTaskFromPage);
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

function keyPersonCacheKey(keyPersonId: string) {
  return `key-person:${keyPersonId}`;
}

async function prefetchContactEntries(
  entries: Array<{ cacheKey: string; pageId: string }>,
  caches: TaskCaches,
) {
  const pending = entries.filter((entry) => !caches.contacts.has(entry.cacheKey));
  await Promise.all(
    pending.map(async (entry) => {
      const page = await retrievePage(entry.pageId).catch(() => null);
      caches.contacts.set(entry.cacheKey, page);
    }),
  );
}

async function prefetchOwners(ownerIds: string[], caches: TaskCaches) {
  const unique = [...new Set(ownerIds)].filter((id) => !caches.owners.has(id));
  await Promise.all(
    unique.map(async (ownerId) => {
      caches.owners.set(ownerId, await retrieveOwner(ownerId));
    }),
  );
}

async function prefetchTitles(pageIds: string[], caches: TaskCaches) {
  const unique = [...new Set(pageIds)].filter((id) => id && !caches.titles.has(id));
  await Promise.all(
    unique.map(async (pageId) => {
      try {
        const page = await retrievePage(pageId);
        caches.titles.set(pageId, titleFromProperties(page.properties));
      } catch {
        caches.titles.set(pageId, "");
      }
    }),
  );
}

async function prefetchBrands(clientIds: string[], caches: TaskCaches) {
  const unique = [...new Set(clientIds)].filter((id) => id && !caches.brands.has(id));
  if (!unique.length) return;

  const clientPages = await Promise.all(
    unique.map(async (clientId) => {
      const page = await retrievePage(clientId).catch(() => null);
      return { clientId, page };
    }),
  );

  const titleIds = clientPages
    .map(({ page }) => firstRelationId(page?.properties?.Client))
    .filter((id): id is string => !!id);
  await prefetchTitles(titleIds, caches);

  for (const { clientId, page } of clientPages) {
    if (!page) {
      caches.brands.set(clientId, null);
      continue;
    }
    const properties = page.properties || {};
    const clientTitleId = firstRelationId(properties.Client);
    const name =
      (clientTitleId ? caches.titles.get(clientTitleId) : "") ||
      titleFromProperties(properties) ||
      "Untitled Client";
    caches.brands.set(clientId, {
      id: page.id,
      name,
      ownerId: firstRelationId(properties.Owner) || null,
    });
  }
}

/** Prefetch Contact / Owner / Brand / KeyPerson once per page batch to avoid N+1 races. */
async function warmCachesForTaskPages(
  pages: NotionPage[],
  caches: TaskCaches,
  hints?: TaskResolveHints,
) {
  if (hints?.brand) caches.brands.set(hints.brand.id, hints.brand);

  const contactIds: string[] = [];
  const ownerIds: string[] = [];
  for (const page of pages) {
    const properties = page.properties || {};
    const contactId = firstRelationId(properties["Follow-up Contact"]);
    if (
      contactId &&
      (!hints?.contactsById?.has(contactId) || !hints?.brand)
    ) {
      contactIds.push(contactId);
    }
    const ownerId = firstRelationId(properties.Owner);
    if (ownerId) ownerIds.push(ownerId);
  }

  await Promise.all([
    prefetchContactEntries(
      [...new Set(contactIds)].map((id) => ({ cacheKey: id, pageId: id })),
      caches,
    ),
    prefetchOwners(ownerIds, caches),
  ]);

  const keyPersonEntries: Array<{ cacheKey: string; pageId: string }> = [];
  const brandClientIds: string[] = [];
  for (const contactId of new Set(contactIds)) {
    const contact = caches.contacts.get(contactId) || null;
    if (!hints?.contactsById?.has(contactId)) {
      const keyPersonId = firstRelationId(contact?.properties?.["Key Person"]);
      if (keyPersonId) {
        keyPersonEntries.push({
          cacheKey: keyPersonCacheKey(keyPersonId),
          pageId: keyPersonId,
        });
      }
    }
    if (!hints?.brand) {
      const clientId = firstRelationId(contact?.properties?.["Follow-up Client"]);
      if (clientId) brandClientIds.push(clientId);
    }
  }

  await Promise.all([
    prefetchContactEntries(keyPersonEntries, caches),
    hints?.brand ? Promise.resolve() : prefetchBrands(brandClientIds, caches),
  ]);
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

function phoneFromProperties(properties?: NotionPage["properties"]) {
  return propertyText(properties?.Phone) || propertyText(properties?.["Phone Number"]) || null;
}

async function resolveKeyPerson(contact: NotionPage | null, caches: TaskCaches) {
  const keyPersonId = firstRelationId(contact?.properties?.["Key Person"]);
  if (!keyPersonId) return null;
  const cacheKey = keyPersonCacheKey(keyPersonId);
  if (caches.contacts.has(cacheKey)) return caches.contacts.get(cacheKey) || null;
  const page = await retrievePage(keyPersonId).catch(() => null);
  caches.contacts.set(cacheKey, page);
  return page;
}

async function contactDisplayName(contact: NotionPage | null, fallbackTitle: string, caches: TaskCaches) {
  const person = await resolveKeyPerson(contact, caches);
  if (person) return titleFromProperties(person.properties) || fallbackTitle || null;
  return titleFromProperties(contact?.properties) || fallbackTitle || null;
}

async function contactPhoneNumber(contact: NotionPage | null, caches: TaskCaches) {
  const direct = phoneFromProperties(contact?.properties);
  if (direct) return direct;
  const person = await resolveKeyPerson(contact, caches);
  return phoneFromProperties(person?.properties);
}

export type TaskResolveHints = {
  /** Skip Contact/KeyPerson retrieves when the detail path already loaded contacts. */
  contactsById?: Map<string, { name: string | null; phone: string | null }>;
  /** Skip Follow-up Client retrieves when mapping tasks for a known brand. */
  brand?: { id: string; name: string; ownerId: string | null };
};

async function mapTaskPage(
  page: NotionPage,
  caches: TaskCaches,
  hints?: TaskResolveHints,
): Promise<BrandTask> {
  const properties = page.properties || {};
  const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
  const ownerId = firstRelationId(properties.Owner) || null;
  const hintedContact = contactId ? hints?.contactsById?.get(contactId) : undefined;
  const owner = ownerId
    ? caches.owners.has(ownerId)
      ? caches.owners.get(ownerId) || null
      : await retrieveOwner(ownerId).then((value) => {
          caches.owners.set(ownerId, value);
          return value;
        })
    : null;

  let contactName = hintedContact?.name ?? null;
  let contactPhone = hintedContact?.phone ?? null;
  let brand = hints?.brand || null;

  if (!hintedContact || !brand) {
    const contact = await resolveContactPage(contactId || undefined, caches);
    if (!brand) brand = await resolveBrandFromContact(contact, caches);
    if (!hintedContact) {
      const contactTitle = titleFromProperties(contact?.properties);
      const [resolvedName, resolvedPhone] = await Promise.all([
        contactDisplayName(contact, contactTitle, caches),
        contactPhoneNumber(contact, caches),
      ]);
      contactName = resolvedName;
      contactPhone = resolvedPhone;
    }
  }

  return {
    id: page.id,
    title: titleFromProperties(properties) || "Untitled Task",
    contactId,
    contactName,
    brandId: brand?.id || null,
    brandName: brand?.name || null,
    brandOwnerId: brand?.ownerId || null,
    ownerId: owner?.id || ownerId,
    ownerName: owner?.name || null,
    contactPhone,
    channel: propertyText(properties.Channel) || null,
    status: propertyText(properties["Task Status"]) || null,
    priority: propertyText(properties.Priority) || null,
    creationMethod: propertyText(properties["Creation Method"]) || null,
    scheduledAt: propertyDate(properties["Scheduled At"]),
    endedAt: propertyDate(properties["Ended At"]),
    createdAt: page.created_time || null,
    notes: propertyText(properties.Notes) || null,
    conversationIds: relationIds(properties.Conversations),
    templateId: firstRelationId(properties.Template) || null,
    sourceBombId: firstRelationId(properties["Source Bomb"]) || null,
    omniReachRunId: propertyText(properties["OmniReach Run Id"]) || null,
    callReviewStatus: asCallReviewStatus(propertyText(properties["Call Review Status"])),
  };
}

async function mapTaskPages(pages: NotionPage[], hints?: TaskResolveHints) {
  const caches = emptyCaches();
  await warmCachesForTaskPages(pages, caches, hints);
  return Promise.all(pages.map((page) => mapTaskPage(page, caches, hints)));
}

function asCallReviewStatus(value?: string | null): BrandTask["callReviewStatus"] {
  if (value === "Awaiting Review" || value === "Qualified" || value === "Unqualified") return value;
  return null;
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

export async function listFollowupTasks(
  contactIds: string[],
  hints?: TaskResolveHints,
): Promise<BrandTask[]> {
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
  const tasks = await mapTaskPages(pages, hints);
  return sortTasks(tasks);
}

/** Open Source-Bomb tasks for a brand — property scan only, no Contact/Owner hydrate. */
export async function hasOpenOmniReachTasks(contactIds: string[]): Promise<boolean> {
  if (!contactIds.length) return false;
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
  return pages.some((page) => {
    const properties = page.properties || {};
    const status = propertyText(properties["Task Status"]);
    const sourceBombId = firstRelationId(properties["Source Bomb"]);
    return !!sourceBombId && (status === "Pending" || status === "In Progress");
  });
}

export type ContactBombTaskLite = {
  id: string;
  status: string | null;
  notes: string | null;
  sourceBombId: string | null;
  omniReachRunId: string | null;
  contactId: string | null;
};

/** Property-only task rows for a contact — used by Stop OmniReach. */
export async function listContactBombTasksLite(contactId: string): Promise<ContactBombTaskLite[]> {
  if (!contactId) return [];
  let pages: NotionPage[] = [];
  try {
    pages = await queryTasksByContacts([contactId]);
  } catch {
    pages = [];
  }
  if (!pages.length) {
    try {
      pages = await listFromContactRelations([contactId]);
    } catch {
      pages = [];
    }
  }
  return pages.map((page) => {
    const properties = page.properties || {};
    return {
      id: page.id,
      status: propertyText(properties["Task Status"]) || null,
      notes: propertyText(properties.Notes) || null,
      sourceBombId: firstRelationId(properties["Source Bomb"]) || null,
      omniReachRunId: propertyText(properties["OmniReach Run Id"]) || null,
      contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    };
  });
}

export async function listFollowupTasksByBomb(bombId: string): Promise<BrandTask[]> {
  const pages = await queryTaskPages({
    property: "Source Bomb",
    relation: { contains: bombId },
  });
  return sortTasks(await mapTaskPages(pages));
}

export async function listFollowupTasksForViewer(query: TaskListQuery = {}) {
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(taskListFilter(query));
  } catch {
    pages = [];
  }
  return sortTasks(await mapTaskPages(pages));
}

export async function listFollowupTasksForViewerPage(
  query: TaskListQuery = {},
  options: { cursor?: string | null; pageSize?: number } = {},
) {
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_TASK_PAGE_SIZE, 1), 100);
  let batch = { pages: [] as NotionPage[], nextCursor: null as string | null, hasMore: false };
  try {
    batch = await queryTaskPagesOnce({
      filter: taskListFilter(query),
      startCursor: options.cursor,
      pageSize,
      sorts: TASK_LIST_SORTS,
    });
  } catch {
    batch = { pages: [], nextCursor: null, hasMore: false };
  }
  const tasks = await mapTaskPages(batch.pages);
  return {
    tasks,
    nextCursor: batch.nextCursor,
    hasMore: batch.hasMore,
    pageSize,
  };
}

export async function retrieveFollowupTask(pageId: string) {
  const page = await retrievePage(pageId);
  const [task] = await mapTaskPages([page]);
  return task;
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
  return mapTaskPages(pages);
}

const TASK_STATUSES = new Set<TaskStatus>([
  "Pending",
  "In Progress",
  "Completed",
  "Failed",
  "Cancelled",
]);

export async function listExistingTasksForSchedule(): Promise<ExistingTask[]> {
  // Capacity only cares about non-cancelled tasks; skip Cancelled to shrink the scan.
  const pages = await queryTaskPages({
    property: "Task Status",
    status: { does_not_equal: "Cancelled" },
  });

  const brandByContact = new Map<string, string | null>();
  const contactIds = [
    ...new Set(
      pages
        .map((page) => firstRelationId(page.properties?.["Follow-up Contact"]) || null)
        .filter((id): id is string => !!id),
    ),
  ];

  await Promise.all(
    contactIds.map(async (contactId) => {
      try {
        const contact = await retrievePage(contactId);
        brandByContact.set(
          contactId,
          firstRelationId(contact.properties?.["Follow-up Client"]) || null,
        );
      } catch {
        brandByContact.set(contactId, null);
      }
    }),
  );

  return pages.flatMap((page) => {
    const properties = page.properties || {};
    const channel = propertyText(properties.Channel);
    const scheduledAt = propertyDate(properties["Scheduled At"]) || null;
    const status = propertyText(properties["Task Status"]) as TaskStatus | null;
    const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
    const clientId = contactId ? brandByContact.get(contactId) : null;
    if (!clientId || !scheduledAt || !status || !TASK_STATUSES.has(status)) return [];
    if (!channel || !CHANNELS.includes(channel as Channel)) return [];
    return [{
      clientId,
      contactId: contactId || undefined,
      channel: channel as Channel,
      scheduledAt,
      status,
    }];
  });
}
