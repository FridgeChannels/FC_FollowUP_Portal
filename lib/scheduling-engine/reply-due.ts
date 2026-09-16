import {
  addCalendarDays,
  compareDateOnly,
  firstWorkingDayOnOrAfter,
  isWorkingDay,
} from "../scheduling-engine/calendar.ts";
import {
  availableOn,
  capacityKey,
  createCapacityBoard,
  dailyMaxFor,
  type CapacityBoard,
} from "../scheduling-engine/capacity.ts";
import { CHANNELS, type Channel, type ExistingTask } from "../scheduling-engine/types.ts";

export const REPLY_DUE_PROPERTY = "Reply Due At";
export const REPLY_DUE_DEFAULT_HOURS = 24;
export const REPLY_DUE_HORIZON_DAYS = 90;

export type ReplyDueReservation = {
  date: string;
  channel: Channel;
};

/** Asia/Shanghai calendar date YYYY-MM-DD from an instant. */
export function shanghaiDateOnly(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime for Reply Due At");
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Wall-clock H:M:S in Asia/Shanghai. */
export function shanghaiTimeParts(value: string | Date): { hour: number; minute: number; second: number } {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value || "0");
  return { hour: num("hour"), minute: num("minute"), second: num("second") };
}

/** Build ISO instant for a Shanghai local date + time-of-day. */
export function shanghaiDateTimeIso(
  dateOnly: string,
  time: { hour: number; minute: number; second: number },
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${dateOnly}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}+08:00`;
  const parsed = new Date(local);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Shanghai datetime: ${local}`);
  }
  return parsed.toISOString();
}

export function findEarliestChannelDay(
  board: CapacityBoard,
  channel: Channel,
  startDate: string,
  endDate: string,
): string | undefined {
  if (dailyMaxFor(board.dailyMax, channel) === 0) return undefined;
  if (compareDateOnly(startDate, endDate) > 0) return undefined;

  let date = firstWorkingDayOnOrAfter(startDate);
  while (compareDateOnly(date, endDate) <= 0) {
    if (isWorkingDay(date) && availableOn(board, date, channel) > 0) return date;
    date = addCalendarDays(date, 1);
    if (!isWorkingDay(date) && compareDateOnly(date, endDate) <= 0) {
      date = firstWorkingDayOnOrAfter(date);
    }
  }
  return undefined;
}

export function reserveChannelDay(board: CapacityBoard, date: string, channel: Channel) {
  const key = capacityKey(date, channel);
  board.allocated.set(key, (board.allocated.get(key) ?? 0) + 1);
}

/**
 * Default: Interaction At + 24h.
 * If that working day's channel Daily Max is full, move to the nearest later
 * working day with remaining channel capacity (task + open reply reservations).
 * Does not apply the outbound "one channel per client per day" rule.
 */
export function resolveReplyDueAt(input: {
  occurredAt: string;
  channel: string;
  dailyMax: Partial<Record<Channel, number>>;
  existingTasks: ExistingTask[];
  openReplyReservations?: ReplyDueReservation[];
  defaultHours?: number;
  horizonDays?: number;
}): string {
  const channel = input.channel as Channel;
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Invalid channel for Reply Due At: ${input.channel}`);
  }

  const occurred = new Date(input.occurredAt);
  if (Number.isNaN(occurred.getTime())) {
    throw new Error("Invalid occurredAt for Reply Due At");
  }

  const hours = input.defaultHours ?? REPLY_DUE_DEFAULT_HOURS;
  const candidate = new Date(occurred.getTime() + hours * 60 * 60 * 1000);
  const time = shanghaiTimeParts(candidate);
  const preferredDay = firstWorkingDayOnOrAfter(shanghaiDateOnly(candidate));
  const horizonEnd = addCalendarDays(preferredDay, input.horizonDays ?? REPLY_DUE_HORIZON_DAYS);

  const board = createCapacityBoard(input.dailyMax, input.existingTasks);
  for (const reservation of input.openReplyReservations || []) {
    if (!CHANNELS.includes(reservation.channel) || !isWorkingDay(reservation.date)) continue;
    reserveChannelDay(board, reservation.date, reservation.channel);
  }

  if (dailyMaxFor(board.dailyMax, channel) === 0) {
    return shanghaiDateTimeIso(preferredDay, time);
  }

  const dueDay =
    availableOn(board, preferredDay, channel) > 0
      ? preferredDay
      : findEarliestChannelDay(board, channel, addCalendarDays(preferredDay, 1), horizonEnd)
        || preferredDay;

  return shanghaiDateTimeIso(dueDay, time);
}
