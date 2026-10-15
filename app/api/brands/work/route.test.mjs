import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const now = Date.parse("2026-10-15T12:00:00.000Z");
class TestDate extends Date { static now() { return now; } }
function load(path, mocks = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: () => mocks, Response, Date: TestDate });
  return exports;
}
const reminders = load("../../../../lib/followup-reminder.ts");
const work = load("../../../../lib/brand-work.ts");
const dueAt = new Date(now).toISOString();
const reminder = (date = dueAt, ownerId = "previous-am") => reminders.encodeFollowUpReminder({ dueAt: date, ownerId, note: "Reconnect after budget review" });

function metadata({ id = "brand", ownerId = "am", status = "Paused", notes = reminder() } = {}) {
  return {
    page: { id, properties: { Notes: notes } },
    brand: { id, name: id, status, ownerId, ownerAssignedAt: "2026-10-01T00:00:00Z" },
  };
}
function fixture({ role = "AccountManager", ownerId = "am", records = [metadata()] } = {}) {
  const scopes = [];
  const mocks = {
    ...reminders, ...work,
    viewerFromRequest: async () => ({ email: "viewer@example.com", role, ownerId, isAdmin: role === "Admin" }),
    canAccessTestBrands: () => false,
    isTestOnlyViewer: () => false,
    runWithNotionLimit: fn => fn(),
    reopenDueReplyActionReminders: async () => {},
    getFollowupConversationDbId: () => "conversations",
    getFollowupTaskDbId: () => "tasks",
    // An old reply and assignment must not bypass a pause's date or AM scope.
    queryDatabasePages: async id => id === "tasks" ? [] : [{
      id: "reply", properties: { "Follow-up Client": "brand", Channel: "Email", Content: "Old reply" },
    }],
    propertyText: value => value || "",
    firstRelationId: value => value,
    propertyDate: () => null,
    listScopedClientBrandMetadata: async scope => {
      scopes.push(scope);
      return records.filter(({ brand }) => !scope.ownerPageId || brand.ownerId === scope.ownerPageId);
    },
    listFollowupConversationsByBrands: async () => [],
    listFollowupTaskSignalsByBrands: async () => [],
    listBrandInteractionSignals: async () => new Map(),
    attachBrandInteractionSignals: brands => brands,
  };
  mocks.listBrandWorkForViewer = load("../../../../lib/notion/brand-work.ts", mocks).listBrandWorkForViewer;
  const route = load("./route.ts", mocks);
  return { scopes, get: async () => {
    const response = await route.GET(new Request("http://localhost/api/brands/work"));
    assert.equal(response.status, 200);
    return response.json();
  } };
}

test("a pause due now returns to the current AM without changing owner or status", async () => {
  const record = metadata();
  const before = structuredClone(record);
  const f = fixture({ records: [record] });
  const payload = await f.get();
  assert.equal(f.scopes[0].ownerPageId, "am");
  assert.equal(payload.counts.myWork, 1);
  assert.equal(payload.counts.pauseDue, 1);
  assert.equal(payload.brands[0].pauseDue.target.dueAt, dueAt);
  assert.equal(payload.brands[0].brand.ownerId, "am");
  assert.equal(payload.brands[0].brand.status, "Paused");
  assert.deepEqual(record, before);
});

test("Admin never receives a paused brand, even with old assignment and reply signals", async () => {
  const f = fixture({ role: "Admin", records: [metadata(), metadata({ id: "active", status: "In Progress" })] });
  const payload = await f.get();
  assert.equal(f.scopes[0].ownerPageId, undefined);
  assert.equal(payload.counts.pauseDue, 0);
  assert.deepEqual(payload.brands.map(row => row.brand.id), ["active"]);
});

test("reminders follow the current owner rather than the AM saved when paused", async () => {
  const records = [metadata({ ownerId: "new-am", notes: reminder(dueAt, "am") })];
  assert.equal((await fixture({ records }).get()).counts.myWork, 0);
  assert.equal((await fixture({ ownerId: "new-am", records }).get()).counts.pauseDue, 1);
});

test("future, undated, invalid and resolved pauses stay out of the AM action queue", async () => {
  const resolved = reminders.encodeFollowUpReminderResolution({ dueAt, resolvedAt: dueAt, resolvedBy: "am", action: "Resumed" });
  for (const notes of [reminder("2026-10-16T12:00:00Z"), "No contact date", '[FOLLOW_UP_REVIEW]{"dueAt":"invalid"}', `${reminder()}\n${resolved}`]) {
    const payload = await fixture({ records: [metadata({ notes })] }).get();
    assert.equal(payload.counts.myWork, 0, notes);
    assert.equal(payload.counts.pauseDue, 0, notes);
  }
});

test("an extended pause waits for its latest date", async () => {
  const notes = `${reminder()}\n${reminder("2026-10-20T12:00:00Z")}`;
  assert.equal((await fixture({ records: [metadata({ notes })] }).get()).counts.myWork, 0);
});

test("unassigned and completed brands have no pause due reminder", async () => {
  assert.equal((await fixture({ records: [metadata({ ownerId: null })] }).get()).counts.myWork, 0);
  assert.equal((await fixture({ records: [metadata({ status: "Completed" })] }).get()).counts.pauseDue, 0);
});
