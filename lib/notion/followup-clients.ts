import {
  brandInitials,
  currentCpOption,
  parseApplicableCp,
  type BrandDetail,
  type BrandListItem,
  type HandlingMode,
} from "../brand-list";
import { checkpointShortName, resolveCheckpoint } from "./cps";
import {
  firstRelationId,
  propertyText,
  relationIds,
  retrievePage,
  notionDate,
  rollupDate,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { listFollowupContacts } from "./contacts";
import { listFollowupConversations } from "./conversations";
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
