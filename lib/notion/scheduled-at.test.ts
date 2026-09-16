import assert from "node:assert/strict";
import { test } from "node:test";
import { notionScheduledAtProperty } from "./scheduled-at.ts";

test("notionScheduledAtProperty writes ET wall time with time_zone", () => {
  const value = notionScheduledAtProperty("2026-09-16T18:10:00.000Z");
  assert.deepEqual(value, {
    date: {
      start: "2026-09-16T14:10:00.000",
      time_zone: "America/New_York",
    },
  });
});

test("notionScheduledAtProperty upgrades legacy date-only to 09:00 ET", () => {
  const value = notionScheduledAtProperty("2026-09-16");
  assert.equal(value.date.start, "2026-09-16T09:00:00.000");
  assert.equal(value.date.time_zone, "America/New_York");
});
