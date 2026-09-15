import type { BrandListItem } from "../brand-list";
import {
  firstRelationId,
  propertyDate,
  propertyText,
  queryDatabasePages,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupConversationDbId } from "./config";

export type BrandReplySignal = {
  preview: string;
  updatedAt: string | null;
};

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
