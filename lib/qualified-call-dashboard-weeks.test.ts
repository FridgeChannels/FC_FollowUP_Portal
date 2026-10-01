import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupQualifiedCallDaysByWeek } from "./qualified-call-dashboard-weeks.ts";

describe("groupQualifiedCallDaysByWeek", () => {
  it("uses the current partial Monday-Friday week for the first period", () => {
    const weeks = groupQualifiedCallDaysByWeek([
      { date: "2026-10-02", total: 1, callers: [] },
      { date: "2026-09-30", total: 2, callers: [] },
    ], "2026-10-02");

    assert.deepEqual(weeks[0], {
      key: "2026-09-28",
      start: "2026-09-28",
      end: "2026-10-02",
      days: [
        { date: "2026-10-02", total: 1, callers: [] },
        { date: "2026-09-30", total: 2, callers: [] },
      ],
    });
  });
});
