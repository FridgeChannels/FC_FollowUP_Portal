import { dailyMaxFor, collectUsage, createCapacityBoard, findEarliestSlot, place } from "./capacity.ts";
import { resolveWindow } from "./calendar.ts";
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

export function previewSchedule(input: ScheduleInput): SchedulePlan {
  const { request, snapshot } = input;
  const window = resolveWindow(request.preferredStartDate, request.latestDate, request.maxHorizonDays);
  const { candidates, needsReview } = evaluateEligibility(request.clients, request.creationMethod);
  const board = createCapacityBoard(snapshot.dailyMax, snapshot.existingTasks);
  const scheduled: ScheduledTask[] = [];
  const unscheduled: UnscheduledItem[] = [];

  for (const candidate of sortCandidates(candidates)) {
    if (dailyMaxFor(board.dailyMax, candidate.channel) === 0) {
      unscheduled.push(toUnscheduled(candidate, "CHANNEL_PAUSED", "渠道 Daily Max 为 0，已暂停排班"));
      continue;
    }

    const date = findEarliestSlot(board, candidate.channel, candidate.clientId, window.start, window.end);
    if (!date) {
      unscheduled.push(toUnscheduled(candidate, "NO_SLOT_IN_WINDOW", "在排班窗口内找不到可用工作日"));
      continue;
    }

    place(board, date, candidate.channel, candidate.clientId);
    scheduled.push(toScheduled(candidate, date));
  }

  return {
    scheduled,
    needsReview,
    unscheduled,
    usage: collectUsage(board, scheduled.map(task => task.scheduledAt)),
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
