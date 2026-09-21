export const DIAL_PHONE_FIELDS = [
  { key: "phone", label: "Phone" },
  { key: "directPhone", label: "Direct Phone" },
  { key: "officePhone", label: "Office Phone" },
] as const;

export type DialPhoneField = (typeof DIAL_PHONE_FIELDS)[number]["key"];
export type DialPhoneLabel = (typeof DIAL_PHONE_FIELDS)[number]["label"];

export type DialPhoneOption = {
  key: DialPhoneField;
  label: DialPhoneLabel;
  number: string;
};

export type DialPhoneSource = {
  phone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
};

function digits(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

/** Phone first, then Direct Phone, then Office Phone. Duplicate numbers keep the higher-priority label. */
export function dialPhoneOptions(
  source: DialPhoneSource,
  fallbackPhone?: string | null,
  overridePhone?: string | null,
): DialPhoneOption[] {
  const override = (overridePhone || "").trim();
  if (override) {
    return [{ key: "phone", label: "Phone", number: override }];
  }

  const values: Record<DialPhoneField, string | null | undefined> = {
    phone: source.phone || fallbackPhone,
    directPhone: source.directPhone,
    officePhone: source.officePhone,
  };
  const seen = new Set<string>();
  const options: DialPhoneOption[] = [];
  for (const field of DIAL_PHONE_FIELDS) {
    const number = (values[field.key] || "").trim();
    if (!number) continue;
    const normalized = digits(number);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    options.push({ key: field.key, label: field.label, number });
  }
  return options;
}

export function quoDialHref(phone: string) {
  return `openphone://dial?number=${encodeURIComponent(phone)}&action=call`;
}

export function formatDialPhoneSummary(options: DialPhoneOption[]) {
  if (!options.length) return "No phone number";
  return options.map((item) => `${item.label} ${item.number}`).join(" · ");
}
