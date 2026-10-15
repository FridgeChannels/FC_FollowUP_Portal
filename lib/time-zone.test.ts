import assert from "node:assert/strict";
import { test } from "node:test";
import { businessDateOnly, BUSINESS_TIME_ZONE } from "./time-zone.ts";
import { formatBusinessDate, formatScheduledDateTime, getDisplayTimeZone } from "./display-time.ts";
import { easternDayBounds, parseScheduledAt } from "./scheduling-engine/calendar.ts";
import { addDays } from "./outreach-domain.ts";
import { periodStart } from "./signals/model.ts";
import { bounds, today } from "./performance/data.ts";

test("business dates and today use Eastern regardless of the host timezone", () => {
  assert.equal(getDisplayTimeZone(), BUSINESS_TIME_ZONE);
  assert.equal(businessDateOnly("2026-10-15T02:00:00Z"), "2026-10-14");
  assert.equal(today(new Date("2026-10-15T02:00:00Z")), "2026-10-14");
  assert.equal(businessDateOnly("2026-10-15"), "2026-10-15");
  assert.equal(businessDateOnly("invalid"), "");
});

test("date-only display retains the selected calendar date", () => {
  assert.equal(formatBusinessDate("2026-10-15", { month: "short", day: "numeric" }), "Oct 15");
  assert.equal(formatBusinessDate("2026-10-15T02:00:00Z", { month: "short", day: "numeric" }), "Oct 14");
});

test("timestamp displays label Eastern standard and daylight time correctly", () => {
  assert.equal(formatScheduledDateTime("2026-07-01T14:00:00Z"), "2026-07-01 10:00 AM EDT");
  assert.equal(formatScheduledDateTime("2026-12-01T15:00:00Z"), "2026-12-01 10:00 AM EST");
});

test("timezone-less Notion timestamps remain Eastern wall times on every host", () => {
  assert.equal(businessDateOnly("2026-10-15T00:30:00.000"), "2026-10-15");
  assert.equal(formatScheduledDateTime("2026-10-15T00:30:00.000"), "2026-10-15 12:30 AM EDT");
  assert.deepEqual(parseScheduledAt("2026-10-15T00:30:00.000"), { dateOnly: "2026-10-15", minuteOfDay: 30 });
});

test("advancing a calendar day preserves Eastern wall time across daylight saving", () => {
  assert.equal(addDays("2026-10-15", 1), "2026-10-16T04:00:00.000Z");
  assert.equal(addDays("2026-03-07T15:00:00Z", 1), "2026-03-08T14:00:00.000Z");
  assert.equal(addDays("2026-10-31T14:00:00Z", 1), "2026-11-01T15:00:00.000Z");
});

test("daily reporting windows cover the 23-hour spring day and 25-hour autumn day", () => {
  for (const [day, start, end, hours] of [
    ["2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T03:59:59.999Z", 23],
    ["2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T04:59:59.999Z", 25],
  ] as const) {
    const window = easternDayBounds(day);
    assert.equal(new Date(window.start).toISOString(), start);
    assert.equal(new Date(window.end).toISOString(), end);
    assert.equal(window.end - window.start + 1, hours * 3_600_000);
    assert.deepEqual(bounds({ start: day, end: day }), window);
  }
});

test("Signals today and week use Eastern midnight including Sunday UTC-to-local rollover", () => {
  const now = new Date("2026-10-19T02:00:00Z");
  assert.equal(new Date(periodStart("today", now)).toISOString(), "2026-10-18T04:00:00.000Z");
  assert.equal(new Date(periodStart("week", now)).toISOString(), "2026-10-12T04:00:00.000Z");
});
