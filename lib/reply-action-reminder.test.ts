import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeReplyActionReminder,
  encodeReplyActionReminderActivated,
  hasActivatedReplyActionReminder,
  latestReplyActionReminder,
} from "./reply-action-reminder.ts";

describe("reply action reminders", () => {
  it("reads the latest valid reminder from conversation notes", () => {
    const reminder = {
      activityId: "conversation-1",
      dueAt: "2026-10-11T12:00:00.000Z",
      note: "Send the requested pricing sheet.",
      ownerId: "owner-1",
    };
    assert.deepEqual(
      latestReplyActionReminder(`Earlier note\n${encodeReplyActionReminder(reminder)}`),
      reminder,
    );
  });

  it("tracks activation per due time so an extended reminder can re-enter Needs Reply", () => {
    const firstDueAt = "2026-10-11T12:00:00.000Z";
    const nextDueAt = "2026-10-18T12:00:00.000Z";
    const notes = [
      encodeReplyActionReminder({ activityId: "conversation-1", dueAt: firstDueAt, note: "First", ownerId: "owner-1" }),
      encodeReplyActionReminderActivated({ dueAt: firstDueAt, activatedAt: "2026-10-11T12:01:00.000Z" }),
      encodeReplyActionReminder({ activityId: "conversation-1", dueAt: nextDueAt, note: "Later", ownerId: "owner-1" }),
    ].join("\n");
    assert.equal(hasActivatedReplyActionReminder(notes, firstDueAt), true);
    assert.equal(hasActivatedReplyActionReminder(notes, nextDueAt), false);
  });
});
