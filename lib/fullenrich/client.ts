import { getFullenrichApiKey } from "./config";
import {
  FULLENRICH_CREDITS_EXHAUSTED_MESSAGE,
  FullenrichError,
  mapFullenrichError,
  pickBestPhone,
  classifyFullenrichPhones,
} from "./helpers";

export {
  FullenrichError,
  mapFullenrichError,
  pickBestPhone,
  classifyFullenrichPhones,
  FULLENRICH_CREDITS_EXHAUSTED_MESSAGE,
};

const FULLENRICH_API = "https://app.fullenrich.com/api/v2";

const PENDING_STATUSES = new Set(["CREATED", "IN_PROGRESS"]);

type FullenrichErrorBody = { code?: string; message?: string };

type EnrichContactInput = {
  first_name?: string;
  last_name?: string;
  domain?: string;
  company_name?: string;
  linkedin_url?: string;
  enrich_fields: Array<"contact.phones" | "contact.work_emails" | "contact.personal_emails">;
  custom?: Record<string, string>;
};

type EnrichmentRecord = {
  contact_info?: {
    most_probable_phone?: {
      number?: string;
      line_type?: string;
      line_status?: string;
    } | null;
    phones?: Array<{ number?: string; line_type?: string; line_status?: string }>;
    most_probable_work_email?: { email?: string } | null;
  };
  profile?: {
    social_profiles?: {
      professional_network?: { url?: string };
    };
  };
};

type EnrichmentResultPayload = {
  id?: string;
  status?: string;
  data?: EnrichmentRecord[];
  cost?: { credits?: number };
};

function assertApiKey() {
  const key = getFullenrichApiKey();
  if (!key) {
    throw new FullenrichError("FULLENRICH_API_KEY is not configured", "missing_api_key");
  }
  return key;
}

async function fullenrichFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = assertApiKey();
  const response = await fetch(`${FULLENRICH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload: T | FullenrichErrorBody = {} as T;
  try {
    payload = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new FullenrichError(
      `FullEnrich ${response.status}: ${text.slice(0, 200)}`,
      "bad_response",
    );
  }

  if (response.status === 401) {
    throw new FullenrichError("FullEnrich authentication failed", "unauthorized");
  }
  if (response.status === 429) {
    throw new FullenrichError("FullEnrich rate limit exceeded", "rate_limit");
  }
  if (!response.ok) {
    const err = payload as FullenrichErrorBody;
    const code = err.code || "http_error";
    const message = err.message || `FullEnrich ${response.status}`;
    if (/credit/i.test(code) || /credit/i.test(message)) {
      throw new FullenrichError(FULLENRICH_CREDITS_EXHAUSTED_MESSAGE, code, true);
    }
    throw new FullenrichError(message, code);
  }
  return payload as T;
}

export async function startPhoneEnrichment(input: {
  name: string;
  contact: EnrichContactInput;
}) {
  const contact: EnrichContactInput = {
    ...input.contact,
    enrich_fields: ["contact.phones"],
  };
  if (contact.custom) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(contact.custom)) {
      normalized[key] = String(value);
    }
    contact.custom = normalized;
  }

  const payload = await fullenrichFetch<{ enrichment_id?: string }>("/contact/enrich/bulk", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 120),
      data: [contact],
    }),
  });
  const enrichmentId = payload.enrichment_id;
  if (!enrichmentId) {
    throw new FullenrichError("FullEnrich returned no enrichment_id", "missing_id");
  }
  return enrichmentId;
}

export async function getEnrichmentResult(enrichmentId: string, forceResults = false) {
  const query = forceResults ? "?forceResults=true" : "";
  return fullenrichFetch<EnrichmentResultPayload>(
    `/contact/enrich/bulk/${encodeURIComponent(enrichmentId)}${query}`,
  );
}

function parseEnrichmentRow(result: EnrichmentResultPayload) {
  const row = result.data?.[0];
  const classified = classifyFullenrichPhones({
    mostProbable: row?.contact_info?.most_probable_phone,
    phones: row?.contact_info?.phones,
  });
  return {
    status: result.status || "",
    phone: classified.phone,
    directPhone: classified.directPhone,
    officePhone: classified.officePhone,
    linkedinUrl:
      row?.profile?.social_profiles?.professional_network?.url?.trim() || null,
    workEmail: row?.contact_info?.most_probable_work_email?.email?.trim() || null,
    credits: result.cost?.credits ?? null,
  };
}

export async function pollPhoneEnrichment(
  enrichmentId: string,
  options: { attempts?: number; delayMs?: number } = {},
) {
  // FullEnrich docs: typical 45–60s, often up to ~90s for phone waterfall.
  const attempts = options.attempts ?? 36;
  const delayMs = options.delayMs ?? 3000;
  let lastStatus = "IN_PROGRESS";

  for (let i = 0; i < attempts; i++) {
    const forceResults = i >= attempts - 3;
    const result = await getEnrichmentResult(enrichmentId, forceResults);
    const status = result.status || "";
    lastStatus = status || lastStatus;

    if (status === "CREDITS_INSUFFICIENT") {
      throw new FullenrichError(
        FULLENRICH_CREDITS_EXHAUSTED_MESSAGE,
        "CREDITS_INSUFFICIENT",
        true,
      );
    }
    if (status === "CANCELED" || status === "RATE_LIMIT" || status === "UNKNOWN") {
      throw new FullenrichError(`FullEnrich ended with status ${status}`, status);
    }

    const parsed = parseEnrichmentRow(result);
    if (!PENDING_STATUSES.has(status)) {
      return parsed;
    }
    // Partial phone available via forceResults — take it and stop waiting.
    if (
      forceResults &&
      (parsed.phone || parsed.directPhone || parsed.officePhone)
    ) {
      return { ...parsed, status: status || "IN_PROGRESS" };
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Final force pull — return whatever we have instead of hard-failing.
  try {
    const forced = await getEnrichmentResult(enrichmentId, true);
    const parsed = parseEnrichmentRow(forced);
    if (
      parsed.phone ||
      parsed.directPhone ||
      parsed.officePhone ||
      !PENDING_STATUSES.has(parsed.status)
    ) {
      return parsed;
    }
    return {
      ...parsed,
      status: parsed.status || lastStatus,
      timedOut: true as const,
    };
  } catch {
    return {
      status: lastStatus,
      phone: null,
      directPhone: null,
      officePhone: null,
      linkedinUrl: null,
      workEmail: null,
      credits: null,
      timedOut: true as const,
    };
  }
}

/**
 * Find mobile/phone via FullEnrich.
 * Prefer LinkedIn URL; otherwise name + company (+ optional email domain).
 */
export async function findPhoneWithFullenrich(input: {
  displayName: string;
  firstName: string;
  lastName: string;
  companyName?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  externalId?: string;
}) {
  const linkedin = input.linkedinUrl?.trim() || "";
  const email = input.email?.trim() || "";
  const company = input.companyName?.trim() || "";
  const domain = email.includes("@")
    ? email.slice(email.indexOf("@") + 1).toLowerCase()
    : "";

  const contact: EnrichContactInput = {
    enrich_fields: ["contact.phones"],
    custom: input.externalId ? { key_person_id: input.externalId } : undefined,
  };

  if (linkedin) {
    contact.linkedin_url = linkedin;
    // Extra context improves hit rate when LinkedIn is present.
    if (input.firstName) contact.first_name = input.firstName;
    if (input.lastName) contact.last_name = input.lastName || input.firstName;
    if (company) contact.company_name = company;
    if (domain) contact.domain = domain;
  } else {
    if (!input.firstName && !input.lastName) {
      throw new FullenrichError(
        "FullEnrich phone lookup needs LinkedIn URL or a person name",
        "validation_error",
      );
    }
    contact.first_name = input.firstName || input.lastName;
    contact.last_name = input.lastName || input.firstName;
    if (company) contact.company_name = company;
    if (domain) contact.domain = domain;
    if (!contact.company_name && !contact.domain) {
      throw new FullenrichError(
        "FullEnrich phone lookup needs company name or email domain when LinkedIn is missing",
        "validation_error",
      );
    }
  }

  const enrichmentId = await startPhoneEnrichment({
    name: `Portal · ${input.displayName}`.slice(0, 120),
    contact,
  });
  return pollPhoneEnrichment(enrichmentId);
}
