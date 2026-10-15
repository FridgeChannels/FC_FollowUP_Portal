/** Shared timezone for operational dates, displays and scheduling. */
export const BUSINESS_TIME_ZONE = "America/New_York";

/** Civil date fields keep their selected day; instants are converted to Eastern. */
export function businessDateOnly(value: string | Date = new Date()): string {
  if (typeof value === "string") {
    const raw = value.trim();
    // Notion's timezone-less Scheduled At values are Eastern wall times.
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(raw)) return raw.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
