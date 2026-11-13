/** Minimum delay after the email's Scheduled At before SMS/WhatsApp may send. */
export const AFTER_EMAIL_MIN_OFFSET_MINUTES = 15;

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

/** UTC ISO for `emailScheduledAt + offsetMinutes`. */
export function scheduledAtAfterEmail(emailScheduledAt: string, offsetMinutes: number) {
  const base = Date.parse(emailScheduledAt);
  if (!Number.isFinite(base)) throw new Error("Invalid email scheduled time");
  const offset = normalizeAfterEmailOffsetMinutes(offsetMinutes);
  return new Date(base + offset * 60_000).toISOString();
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
