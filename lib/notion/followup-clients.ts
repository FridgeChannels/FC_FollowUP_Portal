import {
  brandInitials,
  type BrandDetail,
  type BrandListItem,
  type HandlingMode,
} from "../brand-list";
import {
  firstRelationId,
  propertyText,
  relationIds,
  retrievePage,
  rollupDate,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { listFollowupContacts } from "./contacts";
import { listFollowupConversations } from "./conversations";
import { listFollowupTasks } from "./tasks";
import { retrieveOwner, type FollowupOwner } from "./owners";

const HANDLING_MODES = new Set(["Automated", "Human"]);

function asHandlingMode(value: string): HandlingMode | null {
  return HANDLING_MODES.has(value) ? (value as HandlingMode) : null;
}

async function resolveRelatedTitle(
  pageId: string | undefined,
  cache: Map<string, string>,
) {
  if (!pageId) return "";
  const cached = cache.get(pageId);
  if (cached !== undefined) return cached;
  const page = await retrievePage(pageId);
  const title = titleFromProperties(page.properties);
  cache.set(pageId, title);
  return title;
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
  const cpId = firstRelationId(properties["Current CP"]);
  const ownerId = firstRelationId(properties.Owner);
  const [clientName, currentCp, owner] = await Promise.all([
    resolveRelatedTitle(clientId, titleCache),
    resolveRelatedTitle(cpId, titleCache),
    resolveOwner(ownerId, ownerCache),
  ]);
  const name = clientName || followupTitle || "Untitled Client";

  return {
    id: page.id,
    name,
    initials: brandInitials(name),
    currentCp: currentCp || "NONE",
    status: propertyText(properties["Follow-up Status"]),
    handlingMode: asHandlingMode(propertyText(properties["Handling Mode"])),
    lastInteractionAt: rollupDate(properties["Last Interaction At"]),
    ownerId: owner?.id || ownerId || null,
    ownerName: owner?.name || null,
    ownerEmail: owner?.account || null,
  };
}

export async function mapFollowupClientPages(pages: NotionPage[]) {
  const titleCache = new Map<string, string>();
  const ownerCache = new Map<string, FollowupOwner | null>();
  const brands: BrandListItem[] = [];
  for (const page of pages) {
    brands.push(await mapFollowupClientPage(page, titleCache, ownerCache));
  }
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveCpMeta(pageId: string | undefined) {
  if (!pageId) return { fullName: null, definition: null };
  try {
    const page = await retrievePage(pageId);
    const properties = page.properties || {};
    return {
      fullName: propertyText(properties["Full Name"]) || null,
      definition: propertyText(properties["Chinese Definition"]) || null,
    };
  } catch {
    return { fullName: null, definition: null };
  }
}

async function resolveBombMeta(pageId: string) {
  try {
    const page = await retrievePage(pageId);
    const properties = page.properties || {};
    const cpId = firstRelationId(properties["Applicable CP"]);
    let cp: string | null = null;
    if (cpId) {
      try {
        const cpPage = await retrievePage(cpId);
        cp = titleFromProperties(cpPage.properties) || null;
      } catch {
        cp = null;
      }
    }
    return {
      name: titleFromProperties(properties) || "Untitled Bomb",
      cp,
    };
  } catch {
    return { name: "Untitled Bomb", cp: null };
  }
}

export async function mapFollowupClientDetail(page: NotionPage): Promise<BrandDetail> {
  const properties = page.properties || {};
  const [brand, cpMeta, contacts] = await Promise.all([
    mapFollowupClientPage(page),
    resolveCpMeta(firstRelationId(properties["Current CP"])),
    listFollowupContacts(page.id, relationIds(properties["Follow-up Contacts"])),
  ]);
  const contactIds = contacts.map((item) => item.id);
  const [activities, tasks] = await Promise.all([
    listFollowupConversations(contactIds),
    listFollowupTasks(contactIds),
  ]);
  const bombIds = [...new Set(tasks.map((item) => item.sourceBombId).filter((id): id is string => !!id))];
  const bombMeta = new Map(
    await Promise.all(
      bombIds.map(async (id) => [id, await resolveBombMeta(id)] as const),
    ),
  );
  return {
    ...brand,
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
