/**
 * Standard phone format for KeyPersonDB:
 * - +internationalDigits with no spaces
 * - extension as ` ext. N` (never stored on Phone / mobile column)
 *
 * Examples: +15551234567 | +15551234567 ext. 1
 */

const EXT_RE =
  /(?:\s*(?:ext\.?|extension|x|#|;|,)\s*)(\d{1,8})\s*$/i;

export type FormattedPhone = {
  /** e.g. +15551234567 or +15551234567 ext. 1 */
  formatted: string;
  /** Digits after + only (no ext) */
  e164Digits: string;
  extension: string | null;
  hasExtension: boolean;
};

export function formatStandardPhone(raw?: string | null): FormattedPhone | null {
  if (!raw?.trim()) return null;
  let value = raw.trim();

  let extension: string | null = null;
  const extMatch = value.match(EXT_RE);
  if (extMatch) {
    extension = extMatch[1].replace(/^0+/, "") || extMatch[1];
    value = value.slice(0, extMatch.index).trim();
  }

  // Keep leading + if present; strip everything else non-digit from the body.
  const hasPlus = value.includes("+");
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;

  // NANP local 10-digit numbers without + → assume US/CA (+1).
  if (!hasPlus && digits.length === 10) {
    digits = `1${digits}`;
  }

  // Require a plausible length (country + national).
  if (digits.length < 8 || digits.length > 15) return null;

  const e164Digits = digits;
  const formatted = extension
    ? `+${e164Digits} ext. ${extension}`
    : `+${e164Digits}`;

  return {
    formatted,
    e164Digits,
    extension,
    hasExtension: Boolean(extension),
  };
}

/** Normalize for equality checks (digits + optional ext digits). */
export function normalizeStandardPhone(value?: string | null) {
  const formatted = formatStandardPhone(value);
  if (!formatted) return (value || "").replace(/\D/g, "");
  return formatted.extension
    ? `${formatted.e164Digits}#${formatted.extension}`
    : formatted.e164Digits;
}

export type PhoneLineType = "MOBILE" | "LANDLINE" | "VOIP" | "UNKNOWN" | string;

export type ClassifiedPhones = {
  /** KeyPerson `Phone` — mobile only, never with extension */
  phone: string | null;
  /** KeyPerson `Direct Phone` — VOIP / direct dial, no switchboard ext preferred */
  directPhone: string | null;
  /** KeyPerson `Office Phone` — landline / numbers with extension */
  officePhone: string | null;
};

type PhoneCandidate = {
  number?: string | null;
  line_type?: PhoneLineType | null;
  line_status?: string | null;
};

function scoreCandidate(p: PhoneCandidate) {
  let s = 0;
  if (p.line_status === "ACTIVE") s += 2;
  if (p.line_type === "MOBILE") s += 4;
  else if (p.line_type === "VOIP") s += 2;
  else if (p.line_type === "LANDLINE") s += 1;
  return s;
}

function assignBucket(
  lineType: PhoneLineType | null | undefined,
  hasExtension: boolean,
  preferMobile = false,
): keyof ClassifiedPhones {
  // Extension / transfer numbers never go to Phone (mobile).
  if (hasExtension) return "officePhone";
  const type = (lineType || "UNKNOWN").toUpperCase();
  if (type === "MOBILE") return "phone";
  // Docs: most_probable_phone is the most reliable mobile — treat UNKNOWN as Phone.
  if (preferMobile && (type === "UNKNOWN" || !lineType)) return "phone";
  if (type === "VOIP") return "directPhone";
  if (type === "LANDLINE") return "officePhone";
  return "directPhone";
}

/**
 * Map FullEnrich contact_info phones into KeyPerson Phone / Direct Phone / Office Phone.
 * Prefer most_probable_phone for its bucket; fill other buckets from phones[].
 */
export function classifyFullenrichPhones(input: {
  mostProbable?: PhoneCandidate | null;
  phones?: PhoneCandidate[] | null;
}): ClassifiedPhones {
  const result: ClassifiedPhones = {
    phone: null,
    directPhone: null,
    officePhone: null,
  };

  const seen = new Set<string>();
  const consider = (
    candidate: PhoneCandidate | null | undefined,
    prefer = false,
    preferMobile = false,
  ) => {
    if (!candidate?.number) return;
    const parsed = formatStandardPhone(candidate.number);
    if (!parsed) return;
    const key = normalizeStandardPhone(parsed.formatted);
    if (!key || seen.has(key)) return;
    const bucket = assignBucket(candidate.line_type, parsed.hasExtension, preferMobile);
    if (result[bucket] && !prefer) return;
    // Phone column: reject any extension even if mis-typed as MOBILE.
    if (bucket === "phone" && parsed.hasExtension) {
      if (!result.officePhone || prefer) {
        result.officePhone = parsed.formatted;
        seen.add(key);
      }
      return;
    }
    result[bucket] = parsed.formatted;
    seen.add(key);
  };

  // most_probable first (wins its bucket); docs say it is the best mobile.
  if (input.mostProbable?.number) {
    consider(input.mostProbable, true, true);
  }

  const ranked = [...(input.phones || [])].sort(
    (a, b) => scoreCandidate(b) - scoreCandidate(a),
  );
  for (const item of ranked) {
    consider(item, false);
  }

  return result;
}

/** Icypeas / unknown source: no line_type — mobile if no ext, else office. */
export function classifyRawPhone(raw?: string | null): ClassifiedPhones {
  const parsed = formatStandardPhone(raw);
  if (!parsed) {
    return { phone: null, directPhone: null, officePhone: null };
  }
  if (parsed.hasExtension) {
    return { phone: null, directPhone: null, officePhone: parsed.formatted };
  }
  return { phone: parsed.formatted, directPhone: null, officePhone: null };
}
