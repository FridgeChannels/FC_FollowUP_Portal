import type { BrandContact } from "../brand-list";
import { getFollowupContactDbId, getKeyPersonDbId } from "./config";
import {
  firstRelationId,
  notionFetch,
  propertyText,
  queryDatabasePages,
  retrievePage,
  rollupDate,
  titleFromProperties,
  type NotionPage,
} from "./client";

const VERIFIED_EMAIL_STATUSES = new Set(["Verified", "Icypeas Verified"]);
const CONTACT_ORDER: Record<string, number> = {
  Primary: 0,
  Secondary: 1,
  Backup: 2,
};

function asRole(value: string): BrandContact["role"] {
  if (value === "Owner" || value === "Connector") return value;
  return "Other";
}

function mapKeyPerson(page: NotionPage | null, fallbackName: string) {
  const properties = page?.properties || {};
  const name = titleFromProperties(properties) || fallbackName;
  const email = propertyText(properties.Email) || null;
  const phone = propertyText(properties.Phone) || null;
  const directPhone = propertyText(properties["Direct Phone"]) || null;
  const officePhone = propertyText(properties["Office Phone"]) || null;
  const whatsapp = propertyText(properties["WhatsApp Number"]) || null;
  const emailStatus = propertyText(properties["Email Verified Status"]);
  return {
    name,
    title: propertyText(properties.Title) || null,
    contactRole: propertyText(properties["Contact Role"]) || null,
    role: asRole(propertyText(properties.OwnerOrConnector)),
    email,
    phone,
    directPhone,
    officePhone,
    whatsapp,
    linkedin: propertyText(properties["LinkedIn URL"]) || null,
    keyPersonId: page?.id || null,
    emailValid: !!email && VERIFIED_EMAIL_STATUSES.has(emailStatus),
    phoneValid: !!phone,
  };
}

export async function mapFollowupContact(page: NotionPage): Promise<BrandContact> {
  const properties = page.properties || {};
  const fallbackName = titleFromProperties(properties) || "Untitled Contact";
  const keyPersonId = firstRelationId(properties["Key Person"]);
  let person: NotionPage | null = null;
  if (keyPersonId) {
    try {
      person = await retrievePage(keyPersonId);
    } catch {
      person = null;
    }
  }
  const keyPerson = mapKeyPerson(person, fallbackName);
  return {
    id: page.id,
    ...keyPerson,
    followupStatus: propertyText(properties["Follow-up Status"]) || null,
    followupMode: propertyText(properties["Follow-up Mode"]) || null,
    contactOrder: propertyText(properties["Contact Order"]) || null,
    notes: propertyText(properties.Notes) || null,
    lastInteractionAt: rollupDate(properties["Last Interaction At"]),
  };
}

async function queryContactsByClient(clientPageId: string) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupContactDbId()}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: {
          property: "Follow-up Client",
          relation: { contains: clientPageId },
        },
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export async function listFollowupContacts(
  clientPageId: string,
  relatedIds: string[] = [],
): Promise<BrandContact[]> {
  let pages: NotionPage[] = [];
  try {
    pages = await queryContactsByClient(clientPageId);
  } catch {
    pages = [];
  }
  if (!pages.length && relatedIds.length) {
    pages = (
      await Promise.all(
        relatedIds.map((id) => retrievePage(id).catch(() => null)),
      )
    ).filter((page): page is NotionPage => !!page);
  }

  const contacts = await Promise.all(pages.map(mapFollowupContact));
  return contacts.sort((a, b) => {
    const order =
      (CONTACT_ORDER[a.contactOrder || ""] ?? 9) -
      (CONTACT_ORDER[b.contactOrder || ""] ?? 9);
    return order || a.name.localeCompare(b.name);
  });
}

/** Single Follow-up Contact — used by Caller lite task detail. */
export async function retrieveFollowupContact(contactId: string): Promise<BrandContact> {
  const page = await retrievePage(contactId);
  return mapFollowupContact(page);
}

/** Contact page ids only — skips Key Person retrieves used on the detail shell. */
export async function listFollowupContactIds(
  clientPageId: string,
  relatedIds: string[] = [],
): Promise<string[]> {
  let pages: NotionPage[] = [];
  try {
    pages = await queryContactsByClient(clientPageId);
  } catch {
    pages = [];
  }
  if (pages.length) return pages.map((page) => page.id);
  return relatedIds;
}

async function queryKeyPersonsByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  // Notion email.equals is exact; try lowercase first, then original trim.
  const variants = [...new Set([normalized, email.trim()].filter(Boolean))];
  const byId = new Map<string, NotionPage>();
  for (const value of variants) {
    try {
      const pages = await queryDatabasePages(getKeyPersonDbId(), {
        property: "Email",
        email: { equals: value },
      });
      for (const page of pages) byId.set(page.id, page);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Misconfigured / unshared KeyPerson DB must not look like "contact missing".
      if (/could not find database|404|unauthorized|forbidden/i.test(message)) {
        throw new Error(
          `KeyPerson database unavailable for email lookup (${getKeyPersonDbId()}): ${message}`,
        );
      }
      throw error;
    }
  }
  return [...byId.values()];
}

async function queryContactsByKeyPerson(keyPersonId: string) {
  return queryDatabasePages(getFollowupContactDbId(), {
    property: "Key Person",
    relation: { contains: keyPersonId },
  }).catch(() => [] as NotionPage[]);
}

/**
 * Resolve Follow-up Contacts whose Key Person Email equals `email` (any brand).
 * Used by Email cold inbound when FollowUpClientId is omitted.
 */
export async function findFollowupContactsByEmail(email: string): Promise<BrandContact[]> {
  const people = await queryKeyPersonsByEmail(email);
  if (!people.length) return [];
  const contactPages: NotionPage[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    const pages = await queryContactsByKeyPerson(person.id);
    for (const page of pages) {
      if (seen.has(page.id)) continue;
      seen.add(page.id);
      contactPages.push(page);
    }
  }
  return Promise.all(contactPages.map(mapFollowupContact));
}
