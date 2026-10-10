import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeReplyActionReminder, latestReplyActionReminder } from "./reply-action-reminder.ts";

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
});
