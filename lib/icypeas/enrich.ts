import { normalizeStandardPhone } from "../phone-format.ts";

export type EnrichContactFields = {
  email?: string | null;
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
};

export type EnrichFieldKey = keyof EnrichContactFields;

export type EnrichConflict = {
  field: EnrichFieldKey;
  current: string;
  proposed: string;
};

export type EnrichDiffResult = {
  applied: Partial<Record<EnrichFieldKey, string>>;
  conflicts: EnrichConflict[];
  unchanged: EnrichFieldKey[];
  notFound: EnrichFieldKey[];
};

export function splitPersonName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstname: "", lastname: "" };
  if (parts.length === 1) return { firstname: parts[0], lastname: "" };
  return {
    firstname: parts[0],
    lastname: parts.slice(1).join(" "),
  };
}

/**
 * Icypeas rejects empty strings (`validation_string_empty`).
 * Email search allows one of first/last to be omitted; URL search requires both.
 */
export function icypeasNamePayload(
  fullName: string,
  mode: "email" | "profile",
): { firstname: string; lastname: string } {
  const { firstname, lastname } = splitPersonName(fullName);
  if (!firstname && !lastname) {
    return { firstname: "", lastname: "" };
  }
  if (mode === "email") {
    return {
      firstname: firstname || lastname,
      lastname: firstname ? lastname : "",
    };
  }
  // profile URL search requires both non-empty strings
  if (firstname && lastname) return { firstname, lastname };
  const only = firstname || lastname;
  return { firstname: only, lastname: only };
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

export function normalizePhone(value?: string | null) {
  return normalizeStandardPhone(value);
}

export function normalizeLinkedin(value?: string | null) {
  const raw = value?.trim() || "";
  if (!raw) return "";
  const match = raw.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match) return match[1].toLowerCase();
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
}

function normalizeForField(field: EnrichFieldKey, value?: string | null) {
  if (field === "email") return normalizeEmail(value);
  if (field === "phone" || field === "directPhone" || field === "officePhone" || field === "whatsapp") {
    return normalizePhone(value);
  }
  return normalizeLinkedin(value);
}

const ENRICH_FIELDS: EnrichFieldKey[] = [
  "email",
  "phone",
  "directPhone",
  "officePhone",
  "whatsapp",
  "linkedin",
];

/**
 * Empty fields with a proposed value are auto-applied.
 * Matching values are unchanged.
 * Differing non-empty values become conflicts for human confirmation.
 */
export function diffEnrichment(
  current: EnrichContactFields,
  proposed: EnrichContactFields,
): EnrichDiffResult {
  const applied: Partial<Record<EnrichFieldKey, string>> = {};
  const conflicts: EnrichConflict[] = [];
  const unchanged: EnrichFieldKey[] = [];
  const notFound: EnrichFieldKey[] = [];

  for (const field of ENRICH_FIELDS) {
    const next = proposed[field]?.trim() || "";
    const prev = current[field]?.trim() || "";
    if (!next) {
      notFound.push(field);
      continue;
    }
    if (!prev) {
      applied[field] = next;
      continue;
    }
    if (normalizeForField(field, prev) === normalizeForField(field, next)) {
      unchanged.push(field);
      continue;
    }
    conflicts.push({ field, current: prev, proposed: next });
  }

  return { applied, conflicts, unchanged, notFound };
}
