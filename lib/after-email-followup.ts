/** Minimum delay after the email's Scheduled At before SMS/WhatsApp may send. */
export const AFTER_EMAIL_MIN_OFFSET_MINUTES = 15;

/** When email+offset is already past (common after Send now), schedule at least this far ahead. */
export const AFTER_EMAIL_MIN_FUTURE_MS = 60_000;

export type AfterEmailFollowUp = {
  contactId: string;
  emailTaskId: string;
  emailScheduledAt: string;
};

export type AfterEmailFollowUpPrompt = AfterEmailFollowUp & {
  channels: Array<"SMS" | "WhatsApp">;
};

export function normalizeAfterEmailOffsetMinutes(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return AFTER_EMAIL_MIN_OFFSET_MINUTES;
  return Math.max(AFTER_EMAIL_MIN_OFFSET_MINUTES, Math.floor(n));
}

/**
 * UTC ISO for the follow-up send time: max(emailScheduledAt + offset, now + 1m).
 * Send now emails use Scheduled At ≈ now; if the operator takes longer than the offset
 * to compose SMS/WhatsApp, email+offset is already past — bump so create still succeeds
 * while the orchestrator afterTaskId gate keeps order.
 */
export function scheduledAtAfterEmail(
  emailScheduledAt: string,
  offsetMinutes: number,
  nowMs = Date.now(),
) {
  const base = Date.parse(emailScheduledAt);
  if (!Number.isFinite(base)) throw new Error("Invalid email scheduled time");
  const offset = normalizeAfterEmailOffsetMinutes(offsetMinutes);
  const earliest = base + offset * 60_000;
  const minFuture = nowMs + AFTER_EMAIL_MIN_FUTURE_MS;
  return new Date(Math.max(earliest, minFuture)).toISOString();
}

export function formatAfterEmailEtLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}
