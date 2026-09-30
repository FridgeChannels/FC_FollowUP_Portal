import type { QuoCall } from "./types";

/**
 * Phone-line identity. Own copy of the NANP rules so this module does not
 * import the task line, dial attempts, or cold inbound.
 */
export function normalizePhoneLineNumber(value?: string | null) {
  if (!value?.trim()) return null;
  const head = value.split(/\s*(?:ext\.?|extension|x|分机)\s*/i)[0] || "";
  let digits = head.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00") && digits.length > 2) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

function directionOf(call?: QuoCall | null) {
  return (call?.direction || "").trim().toLowerCase();
}

/** Counterparty only. Incoming uses `from`; outgoing uses `to`. */
export function phoneLineCounterparty(call?: QuoCall | null) {
  const direction = directionOf(call);
  if (direction === "outgoing" || direction === "outbound") {
    return (call?.to || "").trim() || null;
  }
  if (direction === "incoming" || direction === "inbound") {
    return (call?.from || "").trim() || null;
  }
  return null;
}

export type PhoneLineTask = {
  id: string;
  contactPhone?: string | null;
};

/** Exactly one open Phone Task whose contact phone equals the counterparty. */
export function matchOpenPhoneTask<T extends PhoneLineTask>(
  phone: string | null | undefined,
  tasks: T[],
): T | null {
  const nanp = normalizePhoneLineNumber(phone);
  if (!nanp) return null;
  const matches = tasks.filter((task) => normalizePhoneLineNumber(task.contactPhone) === nanp);
  return matches.length === 1 ? matches[0] : null;
}
