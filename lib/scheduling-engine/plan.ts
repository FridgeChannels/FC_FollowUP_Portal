import { dailyMaxFor, collectUsage, createCapacityBoard, findEarliestSlot, place } from "./capacity.ts";
import {
  DEFAULT_TIME_INTERVAL_MINUTES,
  easternDateOnly,
  easternDateTimeIso,
  easternMinuteOfDayCeil,
  parseScheduledAt,
  resolveWindow,
} from "./calendar.ts";
import { evaluateEligibility } from "./eligibility.ts";
import { sortCandidates } from "./priority.ts";
import type {
  Candidate,
  CommitResult,
  ScheduleInput,
  SchedulePlan,
  ScheduledTask,
  TaskWrite,
  UnscheduledItem,
} from "./types.ts";

const MINUTES_PER_DAY = 24 * 60;

export function previewSchedule(input: ScheduleInput): SchedulePlan {
  const { request, snapshot } = input;
  const now = request.now == null ? new Date() : new Date(request.now);
  if (Number.isNaN(now.getTime())) {
    throw new Error("ScheduleRequest.now must be a valid datetime");
  }

  const { candidates, needsReview } = evaluateEligibility(request.clients, request.creationMethod);
  const sorted = sortCandidates(candidates);

  if (request.testMode) {
    return previewTestMode(sorted, needsReview, now, snapshot);
  }

  const window = resolveWindow(request.preferredStartDate, request.latestDate, request.maxHorizonDays);
  const board = createCapacityBoard(snapshot.dailyMax, snapshot.existingTasks, snapshot.timeInterval);
  const scheduled: ScheduledTask[] = [];
  const unscheduled: UnscheduledItem[] = [];

  for (const candidate of sorted) {
    if (dailyMaxFor(board.dailyMax, candidate.channel) === 0) {
      unscheduled.push(toUnscheduled(candidate, "CHANNEL_PAUSED", "Channel Daily Max is 0; scheduling is paused"));
      continue;
    }

    const scheduledAt = findEarliestSlot(
      board,
      candidate.channel,
      candidate.clientId,
      window.start,
      window.end,
      now,
    );
    if (!scheduledAt) {
      unscheduled.push(toUnscheduled(candidate, "NO_SLOT_IN_WINDOW", "No available US business-day slot in the scheduling window"));
      continue;
    }

    const { dateOnly, minuteOfDay } = parseScheduledAt(scheduledAt);
    place(board, dateOnly, candidate.channel, candidate.clientId, minuteOfDay);
    scheduled.push(toScheduled(candidate, scheduledAt));
  }

  return {
    scheduled,
    needsReview,
    unscheduled,
    usage: collectUsage(board, scheduled.map((task) => task.scheduledAt)),
  };
}

/** From now, +5 minutes each, all on today's ET calendar day; no capacity/window gates. */
function previewTestMode(
  candidates: Candidate[],
  needsReview: SchedulePlan["needsReview"],
  now: Date,
  snapshot: ScheduleInput["snapshot"],
): SchedulePlan {
  const board = createCapacityBoard(snapshot.dailyMax, snapshot.existingTasks, snapshot.timeInterval);
  const scheduled: ScheduledTask[] = [];
  const unscheduled: UnscheduledItem[] = [];
  const todayEt = easternDateOnly(now);
  let nextMinute = easternMinuteOfDayCeil(now);

  for (const candidate of candidates) {
    if (nextMinute >= MINUTES_PER_DAY) {
      unscheduled.push(toUnscheduled(
        candidate,
        "NO_SLOT_IN_WINDOW",
        "Test mode: no remaining minutes left on today's ET calendar day",
      ));
      continue;
    }

    const scheduledAt = easternDateTimeIso(todayEt, nextMinute);
    place(board, todayEt, candidate.channel, candidate.clientId, nextMinute);
    scheduled.push(toScheduled(candidate, scheduledAt));
    nextMinute += DEFAULT_TIME_INTERVAL_MINUTES;
  }

  return {
    scheduled,
    needsReview,
    unscheduled,
    usage: collectUsage(board, scheduled.map((task) => task.scheduledAt)),
  };
}

export function commitSchedule(input: ScheduleInput): CommitResult {
  const plan = previewSchedule(input);
  return {
    ...plan,
    writes: plan.scheduled.map(toTaskWrite),
  };
}

function toScheduled(candidate: Candidate, scheduledAt: string): ScheduledTask {
  return {
    clientId: candidate.clientId,
    contactId: candidate.contactId,
    channel: candidate.channel,
    ownerId: candidate.ownerId,
    scheduledAt,
    priority: candidate.priority,
    creationMethod: candidate.creationMethod,
    templateId: candidate.templateId,
    taskStatus: "Pending",
  };
}

function toUnscheduled(candidate: Candidate, code: UnscheduledItem["code"], reason: string): UnscheduledItem {
  return {
    clientId: candidate.clientId,
    contactId: candidate.contactId,
    channel: candidate.channel,
    ownerId: candidate.ownerId,
    priority: candidate.priority,
    creationMethod: candidate.creationMethod,
    templateId: candidate.templateId,
    code,
    reason,
  };
}

function toTaskWrite(task: ScheduledTask): TaskWrite {
  return {
    followUpContactId: task.contactId,
    ownerId: task.ownerId,
    creationMethod: task.creationMethod,
    templateId: task.templateId,
    scheduledAt: task.scheduledAt,
    priority: task.priority,
    channel: task.channel,
    taskStatus: "Pending",
    notes: task.notes,
  };
}
