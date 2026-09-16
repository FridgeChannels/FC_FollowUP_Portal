import {
  parseScheduledAt,
  SCHEDULE_TIME_ZONE,
} from "../scheduling-engine/calendar.ts";

/** Notion date property with America/New_York wall time + time zone. */
export function notionScheduledAtProperty(scheduledAt: string): {
  date: { start: string; time_zone: string };
} {
  const { dateOnly, minuteOfDay } = parseScheduledAt(scheduledAt);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: {
      start: `${dateOnly}T${pad(hour)}:${pad(minute)}:00.000`,
      time_zone: SCHEDULE_TIME_ZONE,
    },
  };
}
