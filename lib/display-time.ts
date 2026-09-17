declare global {
  interface ImportMetaEnv {
    readonly DISPLAY_TIME_ZONE?: string;
  }
}

const DEFAULT_DISPLAY_TIME_ZONE = "America/New_York";

/** UI datetime zone from `.env` (`DISPLAY_TIME_ZONE`), default America/New_York. */
export function getDisplayTimeZone() {
  const fromImportMeta =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.DISPLAY_TIME_ZONE as string | undefined)
      : undefined;
  const fromProcess =
    typeof process !== "undefined" ? process.env.DISPLAY_TIME_ZONE : undefined;
  const raw = (fromImportMeta || fromProcess || "").trim();
  return raw || DEFAULT_DISPLAY_TIME_ZONE;
}

/**
 * Scheduled At style display: date + minute + AM/PM + zone abbrev.
 * Example: `2026-09-15 2:10 PM EDT`
 */
export function formatScheduledDateTime(iso: string, timeZone = getDisplayTimeZone()) {
  const raw = iso.trim();
  if (!raw) return "";
  // Date-only Notion values: show civil day in the display zone (noon UTC anchor).
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "short",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value || "";
    return `${value("year")}-${value("month")}-${value("day")} (${value("timeZoneName")} date)`;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const dayPeriod = value("dayPeriod");
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")} ${dayPeriod} ${value("timeZoneName")}`.replace(
    /\s+/g,
    " ",
  ).trim();
}
