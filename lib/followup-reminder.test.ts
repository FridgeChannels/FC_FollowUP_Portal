import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeFollowUpReminder,
  encodeFollowUpReminderResolution,
  hasResolvedFollowUpReminder,
  latestFollowUpReminder,
} from "./followup-reminder.ts";

test("a resolved pause reminder is suppressed without suppressing a later pause", () => {
  const first = encodeFollowUpReminder({ dueAt: "2026-10-13T01:00:00.000Z", note: "First pause", ownerId: "owner-a" });
  const resolved = encodeFollowUpReminderResolution({ dueAt: "2026-10-13T01:00:00.000Z", resolvedAt: "2026-10-13T02:00:00.000Z", resolvedBy: "admin-a", action: "Reassigned" });
  const second = encodeFollowUpReminder({ dueAt: "2026-11-13T01:00:00.000Z", note: "Extended pause", ownerId: "owner-b" });
  const notes = [first, resolved, second].join("\n");

  assert.equal(hasResolvedFollowUpReminder(notes, "2026-10-13T01:00:00.000Z"), true);
  assert.equal(hasResolvedFollowUpReminder(notes, "2026-11-13T01:00:00.000Z"), false);
  assert.equal(latestFollowUpReminder(notes)?.dueAt, "2026-11-13T01:00:00.000Z");
});
