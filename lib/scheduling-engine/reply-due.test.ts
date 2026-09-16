import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveReplyDueAt,
  shanghaiDateOnly,
  shanghaiDateTimeIso,
  shanghaiTimeParts,
} from "./reply-due.ts";
import type { ExistingTask } from "./types.ts";

describe("resolveReplyDueAt", () => {
  it("defaults to occurredAt + 24h on a working day", () => {
    // Thursday 10:00 +08 → Friday 10:00 +08
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T02:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 10 },
      existingTasks: [],
    });
    assert.equal(shanghaiDateOnly(due), "2026-09-11");
    assert.equal(shanghaiTimeParts(due).hour, 10);
  });

  it("skips weekend to the next working day", () => {
    // Friday 10:00 +08 → Sat 10:00 → Monday
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-11T02:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 10 },
      existingTasks: [],
    });
    assert.equal(shanghaiDateOnly(due), "2026-09-14");
  });

  it("defers to the next day with remaining channel capacity", () => {
    const existingTasks: ExistingTask[] = Array.from({ length: 2 }, (_, index) => ({
      clientId: `c${index}`,
      channel: "Email" as const,
      scheduledAt: "2026-09-11",
      status: "Pending" as const,
    }));
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T02:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 2 },
      existingTasks,
    });
    assert.equal(shanghaiDateOnly(due), "2026-09-14");
  });

  it("counts open Needs Reply reservations toward capacity", () => {
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T02:00:00.000Z",
      channel: "SMS",
      dailyMax: { SMS: 1 },
      existingTasks: [],
      openReplyReservations: [{ date: "2026-09-11", channel: "SMS" }],
    });
    assert.equal(shanghaiDateOnly(due), "2026-09-14");
  });

  it("falls back to +24h working day when Daily Max is 0", () => {
    const due = resolveReplyDueAt({
      occurredAt: "2026-09-10T02:00:00.000Z",
      channel: "Email",
      dailyMax: { Email: 0 },
      existingTasks: [],
    });
    assert.equal(shanghaiDateOnly(due), "2026-09-11");
  });
});

describe("shanghaiDateTimeIso", () => {
  it("round-trips Shanghai local wall time", () => {
    const iso = shanghaiDateTimeIso("2026-09-11", { hour: 10, minute: 30, second: 0 });
    assert.equal(shanghaiDateOnly(iso), "2026-09-11");
    assert.deepEqual(shanghaiTimeParts(iso), { hour: 10, minute: 30, second: 0 });
  });
});
