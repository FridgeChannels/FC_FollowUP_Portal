import type { QualifiedCallDashboardDay } from "./qualified-call-dashboard";

export type QualifiedCallDashboardWeek = {
  key: string;
  start: string;
  end: string;
  days: QualifiedCallDashboardDay[];
};

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monday(value: string) {
  const date = dateFromIso(value);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return isoDate(date);
}

function addDays(value: string, amount: number) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
}

/**
 * Uses business weeks, Monday through Friday. The current partial week ends
 * today, so on 2026-10-02 its first option is 9.28-10.2.
 */
export function groupQualifiedCallDaysByWeek(
  days: QualifiedCallDashboardDay[],
  today: string,
): QualifiedCallDashboardWeek[] {
  const byWeek = new Map<string, QualifiedCallDashboardDay[]>();
  for (const day of days) {
    const start = monday(day.date);
    const items = byWeek.get(start) || [];
    items.push(day);
    byWeek.set(start, items);
  }

  return [...byWeek.entries()]
    .map(([start, weekDays]) => ({
      key: start,
      start,
      end: [addDays(start, 4), today].sort()[0],
      days: weekDays,
    }))
    .filter((week) => week.end >= week.start)
    .sort((left, right) => right.start.localeCompare(left.start));
}
