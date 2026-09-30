import type { QuoCall } from "./types";

/**
 * NANP identity for Quo cold inbound.
 * Same rules as the phone-line matcher: exact 10-digit equality, no suffix match.
 */
export function normalizeNanpPhone(value?: string | null) {
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

export function isInboundQuoCall(call?: QuoCall | null) {
  const direction = directionOf(call);
  return direction === "incoming" || direction === "inbound";
}

/** Counterparty only. Incoming uses `from`; outgoing uses `to`. */
export function counterpartyPhone(call?: QuoCall | null) {
  const direction = directionOf(call);
  if (direction === "outgoing" || direction === "outbound") {
    return (call?.to || "").trim() || null;
  }
  if (direction === "incoming" || direction === "inbound") {
    return (call?.from || "").trim() || null;
  }
  return null;
}

export type QuoColdInboundPlan =
  | { action: "update" }
  | { action: "create"; phone: string; nanp: string }
  | { action: "skip"; reason: "task-linked" | "not-inbound" | "no-counterparty-phone" | "invalid-phone" };

/**
 * Decide whether an unmatched Quo call can become a cold inbound.
 * A conversation already stored for this callId (no task) is updated in place.
 */
export function planQuoColdInbound(input: {
  call?: QuoCall | null;
  existingTaskId?: string | null;
  hasExistingConversation: boolean;
}): QuoColdInboundPlan {
  if (input.hasExistingConversation) {
    if (input.existingTaskId) return { action: "skip", reason: "task-linked" };
    return { action: "update" };
  }
  if (!isInboundQuoCall(input.call)) return { action: "skip", reason: "not-inbound" };
  const phone = counterpartyPhone(input.call);
  if (!phone) return { action: "skip", reason: "no-counterparty-phone" };
  const nanp = normalizeNanpPhone(phone);
  if (!nanp) return { action: "skip", reason: "invalid-phone" };
  return { action: "create", phone, nanp };
}
