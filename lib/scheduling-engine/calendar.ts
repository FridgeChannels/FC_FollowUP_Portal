const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_MAX_HORIZON_DAYS = 90;
export const SCHEDULE_TIME_ZONE = "America/New_York";
export const WORK_WINDOW_START_MINUTES = 9 * 60;
export const WORK_WINDOW_END_MINUTES = 17 * 60;
export const DEFAULT_TIME_INTERVAL_MINUTES = 5;
/** Legacy date-only Scheduled At values occupy this minute (09:00 ET). */
export const DATE_ONLY_PLACEHOLDER_MINUTES = WORK_WINDOW_START_MINUTES;

export function assertDateOnly(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD, received: ${value}`);
  }
  const date = parseDateOnly(value);
  if (formatDateOnly(date) !== value) {
    throw new Error(`${label} is not a valid calendar date: ${value}`);
  }
  return value;
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, days: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function compareDateOnly(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Mon–Fri on a civil YYYY-MM-DD (no holiday check). */
export function isWorkingDay(value: string): boolean {
  const weekday = parseDateOnly(value).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

export function firstWorkingDayOnOrAfter(value: string): string {
  let current = value;
  for (let i = 0; i < 7; i += 1) {
    if (isWorkingDay(current)) return current;
    current = addCalendarDays(current, 1);
  }
  throw new Error(`No weekday found from ${value}`);
}

export function nextWorkingDay(value: string): string {
  return firstWorkingDayOnOrAfter(addCalendarDays(value, 1));
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour: num("hour"),
    minute: num("minute"),
    second: num("second"),
  };
}

export function easternDateOnly(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime for easternDateOnly: ${String(value)}`);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function easternMinuteOfDayCeil(value: string | Date = new Date()): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime for easternMinuteOfDayCeil: ${String(value)}`);
  }
  const parts = zonedParts(date, SCHEDULE_TIME_ZONE);
  let minute = parts.hour * 60 + parts.minute;
  if (parts.second > 0 || date.getMilliseconds() > 0) minute += 1;
  return minute;
}

/** Build ISO instant for an America/New_York local date + minute-of-day. */
export function easternDateTimeIso(dateOnly: string, minuteOfDay: number): string {
  assertDateOnly(dateOnly, "dateOnly");
  if (!Number.isFinite(minuteOfDay) || minuteOfDay < 0 || minuteOfDay >= 24 * 60) {
    throw new Error(`minuteOfDay out of range: ${minuteOfDay}`);
  }
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const year = Number(dateOnly.slice(0, 4));
  const month = Number(dateOnly.slice(5, 7));
  const day = Number(dateOnly.slice(8, 10));
  const wantAsUtcFields = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Start near EST (UTC−5); iterate to absorb EDT and exact offset.
  let utcMs = Date.UTC(year, month - 1, day, hour + 5, minute, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(new Date(utcMs), SCHEDULE_TIME_ZONE);
    const gotAsUtcFields = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const delta = wantAsUtcFields - gotAsUtcFields;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs).toISOString();
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) break;
    if (date.getUTCDay() === weekday) {
      count += 1;
      if (count === n) return formatDateOnly(date);
    }
  }
  throw new Error(`Unable to find ${n}th weekday ${weekday} in ${year}-${month}`);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  for (let day = 31; day >= 1; day -= 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) continue;
    if (date.getUTCDay() === weekday) return formatDateOnly(date);
  }
  throw new Error(`Unable to find last weekday ${weekday} in ${year}-${month}`);
}

/** Observed date for a fixed-month holiday (Sat→Fri, Sun→Mon). */
function observedFixedHoliday(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return formatDateOnly(date);
}

/** US federal holidays (observed) for a calendar year. May include Dec 31 of prior year. */
export function usFederalHolidays(year: number): Set<string> {
  return new Set([
    observedFixedHoliday(year, 1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 1, 3), // Birthday of Martin Luther King, Jr.
    nthWeekdayOfMonth(year, 2, 1, 3), // Washington's Birthday
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day
    observedFixedHoliday(year, 6, 19), // Juneteenth National Independence Day
    observedFixedHoliday(year, 7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day
    nthWeekdayOfMonth(year, 10, 1, 2), // Columbus Day
    observedFixedHoliday(year, 11, 11), // Veterans Day
    nthWeekdayOfMonth(year, 11, 4, 4), // Thanksgiving Day
    observedFixedHoliday(year, 12, 25), // Christmas Day
  ]);
}

export function isUsFederalHoliday(dateOnly: string): boolean {
  assertDateOnly(dateOnly, "dateOnly");
  const year = Number(dateOnly.slice(0, 4));
  return usFederalHolidays(year).has(dateOnly) || usFederalHolidays(year + 1).has(dateOnly);
}

export function isUsBusinessDay(dateOnly: string): boolean {
  return isWorkingDay(dateOnly) && !isUsFederalHoliday(dateOnly);
}

export function firstUsBusinessDayOnOrAfter(value: string): string {
  let current = assertDateOnly(value, "date");
  for (let i = 0; i < 366; i += 1) {
    if (isUsBusinessDay(current)) return current;
    current = addCalendarDays(current, 1);
  }
  throw new Error(`No US business day found from ${value}`);
}

export function nextUsBusinessDay(value: string): string {
  return firstUsBusinessDayOnOrAfter(addCalendarDays(value, 1));
}

export function isDateOnlyScheduledAt(value: string): boolean {
  return DATE_PATTERN.test(value);
}

const HAS_EXPLICIT_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const NAIVE_LOCAL_DATETIME =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

/**
 * Parse a feed/Notion timestamp to epoch ms.
 * Offset/`Z` values are absolute instants. Naive datetimes (Notion Scheduled At
 * with America/New_York time_zone) are Eastern wall time, not the runtime zone.
 */
export function parseTimelineMs(value?: string | null): number {
  const raw = value?.trim() || "";
  if (!raw) return Number.NaN;
  if (isDateOnlyScheduledAt(raw)) {
    return Date.parse(easternDateTimeIso(raw, DATE_ONLY_PLACEHOLDER_MINUTES));
  }
  if (HAS_EXPLICIT_ZONE.test(raw)) {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? Number.NaN : ms;
  }
  const naive = raw.match(NAIVE_LOCAL_DATETIME);
  if (naive) {
    const minuteOfDay = Number(naive[2]) * 60 + Number(naive[3]);
    const seconds = Number(naive[4] || 0);
    const fraction = naive[5] ? Number(`0.${naive[5]}`) * 1000 : 0;
    return Date.parse(easternDateTimeIso(naive[1], minuteOfDay)) + seconds * 1000 + fraction;
  }
  const fallback = Date.parse(raw);
  return Number.isNaN(fallback) ? Number.NaN : fallback;
}

/** UTC ISO sort key, or empty when the timestamp cannot be parsed. */
export function timelineInstantIso(value?: string | null): string {
  const ms = parseTimelineMs(value);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

/** Normalize Task Scheduled At (date-only or datetime) to ET civil date + minute. */
export function parseScheduledAt(value: string): { dateOnly: string; minuteOfDay: number } {
  if (isDateOnlyScheduledAt(value)) {
    assertDateOnly(value, "scheduledAt");
    return { dateOnly: value, minuteOfDay: DATE_ONLY_PLACEHOLDER_MINUTES };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid scheduledAt datetime: ${value}`);
  }
  const parts = zonedParts(date, SCHEDULE_TIME_ZONE);
  const dateOnly = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return { dateOnly, minuteOfDay: parts.hour * 60 + parts.minute };
}

export function resolveWindow(preferredStartDate: string, latestDate?: string, maxHorizonDays = DEFAULT_MAX_HORIZON_DAYS) {
  const preferred = assertDateOnly(preferredStartDate, "preferredStartDate");
  const start = firstUsBusinessDayOnOrAfter(preferred);
  const horizonEnd = addCalendarDays(preferred, maxHorizonDays);
  const latest = latestDate ? assertDateOnly(latestDate, "latestDate") : horizonEnd;
  const end = compareDateOnly(latest, horizonEnd) <= 0 ? latest : horizonEnd;
  return { start, end };
}
