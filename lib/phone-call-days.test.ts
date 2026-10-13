import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPhoneCallTime, groupPhoneCallsByDay } from "./phone-call-days.ts";

const zone = "America/New_York";

describe("Phone call day groups", () => {
  it("groups by the displayed day, sorts days and calls newest first, and leaves the input intact", () => {
    const calls = [
      { id: "latest", createdAt: "2026-10-13T14:00:00Z" },
      { id: "late", createdAt: "2026-10-13T02:30:00Z" },
      { id: "early", createdAt: "2026-10-12T10:00:00-04:00" },
    ];
    const groups = groupPhoneCallsByDay(calls, zone);
    assert.deepEqual(groups.map((group) => [group.key, group.items.map((item) => item.id)]), [
      ["2026-10-13", ["latest"]], ["2026-10-12", ["late", "early"]],
    ]);
    assert.equal(groups[0].weekday, "Tue");
    assert.deepEqual(calls.map((item) => item.id), ["latest", "late", "early"]);
    assert.match(formatPhoneCallTime(calls[1].createdAt, zone), /10:30.*PM EDT/);
  });

  it("sorts repeated clock times by their real timestamps at the DST boundary", () => {
    const calls = [
      { id: "standard", createdAt: "2026-11-01T01:15:00-05:00" },
      { id: "daylight", createdAt: "2026-11-01T01:45:00-04:00" },
    ];
    const groups = groupPhoneCallsByDay(calls, zone);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].items.map((item) => item.id), ["standard", "daylight"]);
    assert.match(formatPhoneCallTime(calls[0].createdAt, zone), /EST/);
    assert.match(formatPhoneCallTime(calls[1].createdAt, zone), /EDT/);
  });

  it("honors a configured timezone across midnight and year boundaries", () => {
    const calls = [{ createdAt: "2026-12-31T18:00:00Z" }, { createdAt: "2027-01-01T17:00:00Z" }];
    assert.deepEqual(groupPhoneCallsByDay(calls, "Asia/Shanghai").map((group) => group.key), ["2027-01-02", "2027-01-01"]);
  });

  it("retains undated calls separately without making them the latest dated group", () => {
    const calls = [{ createdAt: "invalid" }, { createdAt: "2026-10-13T14:00:00Z" }, { createdAt: "" }];
    const groups = groupPhoneCallsByDay(calls, zone);
    assert.deepEqual(groups.map((group) => group.key), ["2026-10-13", "unknown"]);
    assert.equal(groups[1].label, "Unknown date");
    assert.equal(groups.flatMap((group) => group.items).length, calls.length);
    assert.equal(formatPhoneCallTime("", zone), "Time unavailable");
    assert.equal(formatPhoneCallTime("invalid", zone), "invalid");
    assert.deepEqual(groupPhoneCallsByDay([], zone), []);
  });
});

it("uses actual Quo start across tasks and midnight rather than record creation or completion", () => {
  const calls = [
    { id: "a", taskId: "one", createdAt: "2026-10-08T14:00:00Z", recordedAt: "2026-10-07T04:01:00Z", quo: { call: { createdAt: "2026-10-07T03:59:00Z" } } },
    { id: "b", taskId: "two", createdAt: "2026-10-09T14:00:00Z", quo: { call: { createdAt: "2026-10-06T17:00:00Z" } } },
  ];
  const days = groupPhoneCallsByDay(calls, zone);
  assert.equal(days.length, 1);
  assert.equal(days[0].key, "2026-10-06");
  assert.deepEqual(days[0].items.map((item) => item.id), ["a", "b"]);
});
it("keeps calls with no occurrence time unknown instead of assigning their sync date", () => {
  const calls = [{ createdAt: "2026-10-13T14:00:00Z", quo: {} }, { createdAt: "2026-10-13T14:00:00Z", recordedAt: "2026-10-12T14:00:00Z", quo: { call: { createdAt: "invalid" } } }];
  assert.deepEqual(groupPhoneCallsByDay(calls, zone).map((day) => day.key), ["2026-10-12", "unknown"]);
});
