import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSignalNotifications } from "./notifications.ts";
import type { SignalEvent } from "./model.ts";

function event(id: string, type: SignalEvent["type"], patch: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id, type, brandId: "brand", summary: `${type} summary`,
    occurredAt: "2026-10-15T12:00:00Z", detectedAt: "2026-10-15T12:00:00Z",
    highPriority: false, isNewSignal: true, ...patch,
  };
}

test("retains Sample Tap, Email Open and LinkedIn summaries even when all are read", () => {
  const events = [event("sample", "sample", { sampleId: "SN1" }), event("email", "email", { subject: "Proposal" }), event("linkedin", "linkedin")];
  const notifications = buildSignalNotifications(events, events.map((item) => item.id));
  assert.deepEqual(new Set(notifications.map((item) => item.typeLabel)), new Set(["Sample Tap", "Email Open", "LinkedIn"]));
  assert.equal(notifications.length, 3);
  assert.equal(notifications.every((item) => !item.unread), true);
  assert.equal(notifications.find((item) => item.latest.type === "sample")?.title, "Sample SN1 visited 1 time");
  assert.equal(notifications.find((item) => item.latest.type === "email")?.title, "Proposal · 1 open detected");
  assert.equal(notifications.find((item) => item.latest.type === "linkedin")?.title, "linkedin summary");
});

test("reading changes only the unread flag and keeps the grouped notification", () => {
  const events = [event("first", "sample", { signalKey: "sample-group", signalReadId: "first", sampleId: "SN1" }), event("repeat", "sample", { signalKey: "sample-group", signalReadId: "first", sampleId: "SN1", isNewSignal: false })];
  assert.equal(buildSignalNotifications(events, [])[0].unread, true);
  const afterRead = buildSignalNotifications(events, ["first"]);
  assert.equal(afterRead.length, 1);
  assert.equal(afterRead[0].unread, false);
  assert.equal(afterRead[0].title, "Sample SN1 visited 2 times");
});

test("deduplicates repeated events before counting email opens and uses the latest subject", () => {
  const first = event("open1", "email", { signalKey: "message1", subject: "Old title" });
  const latest = event("open2", "email", { signalKey: "message1", subject: "Latest title", detectedAt: "2026-10-15T14:00:00Z" });
  const rows = buildSignalNotifications([first, first, latest], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Latest title · 2 opens detected");
  assert.equal(rows[0].timestamp, latest.detectedAt);
});

test("sorts all types by the same time shown in each summary", () => {
  const rows = buildSignalNotifications([
    event("sample", "sample", { occurredAt: "2026-10-15T13:00:00Z" }),
    event("email", "email", { detectedAt: "2026-10-15T14:00:00Z" }),
    event("linkedin", "linkedin", { publishedAt: "2026-10-15T11:00:00Z", detectedAt: "2026-10-15T15:00:00Z" }),
  ], []);
  assert.deepEqual(rows.map((item) => item.latest.id), ["email", "sample", "linkedin"]);
});

test("keeps summaries when source URLs or email subjects are unavailable", () => {
  const rows = buildSignalNotifications([event("email", "email", { subject: "Subject unavailable" }), event("linkedin", "linkedin", { summary: "" })], []);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((item) => item.latest.type === "email")?.title, "Email · 1 open detected");
  assert.equal(rows.find((item) => item.latest.type === "linkedin")?.title, "LinkedIn update");
});
