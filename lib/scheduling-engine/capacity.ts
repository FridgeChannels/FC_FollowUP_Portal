import {
  DEFAULT_TIME_INTERVAL_MINUTES,
  WORK_WINDOW_END_MINUTES,
  WORK_WINDOW_START_MINUTES,
  addCalendarDays,
  compareDateOnly,
  easternDateOnly,
  easternDateTimeIso,
  easternMinuteOfDayCeil,
  firstUsBusinessDayOnOrAfter,
  isUsBusinessDay,
  parseScheduledAt,
} from "./calendar.ts";
import { CHANNELS, type Channel, type ExistingTask, type TaskStatus } from "./types.ts";

export function occupiesCapacity(status: TaskStatus): boolean {
  return status !== "Cancelled";
}

export function dailyMaxFor(dailyMax: Partial<Record<Channel, number>>, channel: Channel): number {
  const value = dailyMax[channel];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Missing or non-positive values fall back to 5 minutes. */
export function timeIntervalFor(
  timeInterval: Partial<Record<Channel, number>> | undefined,
  channel: Channel,
): number {
  const value = timeInterval?.[channel];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_TIME_INTERVAL_MINUTES;
}

export function capacityKey(date: string, channel: Channel): string {
  return `${date}|${channel}`;
}

export function clientDayKey(date: string, clientId: string): string {
  return `${date}|${clientId}`;
}

export type CapacityBoard = {
  dailyMax: Partial<Record<Channel, number>>;
  timeInterval: Partial<Record<Channel, number>>;
  allocated: Map<string, number>;
  clientDays: Set<string>;
  occupiedMinutes: Map<string, number[]>;
};

export function createCapacityBoard(
  dailyMax: Partial<Record<Channel, number>>,
  existingTasks: ExistingTask[],
  timeInterval: Partial<Record<Channel, number>> = {},
): CapacityBoard {
  const allocated = new Map<string, number>();
  const clientDays = new Set<string>();
  const occupiedMinutes = new Map<string, number[]>();

  for (const task of existingTasks) {
    if (!occupiesCapacity(task.status)) continue;
    const { dateOnly, minuteOfDay } = parseScheduledAt(task.scheduledAt);
    const key = capacityKey(dateOnly, task.channel);
    allocated.set(key, (allocated.get(key) ?? 0) + 1);
    clientDays.add(clientDayKey(dateOnly, task.clientId));
    const minutes = occupiedMinutes.get(key) ?? [];
    minutes.push(minuteOfDay);
    occupiedMinutes.set(key, minutes);
  }

  for (const minutes of occupiedMinutes.values()) {
    minutes.sort((a, b) => a - b);
  }

  return { dailyMax, timeInterval, allocated, clientDays, occupiedMinutes };
}

export function allocatedOn(board: CapacityBoard, date: string, channel: Channel): number {
  return board.allocated.get(capacityKey(date, channel)) ?? 0;
}

export function availableOn(board: CapacityBoard, date: string, channel: Channel): number {
  return Math.max(0, dailyMaxFor(board.dailyMax, channel) - allocatedOn(board, date, channel));
}

export function clientHasChannelOn(board: CapacityBoard, date: string, clientId: string): boolean {
  return board.clientDays.has(clientDayKey(date, clientId));
}

export function canPlace(board: CapacityBoard, date: string, channel: Channel, clientId: string): boolean {
  return isUsBusinessDay(date)
    && availableOn(board, date, channel) > 0
    && !clientHasChannelOn(board, date, clientId);
}

export function place(
  board: CapacityBoard,
  date: string,
  channel: Channel,
  clientId: string,
  minuteOfDay: number,
): void {
  const key = capacityKey(date, channel);
  board.allocated.set(key, allocatedOn(board, date, channel) + 1);
  board.clientDays.add(clientDayKey(date, clientId));
  const minutes = board.occupiedMinutes.get(key) ?? [];
  minutes.push(minuteOfDay);
  minutes.sort((a, b) => a - b);
  board.occupiedMinutes.set(key, minutes);
}

function findMinuteOnDay(
  board: CapacityBoard,
  date: string,
  channel: Channel,
  earliestMinute: number,
): number | undefined {
  const latest = WORK_WINDOW_END_MINUTES;
  if (earliestMinute > latest) return undefined;

  const interval = timeIntervalFor(board.timeInterval, channel);
  const occupied = board.occupiedMinutes.get(capacityKey(date, channel)) ?? [];
  let candidate = Math.max(earliestMinute, WORK_WINDOW_START_MINUTES);

  for (const occupiedMinute of occupied) {
    if (candidate <= latest && candidate <= occupiedMinute - interval) {
      return candidate;
    }
    candidate = Math.max(candidate, occupiedMinute + interval);
  }

  return candidate <= latest ? candidate : undefined;
}

/**
 * Find the earliest US-business-day minute slot as an ISO datetime.
 * Same-day starts align from `now` (ET); future days start at 09:00 ET.
 */
export function findEarliestSlot(
  board: CapacityBoard,
  channel: Channel,
  clientId: string,
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): string | undefined {
  if (dailyMaxFor(board.dailyMax, channel) === 0) return undefined;
  if (compareDateOnly(startDate, endDate) > 0) return undefined;

  const todayEt = easternDateOnly(now);
  const nowMinuteCeil = easternMinuteOfDayCeil(now);
  const effectiveStart = compareDateOnly(startDate, todayEt) < 0 ? todayEt : startDate;

  let date = firstUsBusinessDayOnOrAfter(effectiveStart);
  while (compareDateOnly(date, endDate) <= 0) {
    if (canPlace(board, date, channel, clientId)) {
      let earliestMinute = WORK_WINDOW_START_MINUTES;
      if (date === todayEt) {
        earliestMinute = Math.max(WORK_WINDOW_START_MINUTES, nowMinuteCeil);
      }
      const minute = findMinuteOnDay(board, date, channel, earliestMinute);
      if (minute != null) {
        return easternDateTimeIso(date, minute);
      }
    }

    date = addCalendarDays(date, 1);
    if (!isUsBusinessDay(date) && compareDateOnly(date, endDate) <= 0) {
      date = firstUsBusinessDayOnOrAfter(date);
    }
  }
  return undefined;
}

export function collectUsage(board: CapacityBoard, dates: string[]): Array<{
  date: string;
  channel: Channel;
  dailyMax: number;
  allocated: number;
  available: number;
}> {
  const uniqueDates = [...new Set(dates.map((value) => {
    try {
      return parseScheduledAt(value).dateOnly;
    } catch {
      return value.slice(0, 10);
    }
  }))].sort();
  const usage = [];
  for (const date of uniqueDates) {
    for (const channel of CHANNELS) {
      const allocated = allocatedOn(board, date, channel);
      if (allocated === 0) continue;
      const dailyMax = dailyMaxFor(board.dailyMax, channel);
      usage.push({
        date,
        channel,
        dailyMax,
        allocated,
        available: Math.max(0, dailyMax - allocated),
      });
    }
  }
  return usage;
}
