import {
  addCalendarDays,
  compareDateOnly,
  firstWorkingDayOnOrAfter,
  isWorkingDay,
  easternDateOnly,
  easternTimeParts,
  easternDateTimeIso,
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
  const time = easternTimeParts(candidate);
  const preferredDay = firstWorkingDayOnOrAfter(easternDateOnly(candidate));
  const horizonEnd = addCalendarDays(preferredDay, input.horizonDays ?? REPLY_DUE_HORIZON_DAYS);

  const board = createCapacityBoard(input.dailyMax, input.existingTasks);
  for (const reservation of input.openReplyReservations || []) {
    if (!CHANNELS.includes(reservation.channel) || !isWorkingDay(reservation.date)) continue;
    reserveChannelDay(board, reservation.date, reservation.channel);
  }

  if (dailyMaxFor(board.dailyMax, channel) === 0) {
    return easternDateTimeIso(preferredDay, time.hour * 60 + time.minute, time.second);
  }

  const dueDay =
    availableOn(board, preferredDay, channel) > 0
      ? preferredDay
      : findEarliestChannelDay(board, channel, addCalendarDays(preferredDay, 1), horizonEnd)
        || preferredDay;

  return easternDateTimeIso(dueDay, time.hour * 60 + time.minute, time.second);
}
