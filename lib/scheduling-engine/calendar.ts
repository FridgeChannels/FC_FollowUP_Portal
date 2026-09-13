const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_MAX_HORIZON_DAYS = 90;

export function assertDateOnly(value: string, label: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${label} 必须是 YYYY-MM-DD，收到：${value}`);
  }
  const date = parseDateOnly(value);
  if (formatDateOnly(date) !== value) {
    throw new Error(`${label} 不是有效日历日期：${value}`);
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
  throw new Error(`无法从 ${value} 找到工作日`);
}

export function nextWorkingDay(value: string): string {
  return firstWorkingDayOnOrAfter(addCalendarDays(value, 1));
}

export function resolveWindow(preferredStartDate: string, latestDate?: string, maxHorizonDays = DEFAULT_MAX_HORIZON_DAYS) {
  const start = firstWorkingDayOnOrAfter(assertDateOnly(preferredStartDate, "preferredStartDate"));
  const horizonEnd = addCalendarDays(preferredStartDate, maxHorizonDays);
  const latest = latestDate ? assertDateOnly(latestDate, "latestDate") : horizonEnd;
  const end = compareDateOnly(latest, horizonEnd) <= 0 ? latest : horizonEnd;
  return { start, end };
}
