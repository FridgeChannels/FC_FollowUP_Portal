import { lastReplyAtFromActivities, type BrandActivity, type BrandListItem } from "../brand-list";
import {
  firstRelationId,
  propertyDate,
  propertyText,
  queryDatabasePages,
  retrievePage,
  relationIds,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupConversationDbId } from "./config";
import { listFollowupConversationsByBrands } from "./conversations";
import { getCachedBrandReplySignals } from "./brand-reply-signal-cache";
import { REPLY_DUE_PROPERTY } from "./reply-due";
import { listFollowupTaskSignalsByBrands } from "./tasks";

export type BrandReplySignal = {
  preview: string;
  /** Reply Due At (fallback Interaction At for legacy rows). */
  dueAt: string | null;
};

export type BrandInteractionSignal = Pick<
  BrandListItem,
  | "lastInteractionAt"
  | "lastInteractionChannel"
  | "lastInteractionDirection"
  | "lastInteractionStatus"
  | "lastInteractionCallResult"
  | "lastReplyAt"
  | "needsQualification"
  | "qualificationTaskCount"
>;

function interactionOccurredAt(item: BrandActivity) {
  return item.scheduledAt || item.recordedAt || item.createdAt || null;
}

function conversationPreview(page: NotionPage) {
  const properties = page.properties || {};
  return (
    propertyText(properties.Content) ||
    propertyText(properties.Subject) ||
    titleFromProperties(properties) ||
    "Inbound reply"
  );
}

function conversationDueAt(page: NotionPage) {
  const properties = page.properties || {};
  return (
    propertyDate(properties[REPLY_DUE_PROPERTY]) ||
    propertyDate(properties["Interaction At"]) ||
    page.created_time ||
    null
  );
}

async function resolveBrandId(
  contactId: string,
  cache: Map<string, string | null>,
) {
  if (cache.has(contactId)) return cache.get(contactId) || null;
  try {
    const page = await retrievePage(contactId);
    const brandId =
      firstRelationId(page.properties?.["Follow-up Client"]) || null;
    cache.set(contactId, brandId);
    return brandId;
  } catch {
    cache.set(contactId, null);
    return null;
  }
}

async function resolveBrandIds(
  contactIds: string[],
  cache: Map<string, string | null>,
) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < contactIds.length) {
      const contactId = contactIds[nextIndex];
      nextIndex += 1;
      await resolveBrandId(contactId, cache);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(3, contactIds.length) }, () => worker()),
  );
}

async function loadBrandReplySignals(clientPages: NotionPage[]) {
  const contactToBrand = new Map<string, string>();
  for (const page of clientPages) {
    for (const contactId of relationIds(page.properties?.["Follow-up Contacts"])) {
      contactToBrand.set(contactId, page.id);
    }
  }

  const pages = await queryDatabasePages(getFollowupConversationDbId(), {
    and: [
      { property: "Reply Status", select: { equals: "Needs Reply" } },
      { property: "Direction", select: { equals: "Inbound" } },
    ],
  });

  const contactCache = new Map<string, string | null>();
  const unresolvedContactIds = [
    ...new Set(
      pages.flatMap((page) => {
        if (firstRelationId(page.properties?.["Follow-up Client"])) return [];
        const contactId = firstRelationId(
          page.properties?.["Follow-up Contact"],
        );
        return contactId && !contactToBrand.has(contactId) ? [contactId] : [];
      }),
    ),
  ];
  await resolveBrandIds(unresolvedContactIds, contactCache);

  const signals = new Map<string, BrandReplySignal>();

  for (const page of pages) {
    const contactId = firstRelationId(page.properties?.["Follow-up Contact"]);
    const brandId =
      firstRelationId(page.properties?.["Follow-up Client"]) ||
      (contactId ? contactToBrand.get(contactId) : null) ||
      (contactId ? contactCache.get(contactId) : null) ||
      null;
    if (!brandId) continue;

    const dueAt = conversationDueAt(page);
    const existing = signals.get(brandId);
    // Prefer the earliest due (most urgent) for the brand list badge.
    if (existing?.dueAt && dueAt && existing.dueAt <= dueAt) continue;
    if (existing?.dueAt && !dueAt) continue;

    signals.set(brandId, {
      preview: conversationPreview(page),
      dueAt,
    });
  }

  return signals;
}

export async function listBrandReplySignals(clientPages: NotionPage[] = []) {
  return getCachedBrandReplySignals(() => loadBrandReplySignals(clientPages));
}

function pageKey(id: string) {
  return id.replace(/-/g, "").toLowerCase();
}

export function attachBrandReplySignals(
  brands: BrandListItem[],
  signals: Map<string, BrandReplySignal>,
): BrandListItem[] {
  const byKey = new Map(
    [...signals.entries()].map(([id, signal]) => [pageKey(id), signal]),
  );
  return brands.map((brand) => {
    const signal = byKey.get(pageKey(brand.id));
    if (!signal) {
      return {
        ...brand,
        needsReply: false,
        replyPreview: null,
        replyDueAt: null,
        replyUpdatedAt: null,
      };
    }
    return {
      ...brand,
      needsReply: true,
      replyPreview: signal.preview,
      replyDueAt: signal.dueAt,
      replyUpdatedAt: signal.dueAt,
    };
  });
}

function isCompletedInteraction(
  item: BrandActivity,
  taskStatusById: Map<string, string | null>,
) {
  if (!item.createdAt) return false;
  if (item.direction === "Inbound") return true;
  const taskStatus = item.taskId ? taskStatusById.get(item.taskId) ?? null : null;
  if (item.channel === "Phone") {
    return !!item.callResult || taskStatus === "Completed";
  }
  return taskStatus === "Completed";
}

function interactionStatusLabel(
  item: BrandActivity,
  taskStatusById: Map<string, string | null>,
) {
  if (item.direction === "Inbound") return null;
  return (item.taskId ? taskStatusById.get(item.taskId) : null) || null;
}

export async function listBrandInteractionSignals(pages: NotionPage[]) {
  const signals = new Map<string, BrandInteractionSignal>();
  const brandIds = pages.map((page) => page.id);
  if (!brandIds.length) {
    for (const page of pages) {
      signals.set(page.id, {
        lastInteractionAt: null,
        lastInteractionChannel: null,
        lastInteractionDirection: null,
        lastInteractionStatus: null,
        lastInteractionCallResult: null,
        lastReplyAt: null,
        needsQualification: false,
        qualificationTaskCount: 0,
      });
    }
    return signals;
  }

  try {
    const [allConversations, allTasks] = await Promise.all([
      listFollowupConversationsByBrands(brandIds),
      listFollowupTaskSignalsByBrands(brandIds),
    ]);
    for (const page of pages) {
      const brandKey = pageKey(page.id);
      const conversations = allConversations.filter(
        (item) => !!item.brandId && pageKey(item.brandId) === brandKey,
      );
      const tasks = allTasks.filter(
        (task) => !!task.brandId && pageKey(task.brandId) === brandKey,
      );
      const taskStatusById = new Map(tasks.map((task) => [task.id, task.status]));
      const qualificationTaskCount = tasks.filter(
        (task) =>
          task.channel === "Phone" &&
          task.callReviewStatus === "Awaiting Review",
      ).length;
      const latest = conversations.find((item) =>
        isCompletedInteraction(item, taskStatusById),
      );
      const lastReplyAt = lastReplyAtFromActivities(conversations);
      signals.set(page.id, {
        lastInteractionAt: latest ? interactionOccurredAt(latest) : null,
        lastInteractionChannel: latest?.channel ?? null,
        lastInteractionDirection: latest?.direction ?? null,
        lastInteractionStatus: latest
          ? interactionStatusLabel(latest, taskStatusById)
          : null,
        lastInteractionCallResult: latest?.callResult ?? null,
        lastReplyAt,
        needsQualification: qualificationTaskCount > 0,
        qualificationTaskCount,
      });
    }
  } catch {
    // Leave unset so the Brands list keeps its Notion rollup fallback.
  }
  return signals;
}

export function attachBrandInteractionSignals(
  brands: BrandListItem[],
  signals: Map<string, BrandInteractionSignal>,
) {
  const byKey = new Map(
    [...signals.entries()].map(([id, signal]) => [pageKey(id), signal]),
  );
  return brands.map((brand) => {
    const signal = byKey.get(pageKey(brand.id));
    if (!signal) return brand;
    return {
      ...brand,
      ...signal,
      // Conversation-derived time wins over ClientDB rollup.
      lastInteractionAt: signal.lastInteractionAt,
      lastReplyAt: signal.lastReplyAt || brand.lastReplyAt,
    };
  });
}
