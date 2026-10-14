import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ role = "AccountManager", ownerId = "am", status = "In Progress", conflict = false } = {}) {
  const calls = [];
  const brand = { id: "brand", ownerId: "am", status };
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
    propertyText: value => value || "",
    listBrandReplySignals: async () => new Map(),
    attachBrandReplySignals: brands => brands,
    listCheckpoints: async () => [],
    latestFollowUpReminder: () => null,
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

test("Pause and Complete retain Owner-only permission after the merge", async () => {
  for (const status of ["Paused", "Completed"]) {
    for (const viewer of [{ role: "Admin" }, { ownerId: "other-am" }]) {
      const f = fixture(viewer);
      assert.equal((await f.request({ status, note: "Customer decision" })).status, 403);
      assert.equal(f.calls.length, 0);
    }
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

test("Admin resume uses the Round resume action after saving assignment and note", async () => {
  const f = fixture({ role: "Admin", status: "Paused" });
  const response = await f.request({ resumePausedFollowUp: true, status: "In Progress", ownerId: "new-am", note: "Resume approved" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls.map(call => call.action), ["patch", "resume"]);
  assert.equal(f.calls[0].status, "Paused");
  assert.equal(f.calls[0].ownerId, "new-am");
  assert.equal(f.calls[1].expectedVersion, 7);
  assert.equal(f.calls[1].expectedRoundId, "round");
});
