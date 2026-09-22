import {
  createPage,
  firstRelationId,
  notionFetch,
  propertyText,
  richText,
  retrievePage,
  titleFromProperties,
  updatePage,
  type NotionPage,
} from "./client";
import { getKeyPersonDbId } from "./config";
import { formatStandardPhone } from "../phone-format.ts";

export type KeyPersonContactPatch = {
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  setIcypeasVerified?: boolean;
};

export type CreateKeyPersonInput = {
  name: string;
  title?: string | null;
  ownerOrConnector?: "Owner" | "Connector" | null;
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  /** FC2.0-ClientDB page id from Follow-up Client.Client */
  clientPageId?: string | null;
};

function titleProperty(name: string) {
  return { title: richText(name.trim()) };
}

function asPhoneProperty(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value?.trim()) return { phone_number: null };
  const formatted = formatStandardPhone(value);
  return { phone_number: formatted?.formatted || value.trim() };
}

export function keyPersonContactProperties(patch: KeyPersonContactPatch) {
  const properties: Record<string, unknown> = {};
  if (patch.email !== undefined) {
    properties.Email = { email: patch.email?.trim() || null };
    if (patch.email?.trim() && patch.setIcypeasVerified !== false) {
      properties["Email Verified Status"] = { status: { name: "Icypeas Verified" } };
    }
  }
  if (patch.phone !== undefined) {
    // Phone = mobile only — drop extensions into null rather than storing ext here.
    const formatted = patch.phone?.trim() ? formatStandardPhone(patch.phone) : null;
    if (formatted?.hasExtension) {
      properties.Phone = { phone_number: null };
      if (patch.officePhone === undefined) {
        properties["Office Phone"] = { phone_number: formatted.formatted };
      }
    } else {
      properties.Phone = asPhoneProperty(patch.phone)!;
    }
  }
  if (patch.directPhone !== undefined) {
    properties["Direct Phone"] = asPhoneProperty(patch.directPhone)!;
  }
  if (patch.officePhone !== undefined) {
    properties["Office Phone"] = asPhoneProperty(patch.officePhone)!;
  }
  if (patch.whatsapp !== undefined) {
    // WhatsApp Number = mobile only (same standard format as Phone; never with ext).
    const formatted = patch.whatsapp?.trim() ? formatStandardPhone(patch.whatsapp) : null;
    if (formatted?.hasExtension) {
      properties["WhatsApp Number"] = { phone_number: null };
    } else {
      properties["WhatsApp Number"] = asPhoneProperty(patch.whatsapp)!;
    }
  }
  if (patch.linkedin !== undefined) {
    properties["LinkedIn URL"] = { url: patch.linkedin?.trim() || null };
  }
  return properties;
}

export async function createKeyPerson(input: CreateKeyPersonInput) {
  const name = input.name.trim();
  if (!name) throw new Error("KeyPerson name is required");

  const properties: Record<string, unknown> = {
    name: titleProperty(name),
  };
  if (input.title?.trim()) {
    properties.Title = { rich_text: richText(input.title.trim()) };
  }
  if (input.ownerOrConnector === "Owner" || input.ownerOrConnector === "Connector") {
    properties.OwnerOrConnector = { select: { name: input.ownerOrConnector } };
  }
  Object.assign(
    properties,
    keyPersonContactProperties({
      email: input.email?.trim() ? input.email : undefined,
      phone: input.phone?.trim() ? input.phone : undefined,
      directPhone: input.directPhone?.trim() ? input.directPhone : undefined,
      officePhone: input.officePhone?.trim() ? input.officePhone : undefined,
      whatsapp: input.whatsapp?.trim() ? input.whatsapp : undefined,
      linkedin: input.linkedin?.trim() ? input.linkedin : undefined,
      // Portal Add Brand / Add KeyPerson: email present → set Email Verified Status.
      setIcypeasVerified: true,
    }),
  );
  if (input.clientPageId) {
    properties.Client = { relation: [{ id: input.clientPageId }] };
  }

  return createPage(getKeyPersonDbId(), properties);
}

export async function updateKeyPersonContacts(
  keyPersonId: string,
  patch: KeyPersonContactPatch,
) {
  const properties = keyPersonContactProperties(patch);
  if (!Object.keys(properties).length) {
    return retrievePage(keyPersonId);
  }
  return updatePage(keyPersonId, properties);
}

export function readKeyPersonContacts(page: NotionPage) {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: titleFromProperties(properties) || propertyText(properties.name) || "",
    title: propertyText(properties.Title) || null,
    ownerOrConnector: (() => {
      const role = propertyText(properties.OwnerOrConnector);
      return role === "Owner" || role === "Connector" ? role : null;
    })(),
    email: propertyText(properties.Email) || null,
    phone: propertyText(properties.Phone) || null,
    directPhone: propertyText(properties["Direct Phone"]) || null,
    officePhone: propertyText(properties["Office Phone"]) || null,
    whatsapp: propertyText(properties["WhatsApp Number"]) || null,
    linkedin: propertyText(properties["LinkedIn URL"]) || null,
    clientPageId: firstRelationId(properties.Client),
  };
}

export async function retrieveKeyPerson(keyPersonId: string) {
  const page = await retrievePage(keyPersonId);
  return { page, ...readKeyPersonContacts(page) };
}

/** KeyPersons linked to an FC2.0 ClientDB company page. */
export async function listKeyPersonsByClient(clientPageId: string) {
  const id = clientPageId.trim();
  if (!id) return [];
  // Single page query is enough — one company rarely has >100 KeyPersons.
  // Avoid queryDatabasePages auto-pagination under rate-limit pressure.
  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getKeyPersonDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        filter: {
          property: "Client",
          relation: { contains: id },
        },
      }),
    },
  );
  return (data.results || [])
    .map(readKeyPersonContacts)
    .filter((item) => item.name.trim())
    .sort((a, b) => a.name.localeCompare(b.name));
}
