import {
  brandInitials,
  currentCpOption,
  parseApplicableCp,
  type BrandDetail,
  type BrandListItem,
  type HandlingMode,
} from "../brand-list";
import { checkpointShortName, listCheckpoints, resolveCheckpoint } from "./cps";
import {
  firstRelationId,
  isTestFollowupClientPage,
  propertyText,
  queryFollowupClientPagesPage,
  relationIds,
  retrievePage,
  notionDate,
  rollupDate,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { listFollowupContacts } from "./contacts";
import { listFollowupConversations } from "./conversations";
import {
  attachBrandInteractionSignals,
  attachBrandReplySignals,
  listBrandInteractionSignals,
  listBrandReplySignals,
} from "./brand-reply-signals";
import { DEFAULT_BRAND_PAGE_SIZE, followupClientListFilter } from "./owner-filter";
import { listFollowupTasks, type TaskResolveHints } from "./tasks";
import { retrieveOwner, type FollowupOwner } from "./owners";
const HANDLING_MODES = new Set(["Automated", "Human"]);

function asHandlingMode(value: string): HandlingMode | null {
  return HANDLING_MODES.has(value) ? (value as HandlingMode) : null;
}

async function resolveClientCompany(pageId?: string | null) {
  if (!pageId) {
    return { companyName: null, productDescription: null, matchedCategory: null };
  }
  try {
    const page = await retrievePage(pageId);
    const properties = page.properties || {};
    const categoryIds = relationIds(properties["Matched Category"]);
    const categories = await Promise.all(
      categoryIds.map(async (id) => {
        try {
          return titleFromProperties((await retrievePage(id)).properties);
        } catch {
          return "";
        }
      }),
    );
    return {
      companyName: propertyText(properties["Company Name"]) || titleFromProperties(properties) || null,
      productDescription: propertyText(properties["Product Description"]) || null,
      matchedCategory: categories.filter(Boolean).join(", ") || null,
    };
  } catch {
    return { companyName: null, productDescription: null, matchedCategory: null };
  }
}

async function resolveRelatedTitle(
  pageId: string | undefined,
  cache: Map<string, string>,
) {
  if (!pageId) return "";
  const cached = cache.get(pageId);
  if (cached !== undefined) return cached;
  try {
    const page = await retrievePage(pageId);
    const title = titleFromProperties(page.properties);
    cache.set(pageId, title);
    return title;
  } catch {
    cache.set(pageId, "");
    return "";
  }
}

async function resolveFollowupExhibition(page: NotionPage) {
  const exhibitionId = firstRelationId(page.properties?.["Follow-up Exhibition"]);
  if (!exhibitionId) return null;
  const title = await resolveRelatedTitle(exhibitionId, new Map());
  return title || null;
}

async function resolveOwner(
  pageId: string | undefined,
  cache: Map<string, FollowupOwner | null>,
) {
  if (!pageId) return null;
  if (cache.has(pageId)) return cache.get(pageId) || null;
  const owner = await retrieveOwner(pageId);
  cache.set(pageId, owner);
  return owner;
}

export async function mapFollowupClientPage(
  page: NotionPage,
  titleCache = new Map<string, string>(),
  ownerCache = new Map<string, FollowupOwner | null>(),
): Promise<BrandListItem> {
  const properties = page.properties || {};
  const followupTitle = titleFromProperties(properties);
  const clientId = firstRelationId(properties.Client);
  const ownerId = firstRelationId(properties.Owner);
  const currentCpId = firstRelationId(properties["Current CP"]);
  const [clientName, owner, currentCpTitle] = await Promise.all([
    resolveRelatedTitle(clientId, titleCache),
    resolveOwner(ownerId, ownerCache),
    resolveRelatedTitle(currentCpId, titleCache).catch(() => ""),
  ]);
  const name = clientName || followupTitle || "Untitled Client";

  return {
    id: page.id,
    name,
    initials: brandInitials(name),
    currentCp: checkpointShortName(currentCpTitle) || "NONE",
    currentCpId: currentCpId || null,
    status: propertyText(properties["Follow-up Status"]),
    handlingMode: asHandlingMode(propertyText(properties["Handling Mode"])),
    lastInteractionAt: rollupDate(properties["Last Interaction At"]),
    lastInteractionChannel: null,
    lastInteractionDirection: null,
    lastInteractionStatus: null,
    lastInteractionCallResult: null,
    lastReplyAt: notionDate(properties["Last Reply At"]),
    ownerId: owner?.id || ownerId || null,
    ownerName: owner?.name || null,
    ownerEmail: owner?.account || null,
    isTest: isTestFollowupClientPage(page),
  };
}

export async function mapFollowupClientPages(pages: NotionPage[]) {
  const titleCache = new Map<string, string>();
  const ownerCache = new Map<string, FollowupOwner | null>();
  const brands = await Promise.all(
    pages.map((page) => mapFollowupClientPage(page, titleCache, ownerCache)),
  );
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

function replyDueDay(value?: string | null) {
  return value?.trim().slice(0, 10) || "";
}

function replyDueInRange(dueAt: string | null | undefined, from?: string | null, to?: string | null) {
  if (!dueAt) return false;
  const day = replyDueDay(dueAt);
  const startRaw = from?.trim() || "";
  const endRaw = to?.trim() || "";
  const start = startRaw && endRaw && startRaw > endRaw ? endRaw : startRaw;
  const end = startRaw && endRaw && startRaw > endRaw ? startRaw : endRaw;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function sortBrandListItems(brands: BrandListItem[]) {
  return [...brands].sort((a, b) => {
    const replyRank = (item: BrandListItem) => (item.needsReply ? 1 : 0);
    const aTime = a.replyDueAt || a.replyUpdatedAt || a.lastInteractionAt || "";
    const bTime = b.replyDueAt || b.replyUpdatedAt || b.lastInteractionAt || "";
    return (
      replyRank(b) - replyRank(a) ||
      (a.needsReply && b.needsReply ? aTime.localeCompare(bTime) : 0) ||
      bTime.localeCompare(aTime) ||
      a.name.localeCompare(b.name)
    );
  });
}

async function enrichBrandPage(pages: NotionPage[]) {
  if (!pages.length) return [] as BrandListItem[];
  const [mapped, replySignals, interactionSignals] = await Promise.all([
    mapFollowupClientPages(pages),
    listBrandReplySignals(pages).catch(() => new Map()),
    listBrandInteractionSignals(pages).catch(() => new Map()),
  ]);
  return attachBrandInteractionSignals(
    attachBrandReplySignals(mapped, replySignals),
    interactionSignals,
  );
}

export type ListFollowupClientsPageInput = {
  ownerPageId?: string | null;
  includeTest?: boolean;
  onlyTest?: boolean;
  status?: string | null;
  excludeStatuses?: string[];
  q?: string | null;
  cp?: string | null;
  replyFrom?: string | null;
  replyTo?: string | null;
  cursor?: string | null;
  pageSize?: number;
};

export type ListFollowupClientsPageResult = {
  brands: BrandListItem[];
  pageSize: number;
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * True Notion pagination (`page_size` + cursor).
 * Reply-due filter uses Needs Reply hits only (usually small), not full ClientDB scan.
 */
export async function listFollowupClientsForViewerPage(
  input: ListFollowupClientsPageInput = {},
): Promise<ListFollowupClientsPageResult> {
  const pageSize = Math.min(
    Math.max(input.pageSize ?? DEFAULT_BRAND_PAGE_SIZE, 1),
    DEFAULT_BRAND_PAGE_SIZE,
  );
  const hasReplyDueFilter = Boolean(input.replyFrom?.trim() || input.replyTo?.trim());

  if (hasReplyDueFilter) {
    return listFollowupClientsByReplyDuePage(input, pageSize);
  }

  let currentCpPageId: string | undefined;
  const cp = input.cp?.trim() || "all";
  if (cp !== "all") {
    const checkpoints = await listCheckpoints();
    currentCpPageId = checkpoints.find((item) => item.name === cp)?.id;
    if (!currentCpPageId) {
      return { brands: [], pageSize, nextCursor: null, hasMore: false };
    }
  }

  const filter = followupClientListFilter({
    ownerPageId: input.ownerPageId,
    includeTest: input.includeTest,
    onlyTest: input.onlyTest,
    status: input.status,
    excludeStatuses: input.excludeStatuses,
    titleContains: input.q,
    currentCpPageId,
  });

  const batch = await queryFollowupClientPagesPage({
    filter,
    startCursor: input.cursor,
    pageSize,
    sorts: [{ property: "Follow-up Client", direction: "ascending" }],
  });

  const brands = sortBrandListItems(await enrichBrandPage(batch.pages));
  return {
    brands,
    pageSize,
    nextCursor: batch.nextCursor,
    hasMore: batch.hasMore,
  };
}

/** Reply-due path: paginate matching Needs Reply brand IDs (no full ClientDB scan). */
async function listFollowupClientsByReplyDuePage(
  input: ListFollowupClientsPageInput,
  pageSize: number,
): Promise<ListFollowupClientsPageResult> {
  const replySignals = await listBrandReplySignals([]).catch(() => new Map());
  const matchingIds = [...replySignals.entries()]
    .filter(([, signal]) =>
      replyDueInRange(signal.dueAt, input.replyFrom, input.replyTo),
    )
    .sort((a, b) => (a[1].dueAt || "").localeCompare(b[1].dueAt || ""))
    .map(([brandId]) => brandId);

  const offset = Math.max(0, Number(input.cursor || 0) || 0);
  const sliceIds = matchingIds.slice(offset, offset + pageSize);
  const pages = (
    await Promise.all(sliceIds.map((id) => retrievePage(id).catch(() => null)))
  ).filter((page): page is NotionPage => !!page);

  let brands = await enrichBrandPage(pages);

  const q = input.q?.trim().toLowerCase() || "";
  const cp = input.cp?.trim() || "all";
  brands = brands.filter((brand) => {
    if (input.onlyTest && !brand.isTest) return false;
    if (!input.onlyTest && input.includeTest === false && brand.isTest) return false;
    if (input.ownerPageId === null && brand.ownerId) return false;
    if (input.ownerPageId && brand.ownerId !== input.ownerPageId) return false;
    if (input.status && input.status !== "all" && brand.status !== input.status) return false;
    if (input.excludeStatuses?.includes(brand.status)) return false;
    if (q && !brand.name.toLowerCase().includes(q)) return false;
    if (cp !== "all" && brand.currentCp !== cp) return false;
    return true;
  });

  const nextOffset = offset + pageSize;
  const hasMore = nextOffset < matchingIds.length;
  return {
    brands: sortBrandListItems(brands),
    pageSize,
    nextCursor: hasMore ? String(nextOffset) : null,
    hasMore,
  };
}

async function resolveBombMeta(pageId: string) {
  try {
    const page = await retrievePage(pageId);
    const properties = page.properties || {};
    return {
      name: titleFromProperties(properties) || "Untitled OmniReach",
      cp:
        parseApplicableCp(propertyText(properties.CP) || propertyText(properties["Applicable CP"])) ||
        null,
    };
  } catch {
    return { name: "Untitled OmniReach", cp: null };
  }
}

export type MapFollowupClientDetailOptions = {
  /** Default false — brand shell loads first; timeline uses /activities. */
  includeActivities?: boolean;
};

export async function mapFollowupClientDetail(
  page: NotionPage,
  options: MapFollowupClientDetailOptions = {},
): Promise<BrandDetail> {
  const properties = page.properties || {};
  const [brand, contacts, company, followupExhibition] = await Promise.all([
    mapFollowupClientPage(page),
    listFollowupContacts(page.id, relationIds(properties["Follow-up Contacts"])),
    resolveClientCompany(firstRelationId(properties.Client)),
    resolveFollowupExhibition(page),
  ]);
  const cpMeta =
    (brand.currentCpId ? await resolveCheckpoint(brand.currentCpId) : null) ||
    currentCpOption(brand.currentCp);
  const contactIds = contacts.map((item) => item.id);
  const brandName = company.companyName || brand.name;
  const taskHints: TaskResolveHints = {
    contactsById: new Map(
      contacts.map((item) => [item.id, { name: item.name, phone: item.phone }]),
    ),
    brand: {
      id: brand.id,
      name: brandName,
      ownerId: brand.ownerId,
      isTest: brand.isTest,
    },
  };
  const [activities, tasks] = await Promise.all([
    options.includeActivities
      ? listFollowupConversations(contactIds)
      : Promise.resolve([]),
    listFollowupTasks(contactIds, taskHints),
  ]);
  const bombIds = [...new Set(tasks.map((item) => item.sourceBombId).filter((id): id is string => !!id))];
  const bombMeta = new Map(
    await Promise.all(
      bombIds.map(async (id) => [id, await resolveBombMeta(id)] as const),
    ),
  );
  return {
    ...brand,
    name: brandName,
    productDescription: company.productDescription,
    matchedCategory: company.matchedCategory,
    followupExhibition,
    priority: propertyText(properties.Priority) || null,
    notes: propertyText(properties.Notes) || null,
    createdAt: page.created_time || properties["Created At"]?.created_time || null,
    lastEditedAt: page.last_edited_time || properties["Last Edited At"]?.last_edited_time || null,
    currentCpFullName: cpMeta.fullName,
    currentCpDefinition: cpMeta.definition,
    contacts,
    tasks: tasks.map((task) => {
      const bomb = task.sourceBombId ? bombMeta.get(task.sourceBombId) : undefined;
      return {
        ...task,
        sourceBombName: bomb?.name || null,
        sourceBombCp: bomb?.cp || null,
      };
    }),
    activities,
  };
}
