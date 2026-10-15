import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveReplyDueAt } from "./reply-due.ts";
import { easternDateOnly, easternDateTimeIso, easternTimeParts } from "./calendar.ts";
import type { ExistingTask } from "./types.ts";

describe("resolveReplyDueAt", () => {
  it("preserves Eastern wall time and seconds when capacity moves a reply across DST weekends", () => {
    for (const [occurredAt, expected] of [
      ["2026-03-06T15:30:45Z", "2026-03-09T14:30:45.000Z"],
      ["2026-10-30T14:30:45Z", "2026-11-02T15:30:45.000Z"],
    ]) {
      assert.equal(resolveReplyDueAt({ occurredAt, channel: "Email", dailyMax: { Email: 10 }, existingTasks: [] }), expected);
    }
  });
  it("defaults to occurredAt + 24h on a working day", () => {
    // Thursday 10:00 EDT → Friday 10:00 EDT
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T14:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 10 },
      existingTasks: [],
    });
    assert.equal(easternDateOnly(due), "2026-09-11");
    assert.equal(easternTimeParts(due).hour, 10);
  });

  it("skips weekend to the next working day", () => {
    // Friday 10:00 EDT → Sat 10:00 → Monday
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-11T14:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 10 },
      existingTasks: [],
    });
    assert.equal(easternDateOnly(due), "2026-09-14");
  });

  it("defers to the next day with remaining channel capacity", () => {
    const existingTasks: ExistingTask[] = Array.from({ length: 2 }, (_, index) => ({
      clientId: `c${index}`,
      channel: "Email" as const,
      scheduledAt: "2026-09-11",
      status: "Pending" as const,
    }));
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T14:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 2 },
      existingTasks,
    });
    assert.equal(easternDateOnly(due), "2026-09-14");
  });

  it("counts open Needs Reply reservations toward capacity", () => {
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T14:00:00.000Z",
      channel: "SMS",
      dailyMax: { SMS: 1 },
      existingTasks: [],
      openReplyReservations: [{ date: "2026-09-11", channel: "SMS" }],
    });
    assert.equal(easternDateOnly(due), "2026-09-14");
  });

  it("falls back to +24h working day when Daily Max is 0", () => {
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T14:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 0 },
      existingTasks: [],
    });
    assert.equal(easternDateOnly(due), "2026-09-11");
  });
});

describe("easternDateTimeIso", () => {
  it("round-trips Eastern local wall time", () => {
    const iso = easternDateTimeIso("2026-09-11", 10 * 60 + 30);
    assert.equal(easternDateOnly(iso), "2026-09-11");
    assert.deepEqual(easternTimeParts(iso), { hour: 10, minute: 30, second: 0 });
  });
});
