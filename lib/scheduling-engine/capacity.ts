import { addCalendarDays, compareDateOnly, firstWorkingDayOnOrAfter, isWorkingDay } from "./calendar.ts";
import { CHANNELS, type Channel, type ExistingTask, type TaskStatus } from "./types.ts";

export function occupiesCapacity(status: TaskStatus): boolean {
  return status !== "Cancelled";
}

export function dailyMaxFor(dailyMax: Partial<Record<Channel, number>>, channel: Channel): number {
  const value = dailyMax[channel];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function capacityKey(date: string, channel: Channel): string {
  return `${date}|${channel}`;
}

export function clientDayKey(date: string, clientId: string): string {
  return `${date}|${clientId}`;
}

export type CapacityBoard = {
  dailyMax: Partial<Record<Channel, number>>;
  allocated: Map<string, number>;
  clientDays: Set<string>;
};

export function createCapacityBoard(
  dailyMax: Partial<Record<Channel, number>>,
  existingTasks: ExistingTask[],
): CapacityBoard {
  const allocated = new Map<string, number>();
  const clientDays = new Set<string>();

  for (const task of existingTasks) {
    if (!occupiesCapacity(task.status) || !isWorkingDay(task.scheduledAt)) continue;
    const key = capacityKey(task.scheduledAt, task.channel);
    allocated.set(key, (allocated.get(key) ?? 0) + 1);
    clientDays.add(clientDayKey(task.scheduledAt, task.clientId));
  }

  return { dailyMax, allocated, clientDays };
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
  return isWorkingDay(date) && availableOn(board, date, channel) > 0 && !clientHasChannelOn(board, date, clientId);
}

export function place(board: CapacityBoard, date: string, channel: Channel, clientId: string): void {
  const key = capacityKey(date, channel);
  board.allocated.set(key, allocatedOn(board, date, channel) + 1);
  board.clientDays.add(clientDayKey(date, clientId));
}

export function findEarliestSlot(
  board: CapacityBoard,
  channel: Channel,
  clientId: string,
  startDate: string,
  endDate: string,
): string | undefined {
  if (dailyMaxFor(board.dailyMax, channel) === 0) return undefined;
  if (compareDateOnly(startDate, endDate) > 0) return undefined;

  let date = firstWorkingDayOnOrAfter(startDate);
  while (compareDateOnly(date, endDate) <= 0) {
    if (canPlace(board, date, channel, clientId)) return date;
    date = addCalendarDays(date, 1);
    if (!isWorkingDay(date) && compareDateOnly(date, endDate) <= 0) {
      date = firstWorkingDayOnOrAfter(date);
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
  const uniqueDates = [...new Set(dates)].sort();
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
