import type { BrandTask } from "../brand-list";

/** Minimal page shape — avoids importing Notion client (config/env) from unit tests. */
export type CallerListTaskPage = {
  id: string;
  created_time?: string | null;
  properties?: Record<string, {
    type?: string;
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name?: string } | null;
    status?: { name?: string } | null;
    date?: { start?: string | null } | null;
    relation?: Array<{ id: string }>;
    [key: string]: unknown;
  }>;
};

type CallerListProperty = NonNullable<CallerListTaskPage["properties"]>[string];

export type CallerListBrand = {
  id: string;
  name: string;
  ownerId: string | null;
  isTest: boolean;
};

function plainText(items?: Array<{ plain_text?: string }>) {
  return (items || []).map((item) => item.plain_text || "").join("").trim();
}

function propertyText(property?: CallerListProperty) {
  if (!property) return "";
  if (property.type === "title") return plainText(property.title);
  if (property.type === "rich_text") return plainText(property.rich_text);
  if (property.type === "status") return property.status?.name || "";
  if (property.type === "select") return property.select?.name || "";
  return "";
}

function propertyDate(property?: CallerListProperty) {
  return property?.date?.start || null;
}

function firstRelationId(property?: CallerListProperty) {
  return property?.relation?.[0]?.id;
}

function titleFromProperties(properties?: CallerListTaskPage["properties"]) {
  if (!properties) return "";
  for (const value of Object.values(properties)) {
    if (value?.type === "title") return plainText(value.title);
  }
  return "";
}

/**
 * Caller ReplyTask list row from TaskDB query properties only.
 * Brand fields are filled later by list hydrate (Client pages, not Contact/Owner/KeyPerson).
 */
export function callerListTaskFromPage(
  page: CallerListTaskPage,
  brand?: CallerListBrand | null,
): BrandTask {
  const properties = page.properties || {};
  const brandId =
    brand?.id || firstRelationId(properties["Follow-up Client"]) || null;
  const callReviewStatus = propertyText(properties["Call Review Status"]);
  return {
    id: page.id,
    title: titleFromProperties(properties) || "Untitled Task",
    contactId: firstRelationId(properties["Follow-up Contact"]) || null,
    contactName: null,
    brandId,
    brandName: brand?.name || null,
    brandOwnerId: brand?.ownerId || null,
    brandIsTest: Boolean(brand?.isTest),
    ownerId: firstRelationId(properties.Owner) || null,
    ownerName: null,
    contactPhone: null,
    channel: propertyText(properties.Channel) || null,
    status: propertyText(properties["Task Status"]) || null,
    priority: propertyText(properties.Priority) || null,
    creationMethod: propertyText(properties["Creation Method"]) || null,
    scheduledAt: propertyDate(properties["Scheduled At"]),
    endedAt: propertyDate(properties["Ended At"]),
    createdAt: page.created_time || null,
    notes: null,
    conversationIds: [],
    templateId: firstRelationId(properties.Template) || null,
    sourceBombId: firstRelationId(properties["Source Bomb"]) || null,
    omniReachRunId: propertyText(properties["OmniReach Run Id"]) || null,
    callReviewStatus:
      callReviewStatus === "Awaiting Review" ||
      callReviewStatus === "Qualified" ||
      callReviewStatus === "Unqualified"
        ? callReviewStatus
        : null,
    callReviewReason: propertyText(properties["Call Review Reason"]) || null,
    callQualifiedAt: propertyDate(properties["Call Qualified At"]),
    callReviewHistoryText: null,
    callReviewHistory: [],
  };
}
