import {
  createPage,
  firstRelationId,
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
      setIcypeasVerified: false,
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
