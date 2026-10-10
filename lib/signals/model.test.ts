import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateBrand,
  classifySignalEvents,
  effectiveFollowup,
  filterQueue,
  filterWorkspaceQueue,
  safeSourceUrl,
  summarize,
  type SignalEvent,
} from "./model.ts";
const now = new Date("2026-10-09T12:00:00");
function event(
  id: string,
  type: SignalEvent["type"] = "sample",
  occurredAt = now.toISOString(),
): SignalEvent {
  return {
    id,
    brandId: "a",
    type,
    summary: id,
    occurredAt,
    detectedAt: occurredAt,
    highPriority: false,
  };
}
const input = {
  id: "a",
  name: "Brand A",
  ownerName: "AM",
  currentCp: "CP3",
  readIds: [],
};
test("stable event IDs deduplicate events; three signal types aggregate into one brand", () => {
  const brand = aggregateBrand({
    ...input,
    events: [
      event("tap"),
      event("tap"),
      event("email", "email"),
      event("li", "linkedin"),
    ],
  });
  assert.equal(brand.events.length, 3);
  assert.equal(summarize([brand], now).today, 1);
  assert.equal(summarize([brand], now).week, 1);
});
test("reading one signal clears only that signal's New state", () => {
  const brand = aggregateBrand({
    ...input,
    events: [event("tap"), event("email", "email")],
    readIds: ["tap"],
  });
  assert.equal(brand.unread, true);
  assert.equal(brand.needsReview, true);
  assert.equal(
    filterQueue([brand], { status: "review", time: "week", type: "all" }, now)
      .length,
    1,
  );
});
test("workspace New queue is independent from History", () => {
  const old = aggregateBrand({ ...input, events: [event("old", "sample", "2026-09-01T00:00:00Z")] });
  const read = aggregateBrand({ ...input, id: "read", events: [event("done")], readIds: ["done"] });
  assert.deepEqual(filterWorkspaceQueue([old, read], "review", "all", now).map((b) => b.id), ["a"]);
  assert.deepEqual(filterWorkspaceQueue([old, read], "history", "all", now).map((b) => b.id), ["read"]);
});
test("workspace priority ignores read high-priority signals", () => {
  const previouslyImportant = aggregateBrand({
    ...input,
    events: [
      { ...event("reviewed"), highPriority: true },
      event("pending", "email", "2026-10-09T10:00:00Z"),
    ],
    readIds: ["reviewed"],
  });
  const newImportant = aggregateBrand({
    ...input,
    id: "new",
    events: [{ ...event("new", "linkedin", "2026-10-09T09:00:00Z"), highPriority: true }],
  });
  assert.deepEqual(previouslyImportant.readEventIds, ["reviewed"]);
  assert.deepEqual(filterWorkspaceQueue([previouslyImportant, newImportant], "review", "all", now).map((brand) => brand.id), ["new", "a"]);
});
test("signal cooldowns preserve all history without generating duplicate New signals", () => {
  const first = event("tap-1", "sample", "2026-10-09T00:00:00Z");
  const repeat = event("tap-2", "sample", "2026-10-09T04:00:00Z");
  const later = event("tap-3", "sample", "2026-10-10T01:00:00Z");
  const emailFirst = { ...event("email-1", "email", "2026-10-09T01:00:00Z"), messageId: "message-1" };
  const emailRepeat = { ...event("email-2", "email", "2026-10-09T02:00:00Z"), messageId: "message-1" };
  const linkedinFirst = { ...event("li-1", "linkedin", "2026-10-09T01:00:00Z"), summary: "New product launch" };
  const linkedinRepeat = { ...event("li-2", "linkedin", "2026-10-12T01:00:00Z"), summary: "New product launch" };
  const classified = classifySignalEvents([first, repeat, later, emailFirst, emailRepeat, linkedinFirst, linkedinRepeat]);
  assert.deepEqual(classified.filter((item) => item.isNewSignal).map((item) => item.id).sort(), ["email-1", "li-1", "tap-1", "tap-3"]);
  assert.equal(classified.find((item) => item.id === "tap-2")?.signalReadId, "tap-1");
  assert.equal(classified.find((item) => item.id === "email-2")?.signalReadId, "email-1");
  assert.equal(classified.find((item) => item.id === "li-2")?.signalReadId, "li-1");
});
test("filters apply immediately and priority precedes recency", () => {
  const ordinary = aggregateBrand({ ...input, events: [event("tap")] });
  const important = aggregateBrand({
    ...input,
    id: "b",
    events: [{ ...event("li", "linkedin"), highPriority: true }],
  });
  assert.equal(
    filterQueue(
      [ordinary, important],
      { status: "review", time: "week", type: "all" },
      now,
    )[0].id,
    "b",
  );
  assert.deepEqual(
    filterQueue(
      [ordinary, important],
      { status: "all", time: "today", type: "email" },
      now,
    ),
    [],
  );
});
test("week starts Monday and excludes previous Sunday and future events", () => {
  const brand = aggregateBrand({
    ...input,
    events: [
      event("old", "sample", new Date("2026-10-04T12:00:00").toISOString()),
      event("future", "sample", new Date("2026-10-10T12:00:00").toISOString()),
    ],
  });
  assert.equal(summarize([brand], now).week, 0);
});
test("drafts, queued messages, unanswered and unfinished calls cannot be handled", () => {
  const base = {
    direction: "Outbound",
    channel: "Email",
    status: "Scheduled",
    callResult: null,
    createdAt: now.toISOString(),
  };
  assert.equal(effectiveFollowup(base, now.getTime()), false);
  assert.equal(
    effectiveFollowup({ ...base, status: "Sent" }, now.getTime()),
    true,
  );
  assert.equal(
    effectiveFollowup({ ...base, status: "Sent" }, now.getTime() + 1),
    false,
  );
  assert.equal(
    effectiveFollowup(
      {
        ...base,
        channel: "Phone",
        status: "Completed",
        callResult: "No Answer",
      },
      now.getTime(),
    ),
    false,
  );
  assert.equal(
    effectiveFollowup(
      {
        ...base,
        channel: "Phone",
        status: "Completed",
        callResult: "Connected",
      },
      now.getTime(),
    ),
    false,
  );
  assert.equal(
    effectiveFollowup(
      {
        ...base,
        channel: "Phone",
        status: "Completed",
        callResult: "Connected",
        quo: { call: { completedAt: now.toISOString() } },
      },
      now.getTime(),
    ),
    true,
  );
});
test("source evidence allows only HTTP URLs", () => {
  assert.equal(safeSourceUrl("javascript:alert(1)"), undefined);
  assert.equal(
    safeSourceUrl("https://linkedin.com/feed/"),
    "https://linkedin.com/feed/",
  );
});
