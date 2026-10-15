import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ role = "AccountManager", ownerId = "am", brandOwnerId = "am", brandOwnerEmail = ownerId === "am" ? "test@example.com" : "other@example.com", status = "In Progress", conflict = false, reminder = null } = {}) {
  const calls = [];
  const brand = { id: "brand", ownerId: brandOwnerId, ownerEmail: brandOwnerEmail, status };
  class FollowupError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const mocks = {
    viewerFromRequest: async () => ({ email: "test@example.com", role, ownerId }),
    canWriteBrand: () => true,
    canAssignBrandOwner: () => role === "Admin",
    FOLLOW_UP_STATUSES: ["Paused", "Completed", "In Progress"],
    FollowupError,
    retrievePage: async () => ({ id: "brand", properties: { Notes: "" } }),
    mapFollowupClientPage: async () => brand,
    mapFollowupClientDetail: async () => brand,
    updateFollowupClient: async (...args) => { calls.push({ action: "updateBrand", args }); },
    propertyText: value => value || "",
    listBrandReplySignals: async () => new Map(),
    attachBrandReplySignals: brands => brands,
    listCheckpoints: async () => [],
    latestFollowUpReminder: () => reminder,
    encodeFollowUpReminderResolution: value => JSON.stringify(value),
    encodeBrandAssignment: () => "assignment",
    mutateFollowup: async (_page, action, body) => {
      if (conflict) throw new FollowupError("Follow-up changed; refresh and retry", 409);
      calls.push({ action, ...body });
      return { version: 7, rounds: [{ id: "round" }] };
    },
    cancelPendingBrandTasks: async () => { calls.push({ action: "cancel" }); return [{ id: "task" }]; },
  };
  const exports = {};
  runInNewContext(compiled, { exports, require: () => mocks, Response });
  return {
    calls,
    request: body => exports.PATCH(new Request("http://localhost/api/brands/brand", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "brand" }) }),
  };
}

test("Admin and the assigned Account Manager can Pause and Complete; other Account Managers cannot", async () => {
  for (const status of ["Paused", "Completed"]) {
    const admin = fixture({ role: "Admin" });
    assert.equal((await admin.request({ status, note: "Customer decision" })).status, 200);
    assert.deepEqual(admin.calls.map(call => call.action), ["patch", "cancel"]);

    const otherAm = fixture({ ownerId: "other-am" });
    assert.equal((await otherAm.request({ status, note: "Customer decision" })).status, 403);
    assert.equal(otherAm.calls.length, 0);
  }
});

test("Pause and Complete preserve version checks and cancel pending work", async () => {
  for (const status of ["Paused", "Completed"]) {
    const f = fixture();
    const response = await f.request({ status, note: "Customer decision", expectedVersion: 6, expectedRoundId: "round" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).cancelledTaskCount, 1);
    assert.deepEqual(f.calls.map(call => call.action), ["patch", "cancel"]);
    assert.equal(f.calls[0].expectedVersion, 6);
  }
});

test("a version conflict remains HTTP 409 and does not cancel tasks", async () => {
  const f = fixture({ conflict: true });
  assert.equal((await f.request({ status: "Paused", note: "Customer decision" })).status, 409);
  assert.equal(f.calls.length, 0);
});

test("Admin can change the Brand Owner directly without changing follow-up history", async () => {
  const admin = fixture({ role: "Admin", brandOwnerId: "old-am", status: "Completed" });
  const response = await admin.request({ ownerId: "new-am", expectedVersion: 3, expectedRoundId: "old-round" });
  assert.equal(response.status, 200);
  assert.equal(admin.calls.length, 1);
  assert.equal(admin.calls[0].action, "updateBrand");
  assert.equal(admin.calls[0].args[0], "brand");
  assert.equal(admin.calls[0].args[1].ownerId, "new-am");
  assert.equal(admin.calls[0].args[1].notes, "assignment");

  const accountManager = fixture({ brandOwnerId: "old-am" });
  assert.equal((await accountManager.request({ ownerId: "new-am" })).status, 403);
  assert.equal(accountManager.calls.length, 0);
});

test("the assigned Account Manager can set a Reply Deadline by owner ID or account email", async () => {
  const ownerIdMatch = fixture();
  assert.equal((await ownerIdMatch.request({ replyDeadline: "2026-10-20" })).status, 200);
  assert.equal(ownerIdMatch.calls[0].action, "updateBrand");

  const emailMatch = fixture({ ownerId: "different-notion-id", brandOwnerId: "legacy-owner-id", brandOwnerEmail: "test@example.com" });
  assert.equal((await emailMatch.request({ replyDeadline: "2026-10-20" })).status, 200);
  assert.equal(emailMatch.calls[0].action, "updateBrand");

  const unassigned = fixture({ ownerId: "different-notion-id", brandOwnerId: "legacy-owner-id", brandOwnerEmail: "someone-else@example.com" });
  assert.equal((await unassigned.request({ replyDeadline: "2026-10-20" })).status, 403);
  assert.equal(unassigned.calls.length, 0);
});

test("Admin resumes a paused Round without changing the Brand Owner", async () => {
  const f = fixture({ role: "Admin", status: "Paused" });
  const response = await f.request({ resumePausedFollowUp: true, status: "In Progress", note: "Resume approved" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.map(call => call.action), ["patch", "resume"]);
  assert.equal(f.calls[0].status, "Paused");
  assert.equal("ownerId" in f.calls[0], false);
  assert.equal(f.calls[1].expectedVersion, 7);
  assert.equal(f.calls[1].expectedRoundId, "round");
});

test("the assigned AM resumes the same Round without reassigning or creating a new assignment", async () => {
  const f = fixture({ status: "Paused", reminder: { dueAt: "2026-10-15T00:00:00Z" } });
  const response = await f.request({ resumePausedFollowUp: true, status: "In Progress", note: "Next contact date reached", expectedVersion: 6, expectedRoundId: "round" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.map(call => call.action), ["patch", "resume"]);
  assert.equal("ownerId" in f.calls[0], false);
  assert.equal(f.calls[0].expectedVersion, 6);
  assert.equal(f.calls[0].expectedRoundId, "round");
  assert.match(f.calls[0].notes, /"action":"Resumed"/);
  assert.doesNotMatch(f.calls[0].notes, /assignment/);
  assert.equal(f.calls[1].expectedVersion, 7);
});

test("other AMs cannot resume and the current AM cannot submit an owner change", async () => {
  for (const [options, extra] of [
    [{ ownerId: "other-am" }, {}],
    [{ role: "Caller" }, {}],
    [{}, { ownerId: "new-am" }],
    [{}, { ownerId: null }],
  ]) {
    const f = fixture({ ...options, status: "Paused" });
    assert.equal((await f.request({ resumePausedFollowUp: true, status: "In Progress", note: "Resume", ...extra })).status, 403);
    assert.equal(f.calls.length, 0);
  }
});

test("AM resume requires a paused brand and a note, and preserves conflicts", async () => {
  for (const [options, note, expected] of [
    [{ status: "Paused" }, " ", 400],
    [{ status: "In Progress" }, "Resume", 400],
    [{ status: "Paused", conflict: true }, "Resume", 409],
  ]) {
    const f = fixture(options);
    assert.equal((await f.request({ resumePausedFollowUp: true, status: "In Progress", note })).status, expected);
    assert.equal(f.calls.length, 0);
  }
});
