import type { BrandActivity, BrandTask } from "../brand-list.ts";
import { parseLinkedInGateNote } from "./notes.ts";
import type { LinkedInOutreachKind } from "./types.ts";

function isOpenTaskStatus(status?: string | null) {
  return status === "Pending" || status === "In Progress";
}

export function contactHasLinkedInInbound(
  activities: Array<Pick<BrandActivity, "channel" | "direction">>,
) {
  return activities.some(
    (item) => item.channel === "LinkedIn" && item.direction === "Inbound",
  );
}

export function resolveLinkedInOutreachKind(
  activities: Array<Pick<BrandActivity, "channel" | "direction">>,
): LinkedInOutreachKind {
  return contactHasLinkedInInbound(activities) ? "followup_after_reply" : "cold";
}

function taskLooksLikeColdLinkedIn(task: Pick<BrandTask, "channel" | "status" | "notes">) {
  if (task.channel !== "LinkedIn") return false;
  if (task.status === "Cancelled") return false;
  const meta = parseLinkedInGateNote(task.notes);
  if (meta) return meta.outreachKind === "cold";
  return true;
}

export function evaluateLinkedInSamePersonGate(input: {
  outreachKind: LinkedInOutreachKind;
  tasks: Array<Pick<BrandTask, "channel" | "status" | "notes">>;
  activities: Array<Pick<BrandActivity, "channel" | "direction">>;
}): { ok: true } | { ok: false; error: string } {
  if (input.outreachKind === "followup_after_reply") {
    if (!contactHasLinkedInInbound(input.activities)) {
      return {
        ok: false,
        error: "This contact has no LinkedIn reply yet, so a follow-up cannot be created.",
      };
    }
    // Open LinkedIn tasks are expected while a reply is needed — do not block follow-ups.
    return { ok: true };
  }

  const openLinkedIn = input.tasks.some(
    (task) => task.channel === "LinkedIn" && isOpenTaskStatus(task.status),
  );
  if (openLinkedIn) {
    return {
      ok: false,
      error: "An open LinkedIn task already exists for this contact.",
    };
  }

  const unrepliedCold = input.tasks.some((task) => taskLooksLikeColdLinkedIn(task));
  if (unrepliedCold && !contactHasLinkedInInbound(input.activities)) {
    return {
      ok: false,
      error: "Waiting for a reply before another LinkedIn message to this contact.",
    };
  }
  return { ok: true };
}

export function pickFollowupSenderAccount(
  tasks: Array<Pick<BrandTask, "channel" | "status" | "notes" | "createdAt" | "scheduledAt">>,
  activities: Array<Pick<BrandActivity, "channel" | "direction" | "sender" | "createdAt" | "recordedAt">>,
  activeAccountName: string,
) {
  const coldTasks = tasks
    .filter((task) => task.channel === "LinkedIn" && task.status !== "Cancelled")
    .map((task) => ({
      task,
      meta: parseLinkedInGateNote(task.notes),
    }))
    .filter((item) => item.meta?.outreachKind === "cold" && item.meta.senderAccount)
    .sort((left, right) => {
      const a = left.task.createdAt || left.task.scheduledAt || "";
      const b = right.task.createdAt || right.task.scheduledAt || "";
      return b.localeCompare(a);
    });
  if (coldTasks[0]?.meta?.senderAccount) return coldTasks[0].meta.senderAccount;

  const outbound = activities
    .filter((item) => item.channel === "LinkedIn" && item.direction === "Outbound" && item.sender)
    .sort((left, right) => {
      const a = left.recordedAt || left.createdAt || "";
      const b = right.recordedAt || right.createdAt || "";
      return b.localeCompare(a);
    });
  if (outbound[0]?.sender) return outbound[0].sender;
  return activeAccountName;
}
