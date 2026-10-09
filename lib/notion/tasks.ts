import type { BrandTask } from "../brand-list";
import { isLinkedInColdCapacityTask } from "../linkedin/notes.ts";
import { CHANNELS, type Channel, type ExistingTask, type TaskStatus } from "../scheduling-engine/types";
import {
  firstRelationId,
  isTestFollowupClientPage,
  notionFetch,
  propertyDate,
  propertyText,
  queryTestFollowupClientIds,
  relationIds,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupTaskDbId } from "./config";
import { taskListFilter, type TaskListQuery, DEFAULT_TASK_PAGE_SIZE } from "./owner-filter";
import { retrieveOwner, type FollowupOwner } from "./owners";
import { historyFromTask } from "../call-review-history";
import { listNeedsReplyConversations } from "./conversations";
import { annotateTasksWithReplyInbox, isOpenTaskStatus } from "./reply-inbox";
import { callerListTaskFromPage } from "./tasks-caller-list";
import { compareOpenTaskOrder, mergeOpenTaskStubs } from "./open-task-order";
import {
  callerBrandKey,
  encodeCallerListCursor,
  parseCallerListCursor,
  type CallerListBufferStub,
} from "./caller-list-cursor";

const CONTACT_TASK_KEYS = ["Follow-up Tasks", "Tasks"];
const DASHBOARD_TASK_CACHE_MS = 30_000;
const dashboardTaskCache = new Map<string, { expiresAt: number; task: BrandTask }>();

function taskCacheKey(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

function cacheDashboardTasks(tasks: BrandTask[]) {
  const expiresAt = Date.now() + DASHBOARD_TASK_CACHE_MS;
  for (const task of tasks) {
    dashboardTaskCache.set(taskCacheKey(task.id), { expiresAt, task });
  }
}

/** Reuses task metadata that was just loaded for the Qualified dashboard. */
export function getWarmDashboardTask(id: string) {
  const key = taskCacheKey(id);
  const cached = dashboardTaskCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    dashboardTaskCache.delete(key);
    return null;
  }
  return cached.task;
}

function callerListStubFromPage(
  page: NotionPage,
  brandId?: string | null,
): CallerListBufferStub {
  const properties = page.properties || {};
  return {
    id: page.id,
    created_time: page.created_time || null,
    title: titleFromProperties(properties) || "Untitled Task",
    brandId:
      brandId || firstRelationId(properties["Follow-up Client"]) || null,
    contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    ownerId: firstRelationId(properties.Owner) || null,
    channel: propertyText(properties.Channel) || null,
    status: propertyText(properties["Task Status"]) || null,
    priority: propertyText(properties.Priority) || null,
    scheduledAt: propertyDate(properties["Scheduled At"]),
    endedAt: propertyDate(properties["Ended At"]),
    creationMethod: propertyText(properties["Creation Method"]) || null,
    callReviewStatus: propertyText(properties["Call Review Status"]) || null,
    callReviewReason: propertyText(properties["Call Review Reason"]) || null,
    callQualifiedAt: propertyDate(properties["Call Qualified At"]),
    templateId: firstRelationId(properties.Template) || null,
    sourceBombId: firstRelationId(properties["Source Bomb"]) || null,
    omniReachRunId: propertyText(properties["OmniReach Run Id"]) || null,
  };
}

function notionPageFromCallerListStub(stub: CallerListBufferStub): NotionPage {
  return {
    id: stub.id,
    created_time: stub.created_time || undefined,
    properties: {
      "Follow-up Task": {
        type: "title",
        title: [{ plain_text: stub.title }],
      },
      "Follow-up Client": {
        type: "relation",
        relation: stub.brandId ? [{ id: stub.brandId }] : [],
      },
      "Follow-up Contact": {
        type: "relation",
        relation: stub.contactId ? [{ id: stub.contactId }] : [],
      },
      Owner: {
        type: "relation",
        relation: stub.ownerId ? [{ id: stub.ownerId }] : [],
      },
      Channel: {
        type: "select",
        select: stub.channel ? { name: stub.channel } : null,
      },
      "Task Status": {
        type: "status",
        status: stub.status ? { name: stub.status } : null,
      },
      Priority: {
        type: "select",
        select: stub.priority ? { name: stub.priority } : null,
      },
      "Scheduled At": {
        type: "date",
        date: stub.scheduledAt ? { start: stub.scheduledAt } : null,
      },
      "Ended At": {
        type: "date",
        date: stub.endedAt ? { start: stub.endedAt } : null,
      },
      "Creation Method": {
        type: "select",
        select: stub.creationMethod ? { name: stub.creationMethod } : null,
      },
      "Call Review Status": {
        type: "select",
        select: stub.callReviewStatus ? { name: stub.callReviewStatus } : null,
      },
      "Call Review Reason": {
        type: "rich_text",
        rich_text: stub.callReviewReason
          ? [{ plain_text: stub.callReviewReason }]
          : [],
      },
      "Call Qualified At": {
        type: "date",
        date: stub.callQualifiedAt ? { start: stub.callQualifiedAt } : null,
      },
      Template: {
        type: "relation",
        relation: stub.templateId ? [{ id: stub.templateId }] : [],
      },
      "Source Bomb": {
        type: "relation",
        relation: stub.sourceBombId ? [{ id: stub.sourceBombId }] : [],
      },
      "OmniReach Run Id": {
        type: "rich_text",
        rich_text: stub.omniReachRunId
          ? [{ plain_text: stub.omniReachRunId }]
          : [],
      },
    },
  } as NotionPage;
}

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
    brandId: firstRelationId(properties["Follow-up Client"]) || null,
    brandName: null,
    brandOwnerId: null,
    brandIsTest: false,
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

async function brandIdsByContact(contactIds: string[]) {
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
  return brandByContact;
}

async function brandIdsByTaskPage(pages: NotionPage[]) {
  const brandByTask = new Map<string, string | null>();
  const unresolved = pages.filter((page) => {
    const brandId = firstRelationId(page.properties?.["Follow-up Client"]);
    if (!brandId) return true;
    brandByTask.set(page.id, brandId);
    return false;
  });
  const contactIds = [
    ...new Set(
      unresolved
        .map((page) =>
          firstRelationId(page.properties?.["Follow-up Contact"]),
        )
        .filter((id): id is string => !!id),
    ),
  ];
  const brandByContact = await brandIdsByContact(contactIds);
  for (const page of unresolved) {
    const contactId = firstRelationId(
      page.properties?.["Follow-up Contact"],
    );
    brandByTask.set(
      page.id,
      (contactId ? brandByContact.get(contactId) : null) || null,
    );
  }
  return brandByTask;
}

type TestBrandScope = { includeTest?: boolean; onlyTest?: boolean };

/** Keep / drop task pages by Follow-up Client `Is Test`. */
async function scopeTestBrandTaskPages(pages: NotionPage[], options: TestBrandScope) {
  if (!pages.length) return pages;
  if (!options.onlyTest && options.includeTest) return pages;

  const testIds = await queryTestFollowupClientIds().catch(() => new Set<string>());
  if (!testIds.size) return options.onlyTest ? [] : pages;

  const brandByTask = await brandIdsByTaskPage(pages);

  return pages.filter((page) => {
    const brandId = brandByTask.get(page.id);
    if (!brandId) return !options.onlyTest;
    return options.onlyTest ? testIds.has(brandId) : !testIds.has(brandId);
  });
}

function scopeTestBrandTasks(tasks: BrandTask[], options: TestBrandScope) {
  if (options.onlyTest) return tasks.filter((task) => Boolean(task.brandIsTest));
  if (!options.includeTest) return tasks.filter((task) => !task.brandIsTest);
  return tasks;
}

/** Every open Phone task, including test clients. Phone-line lookup only. */
export async function listOpenPhoneTasks() {
  const pages = await queryTaskPages(
    taskListFilter({ channel: "Phone", statusScope: "open" }),
  );
  return mapTaskPages(pages);
}

/** Open Phone count — optionally excludes / restricts to `Is Test` Follow-up Clients. */
export async function listOpenPhoneTaskStubsForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
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
    return [];
  }
  pages = await scopeTestBrandTaskPages(pages, options);
  return pages.map(stubTaskFromPage);
}

/** Open Phone count — optionally excludes / restricts to `Is Test` Follow-up Clients. */
export async function countOpenPhoneTasksForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
  return (await listOpenPhoneTaskStubsForViewer(query, options)).length;
}

const OPEN_PHONE_BRAND_COUNT_CACHE_MS = 30_000;
const openPhoneBrandCountCache = new Map<
  string,
  { expiresAt: number; count: number }
>();
const openPhoneBrandCountPending = new Map<string, Promise<number>>();

function openPhoneBrandCountCacheKey(
  query: TaskListQuery,
  options: TestBrandScope,
) {
  return JSON.stringify({
    ownerPageId: query.ownerPageId ?? null,
    statusScope: query.statusScope ?? "open",
    dueFrom: query.dueFrom ?? null,
    dueTo: query.dueTo ?? null,
    includeTest: Boolean(options.includeTest),
    onlyTest: Boolean(options.onlyTest),
  });
}

export function invalidateOpenPhoneBrandCountCache() {
  openPhoneBrandCountCache.clear();
  openPhoneBrandCountPending.clear();
}

/**
 * Open Phone brand count for Caller ReplyTask badge.
 * Same brand with multiple Phone tasks counts as 1.
 * Short TTL cache so list + badge on /tasks do not both scan TaskDB.
 */
export async function countOpenPhoneBrandsForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
  const cacheKey = openPhoneBrandCountCacheKey(query, options);
  const hit = openPhoneBrandCountCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.count;

  const pending = openPhoneBrandCountPending.get(cacheKey);
  if (pending) return pending;

  const load = (async () => {
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
    pages = await scopeTestBrandTaskPages(pages, options);
    if (!pages.length) return 0;

    const brandByTask = await brandIdsByTaskPage(pages);

    const keys = new Set<string>();
    for (const page of pages) {
      const contactId =
        firstRelationId(page.properties?.["Follow-up Contact"]) || null;
      const brandId = brandByTask.get(page.id);
      if (brandId) keys.add(`brand:${brandId}`);
      else if (contactId) keys.add(`contact:${contactId}`);
      else keys.add(`task:${page.id}`);
    }
    return keys.size;
  })().then((count) => {
    openPhoneBrandCountCache.set(cacheKey, {
      expiresAt: Date.now() + OPEN_PHONE_BRAND_COUNT_CACHE_MS,
      count,
    });
    return count;
  });

  openPhoneBrandCountPending.set(cacheKey, load);
  try {
    return await load;
  } finally {
    if (openPhoneBrandCountPending.get(cacheKey) === load) {
      openPhoneBrandCountPending.delete(cacheKey);
    }
  }
}

/**
 * Open non-Phone task stubs for badge Needs Reply annotation.
 * Reads Task properties only — skips Contact/Brand N+1.
 */
export async function listOpenReplyTaskStubsForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
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
  pages = await scopeTestBrandTaskPages(pages, options);
  return pages.map(stubTaskFromPage);
}

function scheduledAtInRange(
  scheduledAt: string | null | undefined,
  dueFrom?: string | null,
  dueTo?: string | null,
) {
  if (!dueFrom && !dueTo) return true;
  const day = (scheduledAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  let start = dueFrom || "";
  let end = dueTo || "";
  if (start && end && start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function taskPageMatchesManagerReplyQuery(page: NotionPage, query: TaskListQuery) {
  const properties = page.properties || {};
  const status = propertyText(properties["Task Status"]);
  if (!isOpenTaskStatus(status)) return false;
  const channel = propertyText(properties.Channel);
  if (!channel || channel === "Phone" || !CHANNELS.includes(channel as Channel)) {
    return false;
  }
  if (query.ownerPageId !== undefined) {
    const ownerId = firstRelationId(properties.Owner) || null;
    if (query.ownerPageId === null) {
      if (ownerId) return false;
    } else if (ownerId !== query.ownerPageId) {
      return false;
    }
  }
  return scheduledAtInRange(
    propertyDate(properties["Scheduled At"]),
    query.dueFrom,
    query.dueTo,
  );
}

/**
 * Open non-Phone tasks that currently need a reply.
 * Starts from ConversationDB `Needs Reply` rows instead of scanning every open reply task's inbox.
 */
export async function listOpenNeedsReplyTaskStubsForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
  const activities = await listNeedsReplyConversations().catch(() => []);
  if (!activities.length) return [];

  const contactIds = [
    ...new Set(
      activities
        .map((item) => item.contactId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (!contactIds.length) return [];

  let pages: NotionPage[] = [];
  try {
    pages = await queryTasksByContacts(contactIds);
  } catch {
    pages = [];
  }
  pages = pages.filter((page) => taskPageMatchesManagerReplyQuery(page, query));
  pages = await scopeTestBrandTaskPages(pages, options);
  const stubs = pages.map(stubTaskFromPage);
  return annotateTasksWithReplyInbox(stubs, activities).filter(
    (task) => task.inboxStatus === "Needs Reply",
  );
}

export async function countOpenNeedsReplyTasksForViewer(
  query: TaskListQuery,
  options: TestBrandScope = {},
) {
  return (await listOpenNeedsReplyTaskStubsForViewer(query, options)).length;
}

/**
 * Admin / AccountManager open ReplyTask page:
 * Phone (cursor-scanned with early stop) + Needs Reply, then list-level brand hydrate only.
 */
export async function listOpenManagerTasksForViewerPage(
  query: TaskListQuery,
  options: {
    cursor?: string | null;
    pageSize?: number;
  } & TestBrandScope = {},
) {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? DEFAULT_TASK_PAGE_SIZE, 1),
    100,
  );
  const offset = Math.max(0, Number(options.cursor || 0) || 0);
  const need = offset + pageSize;

  const replyEligible = await listOpenNeedsReplyTaskStubsForViewer(query, options);
  replyEligible.sort(compareOpenTaskOrder);

  const phonePagesById = new Map<string, NotionPage>();
  const phoneStubs: BrandTask[] = [];
  let notionCursor: string | null | undefined = undefined;
  let phoneExhausted = false;

  while (!phoneExhausted) {
    let batch = {
      pages: [] as NotionPage[],
      nextCursor: null as string | null,
      hasMore: false,
    };
    try {
      batch = await queryTaskPagesOnce({
        filter: taskListFilter({
          ...query,
          channel: "Phone",
          channels: undefined,
          statusScope: "open",
        }),
        startCursor: notionCursor,
        pageSize: 100,
        sorts: TASK_LIST_SORTS,
      });
    } catch {
      batch = { pages: [], nextCursor: null, hasMore: false };
    }

    const scoped = await scopeTestBrandTaskPages(batch.pages, options);
    for (const page of scoped) {
      phonePagesById.set(page.id, page);
      phoneStubs.push(stubTaskFromPage(page));
    }
    notionCursor = batch.nextCursor;
    if (!batch.nextCursor) phoneExhausted = true;

    const merged = mergeOpenTaskStubs(phoneStubs, replyEligible);
    if (merged.length >= need) {
      const cutoff = merged[need - 1]?.scheduledAt || "";
      const lastPhoneAt = phoneStubs.at(-1)?.scheduledAt || "";
      if (phoneExhausted || lastPhoneAt >= cutoff) break;
    } else if (phoneExhausted) {
      break;
    }
  }

  const eligible = mergeOpenTaskStubs(phoneStubs, replyEligible);
  const selected = eligible.slice(offset, offset + pageSize);

  const pagesForHydrate: NotionPage[] = [];
  const missingIds: string[] = [];
  for (const stub of selected) {
    const page = phonePagesById.get(stub.id);
    if (page) pagesForHydrate.push(page);
    else missingIds.push(stub.id);
  }
  if (missingIds.length) {
    const retrieved = await Promise.all(
      missingIds.map((id) => retrievePage(id).catch(() => null)),
    );
    for (const page of retrieved) {
      if (page) pagesForHydrate.push(page);
    }
  }

  const hydrated = await mapTaskPagesForCallerList(pagesForHydrate);
  const byId = new Map(hydrated.map((task) => [task.id, task]));
  const tasks = selected.map((stub) => {
    const task = byId.get(stub.id) || stub;
    return {
      ...task,
      inboxStatus: stub.inboxStatus ?? null,
      preview: stub.preview ?? null,
      lastInboundAt: stub.lastInboundAt ?? null,
    };
  });

  const nextOffset = offset + selected.length;
  const hasMore =
    nextOffset < eligible.length ||
    (!phoneExhausted && selected.length >= pageSize);

  return {
    tasks,
    nextCursor: hasMore ? String(nextOffset) : null,
    hasMore,
    pageSize,
  };
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

type TaskBrandInfo = {
  id: string;
  name: string;
  ownerId: string | null;
  isTest: boolean;
};

type TaskCaches = {
  titles: Map<string, string>;
  owners: Map<string, FollowupOwner | null>;
  contacts: Map<string, NotionPage | null>;
  brands: Map<string, TaskBrandInfo | null>;
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
      isTest: isTestFollowupClientPage(page),
    });
  }
}

/** Prefetch Contact / Owner / Brand / KeyPerson once per page batch to avoid N+1 races. */
async function warmCachesForTaskPages(
  pages: NotionPage[],
  caches: TaskCaches,
  hints?: TaskResolveHints,
) {
  if (hints?.brand) {
    caches.brands.set(hints.brand.id, {
      id: hints.brand.id,
      name: hints.brand.name,
      ownerId: hints.brand.ownerId,
      isTest: Boolean(hints.brand.isTest),
    });
  }

  const contactIds: string[] = [];
  const ownerIds: string[] = [];
  const directBrandIds: string[] = [];
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
    const directBrandId = firstRelationId(properties["Follow-up Client"]);
    if (directBrandId) directBrandIds.push(directBrandId);
  }

  await Promise.all([
    prefetchContactEntries(
      [...new Set(contactIds)].map((id) => ({ cacheKey: id, pageId: id })),
      caches,
    ),
    prefetchOwners(ownerIds, caches),
  ]);

  const keyPersonEntries: Array<{ cacheKey: string; pageId: string }> = [];
  const brandClientIds: string[] = [...directBrandIds];
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
    const mapped: TaskBrandInfo = {
      id: page.id,
      name,
      ownerId: firstRelationId(properties.Owner) || null,
      isTest: isTestFollowupClientPage(page),
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
  brand?: { id: string; name: string; ownerId: string | null; isTest?: boolean };
};

async function mapTaskPage(
  page: NotionPage,
  caches: TaskCaches,
  hints?: TaskResolveHints,
): Promise<BrandTask> {
  const properties = page.properties || {};
  const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
  const directBrandId =
    firstRelationId(properties["Follow-up Client"]) || null;
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
  let brand: TaskBrandInfo | null = hints?.brand
    ? {
        id: hints.brand.id,
        name: hints.brand.name,
        ownerId: hints.brand.ownerId,
        isTest: Boolean(hints.brand.isTest),
      }
    : null;
  if (!brand && directBrandId) {
    brand = caches.brands.get(directBrandId) || null;
  }

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
    brandIsTest: Boolean(brand?.isTest),
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
    callReviewReason: propertyText(properties["Call Review Reason"]) || null,
    callQualifiedAt: propertyDate(properties["Call Qualified At"]),
    callReviewHistoryText: propertyText(properties["Call Review History"]) || null,
    callReviewHistory: historyFromTask({
      id: page.id,
      notes: propertyText(properties.Notes) || null,
      callReviewHistoryText: propertyText(properties["Call Review History"]) || null,
      endedAt: propertyDate(properties["Ended At"]),
      callReviewStatus: asCallReviewStatus(propertyText(properties["Call Review Status"])),
    }),
  };
}

async function mapTaskPages(pages: NotionPage[], hints?: TaskResolveHints) {
  const caches = emptyCaches();
  await warmCachesForTaskPages(pages, caches, hints);
  return Promise.all(pages.map((page) => mapTaskPage(page, caches, hints)));
}

/**
 * ReplyTask list hydrate: no Follow-up Client / Client title retrieves.
 * Brand name is parsed from the task title; brand id from the task relation.
 */
async function mapTaskPagesForCallerList(pages: NotionPage[]): Promise<BrandTask[]> {
  return pages.map((page) => callerListTaskFromPage(page));
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

export type FollowupTaskSignal = Pick<
  BrandTask,
  "id" | "brandId" | "contactId" | "channel" | "status" | "callReviewStatus"
> & { createdAt: string | null };

/** Property-only task rows used by the Brands list interaction summary. */
export async function listFollowupTaskSignalsByBrands(
  brandIds: string[],
): Promise<FollowupTaskSignal[]> {
  if (!brandIds.length) return [];
  const pages: NotionPage[] = [];
  for (let index = 0; index < brandIds.length; index += 100) {
    pages.push(
      ...(await queryTaskPages(
        relationFilter("Follow-up Client", brandIds.slice(index, index + 100)),
      )),
    );
  }
  return pages.map((page) => {
    const properties = page.properties || {};
    return {
      id: page.id,
      brandId: firstRelationId(properties["Follow-up Client"]) || null,
      contactId:
        firstRelationId(properties["Follow-up Contact"]) || null,
      channel: propertyText(properties.Channel) || null,
      status: propertyText(properties["Task Status"]) || null,
      callReviewStatus: asCallReviewStatus(
        propertyText(properties["Call Review Status"]),
      ),
      createdAt: page.created_time || null,
    };
  });
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

export async function listFollowupTasksForViewer(
  query: TaskListQuery = {},
  options: TestBrandScope = {},
) {
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(taskListFilter(query));
  } catch {
    pages = [];
  }
  const mapped = await mapTaskPages(pages);
  return sortTasks(scopeTestBrandTasks(mapped, options));
}

/**
 * Current Qualified Phone tasks for the role-aware dashboard. This deliberately
 * reads the task's current review state, rather than historical review rounds.
 */
export async function listCurrentQualifiedPhoneTasks(
  options: TestBrandScope = {},
) {
  let pages: NotionPage[] = [];
  try {
    pages = await queryTaskPages(
      taskListFilter({
        channel: "Phone",
        callReviewStatus: "Qualified",
        statusScope: "all",
      }),
    );
  } catch {
    pages = [];
  }
  const scoped = await scopeTestBrandTaskPages(pages, options);
  const tasks = await mapTaskPages(scoped);
  cacheDashboardTasks(tasks);
  return tasks;
}

export type TaskListHydrate = "full" | "caller-list";

async function takeCallerBrandTaskPages(
  query: TaskListQuery,
  options: {
    cursor?: string | null;
    pageSize: number;
  } & TestBrandScope,
) {
  const pageSize = options.pageSize;
  const parsed = parseCallerListCursor(options.cursor);
  const seen = new Set(parsed.seen);
  const selected: NotionPage[] = [];
  let notionCursor: string | null = parsed.notionCursor;
  // Buffered rows with no Notion cursor mean the previous batch already reached EOF.
  let sourceExhausted =
    Boolean(options.cursor) &&
    parsed.notionCursor === null &&
    (parsed.buffer.length > 0 || parsed.legacyBufferIds.length > 0);

  const pageQueue: NotionPage[] = [];
  const brandByPageId = new Map<string, string | null>();

  async function enqueuePages(pages: NotionPage[]) {
    if (!pages.length) return;
    const scoped = await scopeTestBrandTaskPages(pages, options);
    const brands = await brandIdsByTaskPage(scoped);
    for (const page of scoped) {
      pageQueue.push(page);
      brandByPageId.set(page.id, brands.get(page.id) || null);
    }
  }

  if (parsed.buffer.length) {
    for (const stub of parsed.buffer) {
      const page = notionPageFromCallerListStub(stub);
      pageQueue.push(page);
      brandByPageId.set(page.id, stub.brandId);
    }
    if (parsed.notionCursor === null) sourceExhausted = true;
  }

  if (parsed.legacyBufferIds.length) {
    const restored = await Promise.all(
      parsed.legacyBufferIds.map((id) => retrievePage(id).catch(() => null)),
    );
    await enqueuePages(
      restored.filter((page): page is NotionPage => !!page),
    );
    if (parsed.notionCursor === null) sourceExhausted = true;
  }

  while (selected.length < pageSize) {
    while (pageQueue.length && selected.length < pageSize) {
      const page = pageQueue.shift()!;
      const contactId =
        firstRelationId(page.properties?.["Follow-up Contact"]) || null;
      const key = callerBrandKey({
        id: page.id,
        brandId: brandByPageId.get(page.id) || null,
        contactId,
      });
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(page);
    }

    if (selected.length >= pageSize) break;
    if (sourceExhausted) break;

    let batch = {
      pages: [] as NotionPage[],
      nextCursor: null as string | null,
      hasMore: false,
    };
    try {
      batch = await queryTaskPagesOnce({
        filter: taskListFilter(query),
        startCursor: notionCursor,
        pageSize: Math.min(Math.max(pageSize * 3, 30), 100),
        sorts: TASK_LIST_SORTS,
      });
    } catch {
      batch = { pages: [], nextCursor: null, hasMore: false };
    }

    notionCursor = batch.nextCursor;
    if (!batch.nextCursor) sourceExhausted = true;
    if (!batch.pages.length) break;
    await enqueuePages(batch.pages);
  }

  const leftover = pageQueue.map((page) =>
    callerListStubFromPage(page, brandByPageId.get(page.id) || null),
  );
  const hasMore = leftover.length > 0 || (!sourceExhausted && !!notionCursor);
  const nextCursor = hasMore
    ? encodeCallerListCursor({
        notionCursor,
        buffer: leftover,
        legacyBufferIds: [],
        seen: [...seen],
      })
    : null;

  return { pages: selected, nextCursor, hasMore };
}

export async function listFollowupTasksForViewerPage(
  query: TaskListQuery = {},
  options: {
    cursor?: string | null;
    pageSize?: number;
    /** `caller-list` skips Contact/Owner/KeyPerson — ReplyTask table needs brand name only. */
    hydrate?: TaskListHydrate;
  } & TestBrandScope = {},
) {
  const pageSize = Math.min(Math.max(options.pageSize ?? DEFAULT_TASK_PAGE_SIZE, 1), 100);
  const hydrate: TaskListHydrate = options.hydrate ?? "full";
  const mapPages =
    hydrate === "caller-list" ? mapTaskPagesForCallerList : mapTaskPages;

  // Caller ReplyTask: page by unique Follow-up Client (one Phone row per brand).
  if (hydrate === "caller-list") {
    if (options.onlyTest) {
      let pages: NotionPage[] = [];
      try {
        pages = await queryTaskPages(taskListFilter(query));
      } catch {
        pages = [];
      }
      pages = await scopeTestBrandTaskPages(pages, {
        includeTest: true,
        onlyTest: true,
      });
      pages.sort((left, right) => {
        const leftAt =
          propertyDate(left.properties?.["Scheduled At"]) || "";
        const rightAt =
          propertyDate(right.properties?.["Scheduled At"]) || "";
        return leftAt.localeCompare(rightAt) || left.id.localeCompare(right.id);
      });
      const brandByTask = await brandIdsByTaskPage(pages);
      const uniquePages: NotionPage[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        const contactId =
          firstRelationId(page.properties?.["Follow-up Contact"]) || null;
        const key = callerBrandKey({
          id: page.id,
          brandId: brandByTask.get(page.id) || null,
          contactId,
        });
        if (seen.has(key)) continue;
        seen.add(key);
        uniquePages.push(page);
      }
      const offset = Math.max(0, Number(options.cursor || 0) || 0);
      const slice = uniquePages.slice(offset, offset + pageSize);
      const tasks = await mapTaskPagesForCallerList(slice);
      const nextOffset = offset + pageSize;
      const hasMore = nextOffset < uniquePages.length;
      return {
        tasks,
        nextCursor: hasMore ? String(nextOffset) : null,
        hasMore,
        pageSize,
      };
    }

    const taken = await takeCallerBrandTaskPages(query, {
      cursor: options.cursor,
      pageSize,
      includeTest: options.includeTest,
      onlyTest: options.onlyTest,
    });
    const tasks = await mapTaskPagesForCallerList(taken.pages);
    return {
      tasks,
      nextCursor: taken.nextCursor,
      hasMore: taken.hasMore,
      pageSize,
    };
  }

  // Test-only viewers: keep only Is Test Phone rows. Dataset is small, so filter
  // the full open list then offset-page (Notion cursor + post-filter would skip rows).
  if (options.onlyTest) {
    const all = await listFollowupTasksForViewer(query, {
      includeTest: true,
      onlyTest: true,
    });
    const offset = Math.max(0, Number(options.cursor || 0) || 0);
    const tasks = all.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const hasMore = nextOffset < all.length;
    return {
      tasks,
      nextCursor: hasMore ? String(nextOffset) : null,
      hasMore,
      pageSize,
    };
  }

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
  const mapped = await mapPages(batch.pages);
  const tasks = scopeTestBrandTasks(mapped, options);
  return {
    tasks,
    nextCursor: batch.nextCursor,
    // Keep Notion cursor even when test-brand filter shortens this page.
    hasMore: Boolean(batch.nextCursor),
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
        .filter(
          (page) =>
            !firstRelationId(page.properties?.["Follow-up Client"]),
        )
        .map(
          (page) =>
            firstRelationId(page.properties?.["Follow-up Contact"]) || null,
        )
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
    const notes = propertyText(properties.Notes) || null;
    const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
    const clientId =
      firstRelationId(properties["Follow-up Client"]) ||
      (contactId ? brandByContact.get(contactId) : null);
    if (!clientId || !scheduledAt || !status || !TASK_STATUSES.has(status)) return [];
    if (!channel || !CHANNELS.includes(channel as Channel)) return [];
    // LinkedIn follow-up-after-reply / connected do not occupy Channel Daily Max.
    if (
      channel === "LinkedIn" &&
      !isLinkedInColdCapacityTask({ channel, status, notes })
    ) {
      return [];
    }
    return [{
      clientId,
      contactId: contactId || undefined,
      channel: channel as Channel,
      scheduledAt,
      status,
    }];
  });
}
