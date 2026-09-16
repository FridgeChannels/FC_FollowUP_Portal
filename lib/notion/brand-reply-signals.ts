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
import { listFollowupConversations } from "./conversations";
import { REPLY_DUE_PROPERTY } from "./reply-due";
import { listFollowupTasks } from "./tasks";

export type BrandReplySignal = {
  preview: string;
  /** Reply Due At (fallback Interaction At for legacy rows). */
  dueAt: string | null;
};

export type BrandInteractionSignal = Pick<
  BrandListItem,
  | "lastInteractionChannel"
  | "lastInteractionDirection"
  | "lastInteractionStatus"
  | "lastInteractionCallResult"
  | "lastReplyAt"
>;

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

export async function listBrandReplySignals(clientPages: NotionPage[] = []) {
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
  const signals = new Map<string, BrandReplySignal>();

  for (const page of pages) {
    const contactId = firstRelationId(page.properties?.["Follow-up Contact"]);
    if (!contactId) continue;
    const brandId =
      contactToBrand.get(contactId) ||
      (await resolveBrandId(contactId, contactCache));
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
  await Promise.all(
    pages.map(async (page) => {
      const contactIds = relationIds(page.properties?.["Follow-up Contacts"]);
      if (!contactIds.length) return;
      try {
        const [conversations, tasks] = await Promise.all([
          listFollowupConversations(contactIds),
          listFollowupTasks(contactIds),
        ]);
        const taskStatusById = new Map(tasks.map((task) => [task.id, task.status]));
        const latest = conversations.find((item) => isCompletedInteraction(item, taskStatusById));
        const lastReplyAt = lastReplyAtFromActivities(conversations);
        if (!latest && !lastReplyAt) return;
        signals.set(page.id, {
          lastInteractionChannel: latest?.channel ?? null,
          lastInteractionDirection: latest?.direction ?? null,
          lastInteractionStatus: latest ? interactionStatusLabel(latest, taskStatusById) : null,
          lastInteractionCallResult: latest?.callResult ?? null,
          lastReplyAt,
        });
      } catch {
        // The date rollup remains available if conversation metadata cannot be loaded.
      }
    }),
  );
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
      lastReplyAt: signal.lastReplyAt || brand.lastReplyAt,
    };
  });
}
