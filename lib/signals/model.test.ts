import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateBrand,
  classifySignalEvents,
  effectiveFollowup,
  filterQueue,
  filterWorkspaceQueue,
  pendingSignalIds,
  safeSourceUrl,
  summarize,
  type SignalEvent,
} from "./model.ts";
const now = new Date("2026-10-09T12:00:00Z");
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
test("history-only activity does not keep a brand unread once fresh signals are read", () => {
  const events = [
    event("first", "sample", "2026-10-09T10:00:00.000Z"),
    event("second", "sample", "2026-10-09T11:00:00.000Z"),
    event("third", "sample", "2026-10-09T12:00:00.000Z"),
  ];
  const fresh = classifySignalEvents(events)
    .filter((e) => e.isNewSignal)
    .map((e) => e.id);
  assert.deepEqual(fresh, ["first"]);
  const brand = aggregateBrand({ ...input, events, readIds: fresh });
  assert.equal(brand.events.length, 3);
  assert.equal(brand.needsReview, false);
  assert.equal(brand.unread, false);
});
test("reading a signal keeps the brand queued until an explicit review", () => {
  const read = aggregateBrand({ ...input, id: "read", events: [event("done")], readIds: ["done"] });
  const reviewed = aggregateBrand({
    ...input,
    id: "reviewed",
    events: [event("done")],
    readIds: ["done"],
    review: { eventIds: ["done"], status: "Reviewed" },
  });
  // Reading clears the dot only: the brand must stay visible to the AM.
  assert.equal(read.unread, false);
  assert.deepEqual(pendingSignalIds(read), ["done"]);
  assert.deepEqual(filterWorkspaceQueue([read], "review", "all", now).map((b) => b.id), ["read"]);
  assert.deepEqual(filterWorkspaceQueue([read], "history", "all", now), []);
  // Only an explicit review advances the queue into History.
  assert.deepEqual(pendingSignalIds(reviewed), []);
  assert.deepEqual(filterWorkspaceQueue([reviewed], "review", "all", now), []);
  assert.deepEqual(filterWorkspaceQueue([reviewed], "history", "all", now).map((b) => b.id), ["reviewed"]);
  assert.deepEqual(
    filterWorkspaceQueue([read, reviewed], "review", "all", now).map((b) => b.id),
    ["read"],
  );
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
test("dev mode disables sample cooldown so every tap is its own signal", () => {
  const tap = (id: string, occurredAt: string, sampleDeviceId?: string) => ({
    ...event(id, "sample", occurredAt),
    sampleId: "P978SGEV0M",
    sampleDeviceId,
  });
  // Same device, taps six minutes apart — would collapse to one signal in prod.
  const phone = tap("phone-1", "2026-10-12T08:40:21Z", "device-phone");
  const phoneRepeat = tap("phone-2", "2026-10-12T08:46:02Z", "device-phone");
  const classified = classifySignalEvents([phone, phoneRepeat], { devMode: true });
  // Every tap surfaces as a fresh, independent signal in dev mode.
  assert.deepEqual(
    classified.filter((item) => item.isNewSignal).map((item) => item.id).sort(),
    ["phone-1", "phone-2"],
  );
  assert.equal(classified.find((item) => item.id === "phone-1")?.signalReadId, "phone-1");
  assert.equal(classified.find((item) => item.id === "phone-2")?.signalReadId, "phone-2");
});
test("sample cooldown is scoped per magnet and device", () => {  const tap = (id: string, occurredAt: string, sampleDeviceId?: string) => ({
    ...event(id, "sample", occurredAt),
    sampleId: "P978SGEV0M",
    sampleDeviceId,
  });
  const phone = tap("phone-1", "2026-10-12T08:40:21Z", "device-phone");
  const phoneRepeat = tap("phone-2", "2026-10-12T08:46:02Z", "device-phone");
  const laptop = tap("laptop-1", "2026-10-12T09:31:54Z", "device-laptop");
  const anonymous = tap("anon-1", "2026-10-12T09:40:00Z");
  const anonymousRepeat = tap("anon-2", "2026-10-12T09:45:00Z");
  const classified = classifySignalEvents([
    phone,
    phoneRepeat,
    laptop,
    anonymous,
    anonymousRepeat,
  ]);
  // A different device on the same magnet is a genuinely new signal.
  assert.deepEqual(
    classified.filter((item) => item.isNewSignal).map((item) => item.id).sort(),
    ["anon-1", "laptop-1", "phone-1"],
  );
  // Repeat taps from one device stay grouped under their first event.
  assert.equal(classified.find((item) => item.id === "phone-2")?.signalReadId, "phone-1");
  assert.equal(classified.find((item) => item.id === "laptop-1")?.signalReadId, "laptop-1");
  // Unidentifiable devices merge instead of flooding the queue.
  assert.equal(classified.find((item) => item.id === "anon-2")?.signalReadId, "anon-1");
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
