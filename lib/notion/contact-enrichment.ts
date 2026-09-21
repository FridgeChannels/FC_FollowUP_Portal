import {
  findPhoneWithFullenrich,
  mapFullenrichError,
} from "../fullenrich";
import {
  diffEnrichment,
  emailSearch,
  icypeasNamePayload,
  mapIcypeasError,
  pickBestEmail,
  pollSingleSearch,
  reverseEmailLookup,
  scrapeProfile,
  urlSearchProfile,
  type EnrichConflict,
  type EnrichFieldKey,
} from "../icypeas";
import { formatStandardPhone, classifyRawPhone } from "../phone-format.ts";
import {
  mapWaProbeError,
  probeWhatsappNumber,
  toProbeE164,
} from "../wa-probe";
import { firstRelationId, propertyText, retrievePage, titleFromProperties } from "./client";
import { listFollowupContacts } from "./contacts";
import { resolveKeyPersonIdFromContact } from "./followup-contact-writes";
import {
  readKeyPersonContacts,
  updateKeyPersonContacts,
} from "./key-person-writes";

export type EnrichmentSource = "icypeas" | "fullenrich" | "wa-probe" | "existing";

export type EnrichmentResult = {
  applied: Partial<Record<EnrichFieldKey, string>>;
  conflicts: EnrichConflict[];
  unchanged: EnrichFieldKey[];
  notFound: EnrichFieldKey[];
  found: {
    email: string | null;
    phone: string | null;
    directPhone: string | null;
    officePhone: string | null;
    whatsapp: string | null;
    linkedin: string | null;
  };
  sources: Partial<Record<EnrichFieldKey, EnrichmentSource>>;
  steps: string[];
  keyPersonId: string;
  contacts: Awaited<ReturnType<typeof listFollowupContacts>>;
};

async function resolveCompanyName(followupClientId: string) {
  const page = await retrievePage(followupClientId);
  const clientId = firstRelationId(page.properties?.Client);
  if (!clientId) {
    return propertyText(page.properties?.["Follow-up Client"]) || "";
  }
  try {
    const client = await retrievePage(clientId);
    return (
      propertyText(client.properties?.["Company Name"]) ||
      titleFromProperties(client.properties) ||
      propertyText(client.properties?.name) ||
      propertyText(client.properties?.Name) ||
      ""
    );
  } catch {
    return "";
  }
}

export async function enrichFollowupContact(input: {
  followupClientId: string;
  contactId: string;
}): Promise<EnrichmentResult> {
  const { keyPersonId, followupClientId, contactPage } = await resolveKeyPersonIdFromContact(
    input.contactId,
  );
  if (followupClientId && followupClientId !== input.followupClientId) {
    throw new Error("Contact does not belong to this brand");
  }

  const keyPersonPage = await retrievePage(keyPersonId);
  const person = readKeyPersonContacts(keyPersonPage);
  const fallbackName = titleFromProperties(contactPage.properties) || "";
  const personName = person.name.trim() || fallbackName.trim();
  const companyName = await resolveCompanyName(input.followupClientId);

  const emailNames = icypeasNamePayload(personName, "email");
  const profileNames = icypeasNamePayload(personName, "profile");
  const hasName = Boolean(emailNames.firstname || emailNames.lastname);

  // Reuse fields already stored on KeyPerson — do not re-buy them.
  const found = {
    email: person.email || null,
    phone: person.phone || null,
    directPhone: person.directPhone || null,
    officePhone: person.officePhone || null,
    whatsapp: person.whatsapp || null,
    linkedin: person.linkedin || null,
  };
  const sources: Partial<Record<EnrichFieldKey, EnrichmentSource>> = {};
  const steps: string[] = [];
  if (person.email) sources.email = "existing";
  if (person.phone) sources.phone = "existing";
  if (person.directPhone) sources.directPhone = "existing";
  if (person.officePhone) sources.officePhone = "existing";
  if (person.whatsapp) sources.whatsapp = "existing";
  if (person.linkedin) sources.linkedin = "existing";

  if (!hasName && !found.email && !found.phone && !found.linkedin) {
    throw new Error("KeyPerson needs a name, email, LinkedIn, or Phone to enrich");
  }

  // --- Email: keep existing; otherwise Icypeas name + company ---
  if (found.email) {
    steps.push("Email already on file — using it");
  } else if (!hasName || !companyName.trim()) {
    steps.push("Icypeas email skipped: name and company are required when Email is empty");
  } else {
    steps.push("Icypeas: looking up email");
    try {
      const emailJob = await emailSearch({
        firstname: emailNames.firstname,
        lastname: emailNames.lastname,
        domainOrCompany: companyName,
        externalId: keyPersonId,
      });
      const emailItem = await pollSingleSearch(emailJob.id);
      found.email = pickBestEmail(emailItem.results?.emails) || null;
      if (found.email) {
        sources.email = "icypeas";
        steps.push("Icypeas: email found");
      } else {
        steps.push("Icypeas: email not found");
      }
    } catch (error) {
      const mapped = mapIcypeasError(error);
      if (mapped.creditsExhausted) {
        throw Object.assign(new Error(mapped.message), mapped);
      }
      steps.push(`Icypeas email skipped: ${mapped.message}`);
    }
  }

  // --- LinkedIn: keep existing; else reverse-lookup from email, else name+company ---
  if (person.linkedin) {
    steps.push("LinkedIn already on file — using it");
  } else {
    if (found.email) {
      steps.push("Icypeas: looking up LinkedIn from email");
      try {
        const reversed = await reverseEmailLookup(found.email);
        if (reversed.linkedinUrl) {
          found.linkedin = reversed.linkedinUrl;
          sources.linkedin = "icypeas";
          steps.push("Icypeas: LinkedIn found from email");
        } else {
          steps.push("Icypeas: LinkedIn not found from email");
        }
      } catch (error) {
        const mapped = mapIcypeasError(error);
        if (mapped.creditsExhausted) {
          throw Object.assign(new Error(mapped.message), mapped);
        }
        steps.push(`Icypeas email→LinkedIn skipped: ${mapped.message}`);
      }
    }
    if (!found.linkedin && hasName && (companyName.trim() || person.title?.trim())) {
      steps.push("Icypeas: looking up LinkedIn by name");
      try {
        const urlResult = await urlSearchProfile({
          firstname: profileNames.firstname,
          lastname: profileNames.lastname,
          companyOrDomain: companyName,
          jobTitle: person.title || undefined,
        });
        if (urlResult.linkedinUrl) {
          found.linkedin = urlResult.linkedinUrl;
          sources.linkedin = "icypeas";
          steps.push("Icypeas: LinkedIn found by name");
        } else {
          steps.push("Icypeas: LinkedIn not found by name");
        }
      } catch (error) {
        const mapped = mapIcypeasError(error);
        if (mapped.creditsExhausted) {
          throw Object.assign(new Error(mapped.message), mapped);
        }
        steps.push(`Icypeas LinkedIn skipped: ${mapped.message}`);
      }
    } else if (!found.linkedin && !found.email) {
      steps.push("Icypeas LinkedIn skipped: no email, and name/company missing");
    }
  }

  const phoneAlreadyOnFile = Boolean(person.phone?.trim());
  if (phoneAlreadyOnFile) {
    steps.push("Phone already on file — skip phone lookup");
  }

  if (!phoneAlreadyOnFile && found.linkedin && !found.phone) {
    steps.push("Icypeas: scraping LinkedIn for phone");
    try {
      const scraped = await scrapeProfile(found.linkedin);
      if (scraped.phoneNumber) {
        const classified = classifyRawPhone(scraped.phoneNumber);
        if (classified.phone) {
          found.phone = classified.phone;
          sources.phone = "icypeas";
          steps.push("Icypeas: Phone (mobile) found");
        }
        if (classified.officePhone) {
          found.officePhone = classified.officePhone;
          sources.officePhone = "icypeas";
          steps.push("Icypeas: Office Phone found (has ext — not stored in Phone)");
        }
        if (classified.directPhone) {
          found.directPhone = classified.directPhone;
          sources.directPhone = "icypeas";
        }
        if (!classified.phone && !classified.officePhone && !classified.directPhone) {
          steps.push("Icypeas: phone value could not be normalized");
        }
      } else {
        steps.push("Icypeas: phone not found on LinkedIn");
      }
      if (!found.email && scraped.linkedinEmail) {
        found.email = scraped.linkedinEmail;
        sources.email = "icypeas";
      }
      if (scraped.linkedinUrl) found.linkedin = scraped.linkedinUrl;
    } catch (error) {
      const mapped = mapIcypeasError(error);
      if (mapped.creditsExhausted) {
        throw Object.assign(new Error(mapped.message), mapped);
      }
      steps.push(`Icypeas phone scrape skipped: ${mapped.message}`);
    }
  }

  const emailForPhone = found.email;
  const linkedinForPhone = found.linkedin;

  // --- FullEnrich: only when Phone is still empty ---
  if (phoneAlreadyOnFile) {
    // Phone column is reused as-is; Direct/Office already on file stay put.
  } else if (!found.phone && (linkedinForPhone || emailForPhone || companyName)) {
    const via = linkedinForPhone ? "LinkedIn" : emailForPhone ? "email/company" : "company";
    steps.push(`FullEnrich: looking up phones via ${via}`);
    try {
      const fe = await findPhoneWithFullenrich({
        displayName: personName,
        firstName: profileNames.firstname,
        lastName: profileNames.lastname,
        companyName,
        linkedinUrl: linkedinForPhone,
        email: emailForPhone,
        externalId: keyPersonId,
      });
      let anyPhone = false;
      if (!found.phone && fe.phone) {
        found.phone = fe.phone;
        sources.phone = "fullenrich";
        anyPhone = true;
      }
      if (!found.directPhone && fe.directPhone) {
        found.directPhone = fe.directPhone;
        sources.directPhone = "fullenrich";
        anyPhone = true;
      }
      if (!found.officePhone && fe.officePhone) {
        found.officePhone = fe.officePhone;
        sources.officePhone = "fullenrich";
        anyPhone = true;
      }
      if (anyPhone) {
        steps.push(
          [
            fe.phone ? "Phone" : null,
            fe.directPhone ? "Direct Phone" : null,
            fe.officePhone ? "Office Phone" : null,
          ]
            .filter(Boolean)
            .join(" / ") + " from FullEnrich",
        );
      } else if ((fe as { timedOut?: boolean }).timedOut) {
        steps.push(
          "FullEnrich: still running after ~90s — no phone returned yet (phone waterfall is slow)",
        );
      } else {
        steps.push("FullEnrich: no Phone / Direct / Office numbers found");
      }
      if (!found.linkedin && fe.linkedinUrl) {
        found.linkedin = fe.linkedinUrl;
        sources.linkedin = "fullenrich";
      }
      if (!found.email && fe.workEmail) {
        found.email = fe.workEmail;
        sources.email = "fullenrich";
      }
    } catch (error) {
      const mapped = mapFullenrichError(error);
      if (mapped.creditsExhausted) {
        throw Object.assign(new Error(mapped.message), mapped);
      }
      steps.push(`FullEnrich skipped: ${mapped.message}`);
    }
  } else if (!found.phone) {
    steps.push("FullEnrich skipped: no LinkedIn or email/company to look up phone");
  }

  // --- WhatsApp probe: Phone column only (existing or newly found), never Direct/Office ---
  if (person.whatsapp) {
    steps.push("WhatsApp Number already on file — skip probe");
  } else if (found.phone && toProbeE164(found.phone)) {
    const mobileForWa = found.phone;
    steps.push("WA probe: checking WhatsApp on Phone");
    try {
      const result = await probeWhatsappNumber(mobileForWa);
      if (result.hasWhatsapp === true) {
        const formatted =
          formatStandardPhone(mobileForWa)?.formatted || result.phone;
        found.whatsapp = formatted;
        sources.whatsapp = "wa-probe";
        steps.push("WA probe: WhatsApp registered — will save WhatsApp Number");
      } else if (result.hasWhatsapp === false) {
        steps.push("WA probe: no WhatsApp on this Phone");
      } else if ((result as { timedOut?: boolean }).timedOut) {
        steps.push("WA probe: still pending after poll window");
      } else {
        steps.push(`WA probe: inconclusive (${result.status})`);
      }
    } catch (error) {
      const mapped = mapWaProbeError(error);
      steps.push(`WA probe skipped: ${mapped.message}`);
    }
  } else if (!found.phone) {
    steps.push("WA probe skipped: no Phone (mobile) to check");
  } else {
    steps.push("WA probe skipped: Phone is not a valid mobile number");
  }

  const diff = diffEnrichment(
    {
      email: person.email,
      phone: person.phone,
      directPhone: person.directPhone,
      officePhone: person.officePhone,
      whatsapp: person.whatsapp,
      linkedin: person.linkedin,
    },
    found,
  );

  if (Object.keys(diff.applied).length) {
    await updateKeyPersonContacts(keyPersonId, {
      ...(diff.applied.email ? { email: diff.applied.email, setIcypeasVerified: true } : {}),
      ...(diff.applied.phone ? { phone: diff.applied.phone } : {}),
      ...(diff.applied.directPhone ? { directPhone: diff.applied.directPhone } : {}),
      ...(diff.applied.officePhone ? { officePhone: diff.applied.officePhone } : {}),
      ...(diff.applied.whatsapp ? { whatsapp: diff.applied.whatsapp } : {}),
      ...(diff.applied.linkedin ? { linkedin: diff.applied.linkedin } : {}),
    });
  }

  const contacts = await listFollowupContacts(input.followupClientId);
  return {
    ...diff,
    found,
    sources,
    steps,
    keyPersonId,
    contacts,
  };
}

export async function applyEnrichmentConflicts(input: {
  followupClientId: string;
  contactId: string;
  fields: Partial<Record<EnrichFieldKey, string>>;
}) {
  const { keyPersonId, followupClientId } = await resolveKeyPersonIdFromContact(
    input.contactId,
  );
  if (followupClientId && followupClientId !== input.followupClientId) {
    throw new Error("Contact does not belong to this brand");
  }

  const patch: {
    email?: string;
    phone?: string;
    directPhone?: string;
    officePhone?: string;
    whatsapp?: string;
    linkedin?: string;
    setIcypeasVerified?: boolean;
  } = {};
  if (input.fields.email?.trim()) {
    patch.email = input.fields.email.trim();
    patch.setIcypeasVerified = true;
  }
  if (input.fields.phone?.trim()) patch.phone = input.fields.phone.trim();
  if (input.fields.directPhone?.trim()) patch.directPhone = input.fields.directPhone.trim();
  if (input.fields.officePhone?.trim()) patch.officePhone = input.fields.officePhone.trim();
  if (input.fields.whatsapp?.trim()) patch.whatsapp = input.fields.whatsapp.trim();
  if (input.fields.linkedin?.trim()) patch.linkedin = input.fields.linkedin.trim();

  if (!Object.keys(patch).length) {
    throw new Error("No fields selected to apply");
  }

  await updateKeyPersonContacts(keyPersonId, patch);
  const contacts = await listFollowupContacts(input.followupClientId);
  return { keyPersonId, contacts };
}
