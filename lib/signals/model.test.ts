import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateBrand,
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
test("viewing clears unread but does not complete review", () => {
  const brand = aggregateBrand({
    ...input,
    events: [event("tap")],
    readIds: ["tap"],
  });
  assert.equal(brand.unread, false);
  assert.equal(brand.needsReview, true);
  assert.equal(
    filterQueue([brand], { status: "review", time: "week", type: "all" }, now)
      .length,
    1,
  );
});
test("workspace pending queue includes older unreviewed brands and history excludes them", () => {
  const old = aggregateBrand({ ...input, events: [event("old", "sample", "2026-09-01T00:00:00Z")] });
  const handled = aggregateBrand({ ...input, id: "handled", events: [event("done")], review: { eventIds: ["done"], status: "Handled" } });
  assert.deepEqual(filterWorkspaceQueue([old, handled], "review", "all", now).map((b) => b.id), ["a"]);
  assert.deepEqual(filterWorkspaceQueue([old, handled], "history", "all", now).map((b) => b.id), ["handled"]);
  assert.deepEqual(filterWorkspaceQueue([old, handled], "today", "all", now).map((b) => b.id), ["handled"]);
});
test("workspace priority uses pending signals rather than already reviewed ones", () => {
  const previouslyImportant = aggregateBrand({
    ...input,
    events: [
      { ...event("reviewed"), highPriority: true },
      event("pending", "email", "2026-10-09T10:00:00Z"),
    ],
    review: { eventIds: ["reviewed"], status: "Reviewed" },
  });
  const newImportant = aggregateBrand({
    ...input,
    id: "new",
    events: [{ ...event("new", "linkedin", "2026-10-09T09:00:00Z"), highPriority: true }],
  });
  assert.deepEqual(previouslyImportant.reviewedEventIds, ["reviewed"]);
  assert.deepEqual(filterWorkspaceQueue([previouslyImportant, newImportant], "review", "all", now).map((brand) => brand.id), ["new", "a"]);
});
test("review snapshot retains late-arriving and same-time events", () => {
  const reviewed = aggregateBrand({
    ...input,
    events: [event("tap")],
    review: { eventIds: ["tap"], status: "Reviewed" },
  });
  assert.equal(reviewed.needsReview, false);
  const updated = aggregateBrand({
    ...input,
    events: [event("tap"), event("late", "email")],
    review: { eventIds: ["tap"], status: "Reviewed" },
  });
  assert.equal(updated.needsReview, true);
  assert.equal(updated.events.length, 2);
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
