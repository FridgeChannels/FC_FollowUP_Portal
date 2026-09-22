import { createPage, firstRelationId, relationIds, richText, retrievePage, updatePage } from "./client";
import { getFollowupContactDbId } from "./config";
import { listFollowupContacts } from "./contacts";
import { createKeyPerson, type CreateKeyPersonInput } from "./key-person-writes";

export type CreateFollowupContactInput = {
  followupClientId: string;
  clientPageId?: string | null;
  companyName?: string | null;
  /** Reuse an existing KeyPerson instead of creating a new one. */
  keyPersonId?: string | null;
  name: string;
  title?: string | null;
  ownerOrConnector?: "Owner" | "Connector" | null;
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  contactOrder?: "Primary" | "Secondary" | "Backup" | null;
  followupMode?: "Automated" | "Manual";
};

function contactTitle(companyName: string | null | undefined, personName: string) {
  const company = companyName?.trim() || "Brand";
  return `${company} — ${personName.trim()}`;
}

export async function createFollowupContactWithKeyPerson(input: CreateFollowupContactInput) {
  const name = input.name.trim();
  if (!name) throw new Error("KeyPerson name is required");
  if (!input.followupClientId) throw new Error("Follow-up Client is required");

  let keyPersonId = input.keyPersonId?.trim() || "";
  if (keyPersonId) {
    // Ensure the page exists; do not rewrite master KeyPerson on link.
    await retrievePage(keyPersonId);
  } else {
    const keyPersonInput: CreateKeyPersonInput = {
      name,
      title: input.title,
      ownerOrConnector: input.ownerOrConnector,
      email: input.email,
      phone: input.phone,
      directPhone: input.directPhone,
      officePhone: input.officePhone,
      whatsapp: input.whatsapp,
      linkedin: input.linkedin,
      clientPageId: input.clientPageId,
    };
    const keyPerson = await createKeyPerson(keyPersonInput);
    keyPersonId = keyPerson.id;
  }

  const properties: Record<string, unknown> = {
    "Follow-up Contact": { title: richText(contactTitle(input.companyName, name)) },
    "Follow-up Client": { relation: [{ id: input.followupClientId }] },
    "Key Person": { relation: [{ id: keyPersonId }] },
    "Follow-up Status": { status: { name: "Not Contacted" } },
    "Follow-up Mode": { select: { name: input.followupMode || "Automated" } },
  };
  if (input.contactOrder) {
    properties["Contact Order"] = { select: { name: input.contactOrder } };
  }

  const contact = await createPage(getFollowupContactDbId(), properties);

  // Dual relation usually syncs; ensure Follow-up Client lists the new contact.
  try {
    const clientPage = await retrievePage(input.followupClientId);
    const existing = relationIds(clientPage.properties?.["Follow-up Contacts"]);
    if (!existing.includes(contact.id)) {
      await updatePage(input.followupClientId, {
        "Follow-up Contacts": {
          relation: [...existing, contact.id].map((id) => ({ id })),
        },
      });
    }
  } catch {
    // Dual property may already sync; ignore append failures.
  }

  const contacts = await listFollowupContacts(input.followupClientId);
  const created = contacts.find((item) => item.id === contact.id) || null;
  return {
    contactId: contact.id,
    keyPersonId,
    contact: created,
    contacts,
  };
}

export async function resolveKeyPersonIdFromContact(contactId: string) {
  const page = await retrievePage(contactId);
  const keyPersonId = firstRelationId(page.properties?.["Key Person"]);
  if (!keyPersonId) throw new Error("Follow-up Contact has no Key Person");
  const followupClientId = firstRelationId(page.properties?.["Follow-up Client"]);
  return { keyPersonId, followupClientId, contactPage: page };
}
