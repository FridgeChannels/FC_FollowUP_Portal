import {
  createClientCompany,
  isClientInFollowupClientDb,
  type ClientCompanySummary,
} from "./client-db-writes";
import { createFollowupContactWithKeyPerson } from "./followup-contact-writes";
import { createFollowupClient } from "./followup-writes";
import { propertyText, retrievePage, titleFromProperties } from "./client";

export type CreateBrandContactInput = {
  name: string;
  /** When set, Follow-up Contact links this existing KeyPerson (no duplicate create). */
  keyPersonId?: string | null;
  title?: string | null;
  ownerOrConnector?: "Owner" | "Connector" | null;
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
};

export type CreateBrandWithContactsInput = {
  /** Link an existing FC2.0 ClientDB page (skips company create). */
  clientPageId?: string | null;
  company?: {
    name: string;
    website?: string | null;
    productDescription?: string | null;
  } | null;
  ownerId?: string | null;
  /** Defaults to Human when omitted. */
  handlingMode?: string | null;
  /** Empty by default — omit Priority on Follow-up Client. */
  priority?: string | null;
  /** Checkpoint page id or short name (CP1…). Empty / NONE → no Current CP. */
  currentCpId?: string | null;
  /** ExhibitionDB page id for Follow-up Exhibition. */
  exhibitionId?: string | null;
  isTest?: boolean;
  notes?: string | null;
  contacts: CreateBrandContactInput[];
};

export type CreateBrandContactResult = {
  name: string;
  contactId?: string;
  keyPersonId?: string;
  error?: string;
};

async function resolveCompanyName(clientPageId: string, fallback?: string | null) {
  if (fallback?.trim()) return fallback.trim();
  try {
    const page = await retrievePage(clientPageId);
    const properties = page.properties || {};
    return (
      propertyText(properties["Company Name"]) ||
      titleFromProperties(properties) ||
      "Brand"
    );
  } catch {
    return fallback?.trim() || "Brand";
  }
}

export async function createBrandWithContacts(input: CreateBrandWithContactsInput) {
  const contacts = (input.contacts || []).filter((item) => item.name?.trim());
  if (!contacts.length) {
    throw new Error("At least one contact with a name is required");
  }

  let client: ClientCompanySummary;
  if (input.clientPageId?.trim()) {
    const clientPageId = input.clientPageId.trim();
    if (await isClientInFollowupClientDb(clientPageId)) {
      throw new Error("This company is already in Follow-up ClientDB");
    }
    const name = await resolveCompanyName(clientPageId, input.company?.name);
    client = {
      id: clientPageId,
      name,
      website: input.company?.website?.trim() || null,
      productDescription: input.company?.productDescription?.trim() || null,
    };
  } else {
    const companyName = input.company?.name?.trim() || "";
    if (!companyName) throw new Error("Company name is required");
    if (!input.company?.website?.trim()) throw new Error("Website is required");
    client = await createClientCompany({
      name: companyName,
      website: input.company?.website,
      productDescription: input.company?.productDescription,
    });
  }

  const followup = await createFollowupClient({
    name: client.name,
    clientPageId: client.id,
    ownerId: input.ownerId,
    handlingMode: input.handlingMode || "Human",
    priority: input.priority || null,
    currentCpId: input.currentCpId,
    exhibitionId: input.exhibitionId,
    isTest: input.isTest,
    notes: input.notes,
  });

  const contactResults: CreateBrandContactResult[] = [];
  for (const draft of contacts) {
    const name = draft.name.trim();
    try {
      const created = await createFollowupContactWithKeyPerson({
        followupClientId: followup.id,
        clientPageId: client.id,
        companyName: client.name,
        keyPersonId: draft.keyPersonId,
        name,
        title: draft.title,
        ownerOrConnector: draft.ownerOrConnector || null,
        email: draft.email,
        phone: draft.phone,
        directPhone: draft.directPhone,
        officePhone: draft.officePhone,
        whatsapp: draft.whatsapp,
        linkedin: draft.linkedin,
      });
      contactResults.push({
        name,
        contactId: created.contactId,
        keyPersonId: created.keyPersonId,
      });
    } catch (error) {
      contactResults.push({
        name,
        error: error instanceof Error ? error.message : "Unable to create contact",
      });
    }
  }

  return {
    brandId: followup.id,
    clientPageId: client.id,
    companyName: client.name,
    contacts: contactResults,
    contactErrors: contactResults.filter((item) => item.error),
  };
}
