import {
  brandInitials,
  currentCpOption,
  parseApplicableCp,
  type BrandDetail,
  type BrandListItem,
  type BrandMeetingNote,
  type HandlingMode,
} from "../brand-list";
import {
  aiMeetingLinksPropertyName,
  parseAiMeetingLinks,
  sortAiMeetingLinks,
} from "../ai-meeting-links";
import { checkpointShortName, listCheckpoints, resolveCheckpoint } from "./cps";
import {
  firstRelationId,
  isTestFollowupClientPage,
  notionPageUrl,
  propertyText,
  queryFollowupClientPages,
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
  attachBrandReplySignals,
  listBrandReplySignals,
  type BrandReplySignal,
} from "./brand-reply-signals";
import { getCachedBrandReplyMetadata } from "./brand-reply-signal-cache";
import { cacheBrandPages } from "./brand-page-cache";
import {
  brandListSourceIsExhausted,
  encodeBrandListCursor,
  parseBrandListCursor,
  sortBrandListItems,
} from "./brand-list-order";
import { DEFAULT_BRAND_PAGE_SIZE, followupClientListFilter, matchesNeedsReplyBrandScope, type NeedsReplyBrandScope } from "./owner-filter";
import { listFollowupTasks, type TaskResolveHints } from "./tasks";
import { queryOwnerPages, retrieveOwner, type FollowupOwner } from "./owners";
const HANDLING_MODES = new Set(["Automated", "Human"]);
const OWNER_DIRECTORY_CACHE_MS = 60_000;
let ownerDirectoryCache:
  | { expiresAt: number; items: FollowupOwner[] }
  | null = null;
let ownerDirectoryPending: Promise<FollowupOwner[]> | null = null;

async function listOwnersForBrandMapping() {
  if (ownerDirectoryCache && ownerDirectoryCache.expiresAt > Date.now()) {
    return ownerDirectoryCache.items;
  }
  if (ownerDirectoryPending) return ownerDirectoryPending;
  const promise = queryOwnerPages().then((items) => {
    ownerDirectoryCache = {
      expiresAt: Date.now() + OWNER_DIRECTORY_CACHE_MS,
      items,
    };
    return items;
  });
  ownerDirectoryPending = promise;
  return promise.finally(() => {
    if (ownerDirectoryPending === promise) ownerDirectoryPending = null;
  });
}

function asHandlingMode(value: string): HandlingMode | null {
  return HANDLING_MODES.has(value) ? (value as HandlingMode) : null;
}

async function resolveClientCompany(pageId?: string | null) {
  if (!pageId) {
    return { companyName: null, productDescription: null, matchedCategory: null, icpGroup: null };
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
      icpGroup: propertyText(properties["ICP Group"]) || null,
    };
  } catch {
    return { companyName: null, productDescription: null, matchedCategory: null, icpGroup: null };
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
    followupTitle ? Promise.resolve("") : resolveRelatedTitle(clientId, titleCache),
    resolveOwner(ownerId, ownerCache),
    resolveRelatedTitle(currentCpId, titleCache).catch(() => ""),
  ]);
  const name = followupTitle || clientName || "Untitled Client";

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
  const [owners, checkpoints] = await Promise.all([
    listOwnersForBrandMapping(),
    listCheckpoints(),
  ]);
  for (const owner of owners) ownerCache.set(owner.id, owner);
  for (const checkpoint of checkpoints) {
    titleCache.set(checkpoint.id, checkpoint.name);
  }
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

function pageKey(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

export type ListFollowupClientsPageInput = {
  /** Request-scoped diagnostic ID for phase timing logs. */
  traceId?: string;
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

type FilteredReplyBrand = {
  id: string;
  page: NotionPage;
  brand: BrandListItem;
  dueAt: string | null;
};

function logBrandListPhase(
  traceId: string | undefined,
  phase: string,
  startedAt: number,
  details: Record<string, unknown> = {},
) {
  console.info("[brands] phase", {
    ...(traceId ? { traceId } : {}),
    phase,
    durationMs: Date.now() - startedAt,
    ...details,
  });
}

async function listReplyBrandMetadata(
  entries: Array<[string, BrandReplySignal]>,
  input: {
    ownerPageId?: string | null;
    includeTest?: boolean;
    onlyTest?: boolean;
    status?: string | null;
    excludeStatuses?: string[];
    q?: string | null;
    cp?: string | null;
  } = {},
) {
  const cp = input.cp?.trim() || "all";
  let currentCpPageId: string | undefined;
  if (cp !== "all") {
    const checkpoints = await listCheckpoints();
    currentCpPageId = checkpoints.find((item) => item.name === cp)?.id;
    if (!currentCpPageId) return [];
  }
  const metadataKey = JSON.stringify({
    ids: entries.map(([id]) => pageKey(id)).sort(),
    ownerPageId: input.ownerPageId,
    includeTest: input.includeTest,
    onlyTest: input.onlyTest,
    status:
      input.status?.trim() && input.status.trim() !== "all"
        ? input.status.trim()
        : "",
    excludeStatuses: input.excludeStatuses,
    q: input.q?.trim().toLowerCase() || "",
    currentCpPageId,
  });
  return getCachedBrandReplyMetadata(metadataKey, async () => {
    const signalKeys = new Set(entries.map(([id]) => pageKey(id)));
    const pages = await queryFollowupClientPages(input.ownerPageId, {
      includeTest: input.includeTest,
      onlyTest: input.onlyTest,
      status: input.status,
      excludeStatuses: input.excludeStatuses,
      titleContains: input.q,
      currentCpPageId,
    });
    const validPages = pages.filter((page) => signalKeys.has(pageKey(page.id)));
    const mapped = await mapFollowupClientPages(validPages);
    const byKey = new Map(mapped.map((brand) => [pageKey(brand.id), brand]));
    return validPages.flatMap((page) => {
      const brand = byKey.get(pageKey(page.id));
      return brand ? [{ page, brand }] : [];
    });
  });
}

async function listFilteredReplyBrands(
  input: ListFollowupClientsPageInput,
  signals: Map<string, BrandReplySignal>,
): Promise<FilteredReplyBrand[]> {
  const startedAt = Date.now();
  const hasDueFilter = Boolean(input.replyFrom?.trim() || input.replyTo?.trim());
  const entries = [...signals.entries()]
    .filter(([, signal]) =>
      hasDueFilter ? replyDueInRange(signal.dueAt, input.replyFrom, input.replyTo) : true,
    )
    .sort((a, b) => (a[1].dueAt || "").localeCompare(b[1].dueAt || ""));
  if (!entries.length) {
    logBrandListPhase(input.traceId, "reply-metadata", startedAt, {
      signalCount: 0,
      matchedCount: 0,
    });
    return [];
  }

  const metadata = await listReplyBrandMetadata(entries, input);

  const dueByKey = new Map<string, string | null>();
  for (let index = 0; index < entries.length; index += 1) {
    dueByKey.set(pageKey(entries[index][0]), entries[index][1].dueAt);
  }
  const q = input.q?.trim().toLowerCase() || "";
  const cp = input.cp?.trim() || "all";

  const filtered: FilteredReplyBrand[] = [];
  for (const { page, brand } of metadata) {
    if (!matchesNeedsReplyBrandScope(brand, input)) continue;
    if (input.status && input.status !== "all" && brand.status !== input.status) continue;
    if (q && !brand.name.toLowerCase().includes(q)) continue;
    if (cp !== "all" && brand.currentCp !== cp) continue;
    filtered.push({
      id: page.id,
      page,
      brand,
      dueAt: dueByKey.get(pageKey(page.id)) || null,
    });
  }
  const result = filtered.sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
  logBrandListPhase(input.traceId, "reply-metadata", startedAt, {
    signalCount: entries.length,
    matchedCount: result.length,
  });
  return result;
}

async function takeNonReplyClientPages(options: {
  traceId?: string;
  filter?: Record<string, unknown>;
  excludeKeys: Set<string>;
  need: number;
  notionCursor: string | null;
  buffer: string[];
}) {
  const startedAt = Date.now();
  const bufferIds = [...options.buffer];
  const collected: NotionPage[] = [];
  let notionCursor = options.notionCursor;
  // A rest cursor with buffered IDs and no Notion cursor means the upstream
  // query already reached EOF. Once the buffer is consumed, do not query again
  // with a null cursor because that would restart from the first Notion page.
  let sourceExhausted = brandListSourceIsExhausted(notionCursor, bufferIds);

  while (collected.length < options.need && bufferIds.length) {
    const id = bufferIds.shift()!;
    if (options.excludeKeys.has(pageKey(id))) continue;
    const page = await retrievePage(id).catch(() => null);
    if (page) collected.push(page);
  }

  while (collected.length < options.need && !sourceExhausted) {
    const batch = await queryFollowupClientPagesPage({
      filter: options.filter,
      startCursor: notionCursor,
      pageSize: Math.min(Math.max(options.need * 2, DEFAULT_BRAND_PAGE_SIZE), 100),
      sorts: [{ property: "Follow-up Client", direction: "ascending" }],
    });
    notionCursor = batch.nextCursor;

    for (const page of batch.pages) {
      if (options.excludeKeys.has(pageKey(page.id))) continue;
      if (collected.length < options.need) collected.push(page);
      else bufferIds.push(page.id);
    }

    if (!batch.hasMore) {
      notionCursor = null;
      sourceExhausted = true;
      break;
    }
    if (collected.length >= options.need) break;
  }

  const result = {
    pages: collected,
    notionCursor,
    buffer: bufferIds,
    hasMore: bufferIds.length > 0 || (!sourceExhausted && !!notionCursor),
  };
  logBrandListPhase(options.traceId, "client-page", startedAt, {
    pageCount: collected.length,
    bufferedCount: bufferIds.length,
    hasMore: result.hasMore,
  });
  return result;
}

async function enrichBrandPage(
  pages: NotionPage[],
  replySignals: Map<string, BrandReplySignal>,
  knownBrands: Map<string, BrandListItem> = new Map(),
  traceId?: string,
) {
  if (!pages.length) return [] as BrandListItem[];
  const startedAt = Date.now();
  cacheBrandPages(pages);
  const unknownPages = pages.filter((page) => !knownBrands.has(pageKey(page.id)));
  const mapped = [
    ...pages.flatMap((page) => {
      const brand = knownBrands.get(pageKey(page.id));
      return brand ? [brand] : [];
    }),
    ...(await mapFollowupClientPages(unknownPages)),
  ];
  const result = attachBrandReplySignals(mapped, replySignals);
  logBrandListPhase(traceId, "brand-map", startedAt, {
    pageCount: pages.length,
    mappedCount: unknownPages.length,
    reusedCount: pages.length - unknownPages.length,
  });
  return result;
}

/**
 * Brands list pagination with global Needs Reply prefix, then remaining clients.
 * Reply-due date filter stays on the Needs Reply-only path.
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

  const replySignalsStartedAt = Date.now();
  const replySignals = await listBrandReplySignals([]).catch(
    () => new Map<string, BrandReplySignal>(),
  );
  logBrandListPhase(input.traceId, "reply-signals", replySignalsStartedAt, {
    signalCount: replySignals.size,
  });
  const replyBrands = await listFilteredReplyBrands(input, replySignals);
  const replyBrandByKey = new Map(
    replyBrands.map((item) => [pageKey(item.id), item.brand]),
  );
  const replyKeys = new Set(replyBrands.map((item) => pageKey(item.id)));
  const cursor = parseBrandListCursor(input.cursor);
  const outPages: NotionPage[] = [];

  if (cursor.phase === "reply") {
    const slice = replyBrands.slice(cursor.offset, cursor.offset + pageSize);
    outPages.push(...slice.map((item) => item.page));
    const nextReplyOffset = cursor.offset + slice.length;
    const replyHasMore = nextReplyOffset < replyBrands.length;

    if (outPages.length < pageSize) {
      const rest = await takeNonReplyClientPages({
        traceId: input.traceId,
        filter,
        excludeKeys: replyKeys,
        need: pageSize - outPages.length,
        notionCursor: null,
        buffer: [],
      });
      outPages.push(...rest.pages);
      const brands = sortBrandListItems(
        await enrichBrandPage(outPages, replySignals, replyBrandByKey, input.traceId),
      );
      return {
        brands,
        pageSize,
        nextCursor: rest.hasMore
          ? encodeBrandListCursor({
              phase: "rest",
              notionCursor: rest.notionCursor,
              buffer: rest.buffer,
            })
          : null,
        hasMore: rest.hasMore,
      };
    }

    if (replyHasMore) {
      return {
        brands: sortBrandListItems(
          await enrichBrandPage(outPages, replySignals, replyBrandByKey, input.traceId),
        ),
        pageSize,
        nextCursor: encodeBrandListCursor({ phase: "reply", offset: nextReplyOffset }),
        hasMore: true,
      };
    }

    const restPeek = await takeNonReplyClientPages({
      traceId: input.traceId,
      filter,
      excludeKeys: replyKeys,
      need: 1,
      notionCursor: null,
      buffer: [],
    });
    return {
      brands: sortBrandListItems(
        await enrichBrandPage(outPages, replySignals, replyBrandByKey, input.traceId),
      ),
      pageSize,
      nextCursor: restPeek.hasMore || restPeek.pages.length
        ? encodeBrandListCursor({
            phase: "rest",
            notionCursor: restPeek.notionCursor,
            buffer: [
              ...restPeek.pages.map((page) => page.id),
              ...restPeek.buffer,
            ],
          })
        : null,
      hasMore: restPeek.hasMore || restPeek.pages.length > 0,
    };
  }

  const rest = await takeNonReplyClientPages({
    traceId: input.traceId,
    filter,
    excludeKeys: replyKeys,
    need: pageSize,
    notionCursor: cursor.notionCursor,
    buffer: cursor.buffer,
  });
  return {
    brands: sortBrandListItems(
      await enrichBrandPage(rest.pages, replySignals, replyBrandByKey, input.traceId),
    ),
    pageSize,
    nextCursor: rest.hasMore
      ? encodeBrandListCursor({
          phase: "rest",
          notionCursor: rest.notionCursor,
          buffer: rest.buffer,
        })
      : null,
    hasMore: rest.hasMore,
  };
}

export type { NeedsReplyBrandScope } from "./owner-filter";

/**
 * Full Needs Reply brand count for the Brands menu badge.
 * Dedupes by Follow-up Client (Brand) via listBrandReplySignals Map keys.
 */
export async function countNeedsReplyBrandsForViewer(
  input: NeedsReplyBrandScope = {},
): Promise<number> {
  const replySignals = await listBrandReplySignals([]).catch(() => new Map());
  const entries = [...replySignals.entries()];
  if (!entries.length) return 0;
  const metadata = await listReplyBrandMetadata(entries, input);

  let count = 0;
  for (const { brand } of metadata) {
    if (
      matchesNeedsReplyBrandScope(
        {
          ownerId: brand.ownerId,
          isTest: brand.isTest,
          status: brand.status,
        },
        input,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

/** Reply-due path: paginate matching Needs Reply brand IDs (no full ClientDB scan). */
async function listFollowupClientsByReplyDuePage(
  input: ListFollowupClientsPageInput,
  pageSize: number,
): Promise<ListFollowupClientsPageResult> {
  const replySignals = await listBrandReplySignals([]).catch(
    () => new Map<string, BrandReplySignal>(),
  );
  const matching = await listFilteredReplyBrands(input, replySignals);
  const matchingBrandByKey = new Map(
    matching.map((item) => [pageKey(item.id), item.brand]),
  );
  const offset = Math.max(0, Number(input.cursor || 0) || 0);
  const slice = matching.slice(offset, offset + pageSize);
  const brands = sortBrandListItems(
    await enrichBrandPage(
      slice.map((item) => item.page),
      replySignals,
      matchingBrandByKey,
      input.traceId,
    ),
  );
  const nextOffset = offset + pageSize;
  const hasMore = nextOffset < matching.length;
  return {
    brands,
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

async function resolveMeetingNotes(pageIds: string[]): Promise<BrandMeetingNote[]> {
  const pages = await Promise.all(
    pageIds.map(async (id) => {
      try {
        return await retrievePage(id);
      } catch {
        return null;
      }
    }),
  );
  return pages
    .filter((page): page is NotionPage => !!page)
    .map((page) => ({
      id: page.id,
      title: titleFromProperties(page.properties) || "Meeting note",
      url: notionPageUrl(page),
      nfcCardUrl: propertyText(page.properties?.["NFC Card URL"]) || null,
      sortAt: notionDate(page.properties?.["Meeting Time"]) || page.last_edited_time || "",
    }))
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt) || a.title.localeCompare(b.title))
    .map(({ id, title, url, nfcCardUrl }) => ({ id, title, url, nfcCardUrl }));
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
  const [brand, contacts, company, followupExhibition, meetingNotes] = await Promise.all([
    mapFollowupClientPage(page),
    listFollowupContacts(page.id, relationIds(properties["Follow-up Contacts"])),
    resolveClientCompany(firstRelationId(properties.Client)),
    resolveFollowupExhibition(page),
    resolveMeetingNotes(relationIds(properties["FC3.0-FollowUp-NotionAIMeetings"])),
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
    icpGroup: company.icpGroup,
    followupExhibition,
    meetingNotes,
    aiMeetingLinks: sortAiMeetingLinks(
      parseAiMeetingLinks(propertyText(properties[aiMeetingLinksPropertyName()])),
    ),
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
