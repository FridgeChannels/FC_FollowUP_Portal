import assert from "node:assert/strict";
import { it } from "node:test";
import { buildSignalQueue } from "./queue.ts";
import type { SignalBrand, SignalEvent } from "./model.ts";

function event(id: string, occurredAt: string, patch: Partial<SignalEvent> = {}): SignalEvent {
  return { id, brandId: "brand-a", type: "sample", summary: id, occurredAt, detectedAt: occurredAt, highPriority: false, ...patch };
}
function brand(id: string, events: SignalEvent[]): SignalBrand {
  return { id, name: id, ownerName: null, currentCp: "CP1", events, unread: true, needsReview: true, status: "Needs Review" };
}

it("shows the latest event even when an older event remains unread", () => {
  const old = event("older-unread", "2026-10-14T10:00:00Z", { isNewSignal: true });
  const latest = event("latest-read", "2026-10-15T10:00:00Z", { isNewSignal: true });
  const input = { ...brand("brand-a", [old, latest]), readEventIds: [latest.id] };
  assert.equal(buildSignalQueue([input], "all")[0].latest.id, latest.id);
  assert.deepEqual(input.events.map((item) => item.id), [old.id, latest.id]);
});

it("deduplicates equivalent brand IDs, combines their signals, and sorts newest first", () => {
  const rows = buildSignalQueue([
    brand("AA-BB", [event("old", "2026-10-13T10:00:00Z")]),
    brand("brand-b", [event("middle", "2026-10-14T10:00:00Z")]),
    brand("aabb", [event("new", "2026-10-15T10:00:00Z")]),
  ], "all");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.latest.id), ["new", "middle"]);
  assert.equal(rows[0].brand.events.length, 2);
});

it("uses the latest matching signal for both preview and sorting when filtered", () => {
  const rows = buildSignalQueue([
    brand("brand-a", [event("sample-latest", "2026-10-15T10:00:00Z"), event("email-older", "2026-10-13T10:00:00Z", { type: "email" })]),
    brand("brand-b", [event("email-newer", "2026-10-14T10:00:00Z", { type: "email" })]),
    brand("brand-c", [event("sample-only", "2026-10-15T12:00:00Z")]),
  ], "email");
  assert.deepEqual(rows.map((row) => row.latest.id), ["email-newer", "email-older"]);
});
