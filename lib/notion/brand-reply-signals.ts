import type { BrandActivity, BrandListItem } from "../brand-list";
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

export type BrandReplySignal = {
  preview: string;
  updatedAt: string | null;
};

export type BrandInteractionSignal = Pick<
  BrandListItem,
  | "lastInteractionChannel"
  | "lastInteractionDirection"
  | "lastInteractionStatus"
  | "lastInteractionCallResult"
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

function conversationTime(page: NotionPage) {
  const properties = page.properties || {};
  return (
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

export async function listBrandReplySignals() {
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
    const brandId = await resolveBrandId(contactId, contactCache);
    if (!brandId) continue;

    const updatedAt = conversationTime(page);
    const existing = signals.get(brandId);
    if (existing && (existing.updatedAt || "") >= (updatedAt || "")) continue;

    signals.set(brandId, {
      preview: conversationPreview(page),
      updatedAt,
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
        replyUpdatedAt: null,
      };
    }
    return {
      ...brand,
      needsReply: true,
      replyPreview: signal.preview,
      replyUpdatedAt: signal.updatedAt,
    };
  });
}

function isCompletedInteraction(item: BrandActivity) {
  if (!item.createdAt) return false;
  if (item.direction === "Inbound") return true;
  if (item.channel === "Phone") return !!item.callResult || item.status === "Completed";
  return ["Sent", "Delivered", "Completed", "Received"].includes(item.status || "");
}

export async function listBrandInteractionSignals(pages: NotionPage[]) {
  const signals = new Map<string, BrandInteractionSignal>();
  await Promise.all(
    pages.map(async (page) => {
      const contactIds = relationIds(page.properties?.["Follow-up Contacts"]);
      if (!contactIds.length) return;
      try {
        const latest = (await listFollowupConversations(contactIds)).find(isCompletedInteraction);
        if (!latest) return;
        signals.set(page.id, {
          lastInteractionChannel: latest.channel,
          lastInteractionDirection: latest.direction,
          lastInteractionStatus: latest.status,
          lastInteractionCallResult: latest.callResult,
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
  return brands.map((brand) => ({
    ...brand,
    ...(byKey.get(pageKey(brand.id)) || {}),
  }));
}
