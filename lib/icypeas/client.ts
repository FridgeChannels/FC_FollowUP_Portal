import { getIcypeasApiKey } from "./config";
import {
  ICYPEAS_CREDITS_EXHAUSTED_MESSAGE,
  IcypeasError,
  mapIcypeasError,
  pickBestEmail,
} from "./helpers";

export { IcypeasError, mapIcypeasError, pickBestEmail, ICYPEAS_CREDITS_EXHAUSTED_MESSAGE };

const ICYPEAS_API = "https://app.icypeas.com/api";

const PENDING_STATUSES = new Set(["NONE", "SCHEDULED", "IN_PROGRESS"]);

type ValidationError = {
  type?: string;
  message?: string;
  field?: string;
  humanReadableMessage?: string;
};

type IcypeasEnvelope = {
  success?: boolean;
  validationErrors?: ValidationError[];
  item?: { _id?: string; status?: string };
  searchId?: string;
  status?: string;
  result?: unknown;
  results?: unknown;
  items?: Array<{
    _id?: string;
    status?: string;
    results?: {
      emails?: Array<{ email?: string; certainty?: string }>;
      phones?: unknown[];
      firstname?: string;
      lastname?: string;
    };
  }>;
  credits?: number;
};

function assertApiKey() {
  const key = getIcypeasApiKey();
  if (!key) throw new IcypeasError("ICYPEAS_API_KEY is not configured", "missing_api_key");
  return key;
}

function isCreditsExhausted(errors: ValidationError[] | undefined, status?: string | null) {
  if (status === "INSUFFICIENT_FUNDS") return true;
  return (errors || []).some((error) => {
    const type = (error.type || "").toLowerCase();
    const message = (error.message || "").toLowerCase();
    return (
      type.includes("insufficientcredits") ||
      type.includes("unpaidsubscription") ||
      message.includes("insufficient_credits") ||
      message.includes("unpaid_subscription")
    );
  });
}

function throwIfFailed(payload: IcypeasEnvelope, fallback: string) {
  if (payload.success === false || payload.validationErrors?.length) {
    if (isCreditsExhausted(payload.validationErrors, payload.status)) {
      throw new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true);
    }
    const first = payload.validationErrors?.[0];
    const detail = [
      first?.field ? `${first.field}:` : "",
      first?.humanReadableMessage || first?.message || first?.type || fallback,
    ]
      .filter(Boolean)
      .join(" ");
    throw new IcypeasError(detail, first?.type || "validation_error");
  }
}

async function icypeasFetch(path: string, init?: RequestInit): Promise<IcypeasEnvelope> {
  const key = assertApiKey();
  const response = await fetch(`${ICYPEAS_API}${path}`, {
    ...init,
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload: IcypeasEnvelope = {};
  try {
    payload = text ? (JSON.parse(text) as IcypeasEnvelope) : {};
  } catch {
    throw new IcypeasError(`Icypeas ${response.status}: ${text.slice(0, 200)}`, "bad_response");
  }
  if (response.status === 401) {
    throw new IcypeasError("Icypeas authentication failed", "unauthorized");
  }
  if (response.status === 429) {
    throw new IcypeasError("Icypeas rate limit exceeded", "rate_limit");
  }
  if (!response.ok) {
    throw new IcypeasError(
      `Icypeas ${response.status}: ${text.slice(0, 200)}`,
      "http_error",
    );
  }
  throwIfFailed(payload, "Icypeas request failed");
  if (isCreditsExhausted(undefined, payload.status) || isCreditsExhausted(undefined, payload.item?.status)) {
    throw new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true);
  }
  return payload;
}

export async function emailSearch(input: {
  firstname: string;
  lastname: string;
  domainOrCompany: string;
  externalId?: string;
}) {
  const body: Record<string, unknown> = {
    domainOrCompany: input.domainOrCompany.trim(),
  };
  // Omit empty strings — Icypeas returns validation_string_empty for "".
  if (input.firstname.trim()) body.firstname = input.firstname.trim();
  if (input.lastname.trim()) body.lastname = input.lastname.trim();
  if (!body.firstname && !body.lastname) {
    throw new IcypeasError("firstname or lastname is required", "validation_error");
  }
  if (!body.domainOrCompany) {
    throw new IcypeasError("domainOrCompany is required", "validation_error");
  }
  if (input.externalId) {
    body.custom = { externalId: input.externalId };
  }
  const payload = await icypeasFetch("/email-search", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const id = payload.item?._id;
  if (!id) throw new IcypeasError("Icypeas email-search returned no search id", "missing_id");
  return { id, status: payload.item?.status || "NONE" };
}

export async function readSingleSearch(id: string) {
  const payload = await icypeasFetch("/bulk-single-searchs/read", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
  const item = payload.items?.[0];
  if (!item) throw new IcypeasError("Icypeas search result not found", "not_found");
  if (item.status === "INSUFFICIENT_FUNDS") {
    throw new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true);
  }
  return item;
}

export async function pollSingleSearch(
  id: string,
  options: { attempts?: number; delayMs?: number } = {},
) {
  const attempts = options.attempts ?? 12;
  const delayMs = options.delayMs ?? 1500;
  for (let i = 0; i < attempts; i++) {
    const item = await readSingleSearch(id);
    const status = item.status || "";
    if (!PENDING_STATUSES.has(status)) return item;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new IcypeasError("Icypeas search timed out", "timeout");
}

function linkedinUrlFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && /linkedin\.com\//i.test(value)) return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["url", "linkedinUrl", "profileUrl", "results"]) {
      const nested = linkedinUrlFromUnknown(record[key]);
      if (nested) return nested;
    }
  }
  return null;
}

/** Find a LinkedIn profile URL from a professional email (async, then poll). */
export async function reverseEmailLookup(email: string) {
  const trimmed = email.trim();
  if (!trimmed) throw new IcypeasError("email is required", "validation_error");
  const payload = await icypeasFetch("/reverse-email-lookup", {
    method: "POST",
    body: JSON.stringify({ email: trimmed }),
  });
  const status = payload.status || payload.item?.status || "";
  const immediate =
    linkedinUrlFromUnknown(payload.results) || linkedinUrlFromUnknown(payload.result);
  if (immediate) return { linkedinUrl: immediate, status: status || "FOUND" };

  const id = payload.searchId || payload.item?._id || null;
  if (id && (!status || PENDING_STATUSES.has(status))) {
    const item = await pollSingleSearch(id);
    const itemStatus = item.status || "";
    const url = linkedinUrlFromUnknown(item.results);
    return { linkedinUrl: url, status: itemStatus };
  }
  return { linkedinUrl: null as string | null, status };
}

export async function urlSearchProfile(input: {
  firstname: string;
  lastname: string;
  companyOrDomain: string;
  jobTitle?: string;
}) {
  const firstname = input.firstname.trim();
  const lastname = input.lastname.trim() || firstname;
  if (!firstname) {
    throw new IcypeasError("firstname is required", "validation_error");
  }
  const body: Record<string, unknown> = {
    firstname,
    lastname,
  };
  if (input.companyOrDomain.trim()) body.companyOrDomain = input.companyOrDomain.trim();
  if (input.jobTitle?.trim()) body.jobTitle = input.jobTitle.trim();
  if (!body.companyOrDomain && !body.jobTitle) {
    throw new IcypeasError("companyOrDomain or jobTitle is required", "validation_error");
  }
  const payload = await icypeasFetch("/url-search/profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const status = payload.status || "";
  if (status === "INSUFFICIENT_FUNDS") {
    throw new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true);
  }
  const result = typeof payload.result === "string" ? payload.result : null;
  return {
    searchId: payload.searchId || null,
    status,
    linkedinUrl: status === "FOUND" ? result : null,
  };
}

export type ScrapeProfileResult = {
  searchId: string | null;
  status: string;
  linkedinUrl: string | null;
  phoneNumber: string | null;
  linkedinEmail: string | null;
};

export async function scrapeProfile(url: string): Promise<ScrapeProfileResult> {
  const encoded = encodeURIComponent(url);
  const payload = await icypeasFetch(`/scrape/profile?url=${encoded}`, {
    method: "GET",
  });
  let status = payload.status || payload.item?.status || "";
  let searchId = payload.searchId || payload.item?._id || null;
  let result = payload.result as Record<string, unknown> | null | undefined;

  if (PENDING_STATUSES.has(status) && searchId) {
    const item = await pollSingleSearch(searchId);
    status = item.status || status;
    result = (item as { results?: Record<string, unknown> }).results || result;
  }

  if (status === "INSUFFICIENT_FUNDS") {
    throw new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true);
  }

  const contactInfo =
    result && typeof result === "object"
      ? ((result.ContactInfo as Record<string, unknown> | undefined) || {})
      : {};
  const phoneNumber =
    (typeof contactInfo.phoneNumber === "string" && contactInfo.phoneNumber.trim()) ||
    (typeof result?.phoneNumber === "string" && (result.phoneNumber as string).trim()) ||
    null;
  const linkedinEmail =
    (typeof contactInfo.linkedinEmail === "string" && contactInfo.linkedinEmail.trim()) ||
    (typeof result?.linkedinEmail === "string" && (result.linkedinEmail as string).trim()) ||
    null;
  const linkedinUrl =
    (typeof result?.url === "string" && result.url.trim()) || url;

  return {
    searchId,
    status,
    linkedinUrl: status === "FOUND" || status === "DEBITED" ? linkedinUrl : null,
    phoneNumber: phoneNumber || null,
    linkedinEmail: linkedinEmail || null,
  };
}
