import type { BrandActivity, BrandTask } from "../brand-list.ts";
import { listChannelCapacityConfig } from "../notion/capacity.ts";
import { isScheduleTestMode } from "../notion/config.ts";
import { listFollowupConversations } from "../notion/conversations.ts";
import { listExistingTasksForSchedule, listFollowupTasks } from "../notion/tasks.ts";
import { easternDateOnly, parseScheduledAt } from "../scheduling-engine/calendar.ts";
import { dailyMaxFor } from "../scheduling-engine/capacity.ts";
import {
  releaseLinkedInColdQuota,
  resolveActiveLinkedInAccount,
  reserveLinkedInColdQuota,
} from "./accounts.ts";
import {
  evaluateLinkedInSamePersonGate,
  pickFollowupSenderAccount,
  resolveLinkedInOutreachKind,
} from "./gate.ts";
import { appendLinkedInGateNote, formatLinkedInGateNote, parseLinkedInGateNote } from "./notes.ts";
import type { LinkedInCreateDecision, LinkedInOutreachKind } from "./types.ts";

export type LinkedInSendability = {
  available: boolean;
  reason?: string;
  outreachKind?: LinkedInOutreachKind;
  activeAccount?: string;
};

async function assertLinkedInColdBandwidthAvailable() {
  if (isScheduleTestMode()) return;
  const [capacity, existing] = await Promise.all([
    listChannelCapacityConfig(),
    listExistingTasksForSchedule(),
  ]);
  const dailyMax = dailyMaxFor(capacity.dailyMax, "LinkedIn");
  if (dailyMax <= 0) {
    throw new Error("LinkedIn channel is paused (Daily Max is 0).");
  }
  const today = easternDateOnly();
  const used = existing.filter((task) => {
    if (task.channel !== "LinkedIn") return false;
    if (task.status === "Cancelled") return false;
    const { dateOnly } = parseScheduledAt(task.scheduledAt);
    return dateOnly === today;
  }).length;
  if (used >= dailyMax) {
    throw new Error(`LinkedIn daily capacity is full (${used}/${dailyMax}).`);
  }
}

async function loadLinkedInContext(input: {
  contactId: string;
  tasks?: BrandTask[];
  activities?: BrandActivity[];
}) {
  const [tasks, activities] = await Promise.all([
    input.tasks
      ? Promise.resolve(input.tasks)
      : listFollowupTasks([input.contactId]),
    input.activities
      ? Promise.resolve(input.activities)
      : listFollowupConversations([input.contactId]),
  ]);
  return { tasks, activities };
}

/** Read-only gate used by Send message UI. Never reserves monthly quota. */
export async function evaluateLinkedInSendability(input: {
  contactId: string;
  tasks?: BrandTask[];
  activities?: BrandActivity[];
  checkBandwidth?: boolean;
}): Promise<LinkedInSendability> {
  try {
    const { tasks, activities } = await loadLinkedInContext(input);
    const outreachKind = resolveLinkedInOutreachKind(activities);
    const samePerson = evaluateLinkedInSamePersonGate({ outreachKind, tasks, activities });
    if (!samePerson.ok) {
      return { available: false, reason: samePerson.error, outreachKind };
    }

    const active = await resolveActiveLinkedInAccount();
    if (!active.ok) {
      return { available: false, reason: active.error, outreachKind };
    }

    if (outreachKind === "cold" && input.checkBandwidth !== false) {
      await assertLinkedInColdBandwidthAvailable();
    }

    return {
      available: true,
      outreachKind,
      activeAccount: active.account.name,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "LinkedIn is unavailable",
    };
  }
}

export async function prepareLinkedInOutbound(input: {
  contactId: string;
  tasks?: BrandTask[];
  activities?: BrandActivity[];
  /** When false, skip Daily Max (e.g. OmniReach already reserved a slot). */
  checkBandwidth?: boolean;
  /** When false, only validate and pick Sender; do not pre-debit monthly quota. */
  reserveQuota?: boolean;
}): Promise<LinkedInCreateDecision> {
  const { tasks, activities } = await loadLinkedInContext(input);

  const outreachKind = resolveLinkedInOutreachKind(activities);
  const samePerson = evaluateLinkedInSamePersonGate({ outreachKind, tasks, activities });
  if (!samePerson.ok) throw new Error(samePerson.error);

  const active = await resolveActiveLinkedInAccount();
  if (!active.ok) throw new Error(active.error);

  if (outreachKind === "followup_after_reply") {
    const preferred = pickFollowupSenderAccount(tasks, activities, active.account.name);
    const preferredAccount = active.accounts.find(
      (item) => item.name.trim().toLowerCase() === preferred.trim().toLowerCase(),
    );
    const senderAccount =
      preferredAccount &&
      preferredAccount.status !== "Paused" &&
      preferredAccount.status !== "Exhausted"
        ? preferredAccount.name
        : active.account.name;
    const meta = {
      outreachKind,
      senderAccount,
      countsAgainstQuota: false,
    } as const;
    return {
      ...meta,
      countsAgainstBandwidth: false,
      noteLine: formatLinkedInGateNote(meta),
    };
  }

  if (input.checkBandwidth !== false) {
    await assertLinkedInColdBandwidthAvailable();
  }

  if (input.reserveQuota !== false) {
    await reserveLinkedInColdQuota(active.account.id);
  }
  const meta = {
    outreachKind: "cold" as const,
    senderAccount: active.account.name,
    countsAgainstQuota: input.reserveQuota !== false,
  };
  return {
    ...meta,
    countsAgainstBandwidth: true,
    noteLine: formatLinkedInGateNote(meta),
  };
}

export async function releaseLinkedInColdQuotaFromTask(input: {
  channel?: string | null;
  status?: string | null;
  previousStatus?: string | null;
  notes?: string | null;
}) {
  if (input.channel !== "LinkedIn") return null;
  if (input.status !== "Cancelled") return null;
  if (input.previousStatus === "Cancelled") return null;
  const meta = parseLinkedInGateNote(input.notes);
  if (!meta?.countsAgainstQuota || meta.outreachKind !== "cold") return null;
  return releaseLinkedInColdQuota(meta.senderAccount);
}

export function mergeLinkedInNotes(baseNotes: string | null | undefined, decision: LinkedInCreateDecision) {
  return appendLinkedInGateNote(baseNotes, decision);
}
