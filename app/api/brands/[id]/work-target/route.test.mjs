import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(url) {
  return ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const route = compile(new URL("./route.ts", import.meta.url));
const matching = {};
runInNewContext(compile(new URL("../../../../../lib/signals/match.ts", import.meta.url)), { exports: matching, atob, TextDecoder });
const email = { id: "mail-1", brandId: "brand-1", contactId: "contact-1", channel: "Email", direction: "Outbound", messageId: "MSG-exact", taskId: "task-exact" };

function fixture({ activities = [email], trackingActivities = [], contacts = ["contact-1"], role = "Admin", emailAddress = "admin@example.com", canWrite = true } = {}) {
  const calls = [];
  const mocks = {
    ...matching,
    viewerFromRequest: async () => ({ email: emailAddress, role }),
    canWriteBrand: () => canWrite,
    retrievePage: async () => ({ id: "brand-1", properties: {} }),
    mapFollowupClientPage: async () => ({ id: "brand-1" }),
    relationIds: () => [],
    listFollowupContactIds: async () => contacts,
    findConversationsByMessageId: async id => { calls.push(["message", id]); return activities; },
    findEmailTrackingCandidates: async id => { calls.push(["tracking", id]); return trackingActivities; },
    listConversationsByIds: async ids => { calls.push(["conversation", ...ids]); return activities; },
    retrieveFollowupTask: async () => { throw new Error("Must not substitute another task"); },
  };
  const exports = {};
  runInNewContext(route, { exports, require: () => mocks, Response, URL });
  return {
    calls,
    get: query => exports.GET(new Request(`http://localhost/api/brands/brand-1/work-target?${query}`), { params: Promise.resolve({ id: "brand-1" }) }),
  };
}

test("loads the exact opened email and associated task even outside the loaded activity page", async () => {
  const f = fixture({ activities: [{ ...email, id: "other-mail", messageId: "MSG-other", taskId: "other-task" }, email] });
  const response = await f.get("emailMessageId=MSG-exact");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.activity.id, "mail-1");
  assert.equal(payload.activity.taskId, "task-exact");
  assert.deepEqual(f.calls, [["message", "MSG-exact"]]);
});

test("resolves the original tracking ID after the sender stores Gmail's Message ID", async () => {
  const token = Buffer.from(JSON.stringify({ b: "brand-1", m: "MSG-exact" })).toString("base64url");
  const activity = { ...email, messageId: "gmail-id", content: `<img src="https://portal.example/api/track/open/eo1.${token}.${"0".repeat(32)}" />` };
  const f = fixture({ activities: [], trackingActivities: [activity] });
  const response = await f.get("emailMessageId=MSG-exact");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activity.id, email.id);
  assert.deepEqual(f.calls, [["message", "MSG-exact"], ["tracking", "brand-1"]]);
  assert.equal((await fixture({ activities: [], trackingActivities: [{ ...activity, brandId: "other-brand" }] }).get("emailMessageId=MSG-exact")).status, 404);
});

test("opens by exact conversation ID when the signal has that identifier", async () => {
  const f = fixture();
  const response = await f.get("emailConversationId=mail-1&emailMessageId=MSG-exact");
  assert.equal(response.status, 200);
  assert.deepEqual(f.calls, [["conversation", "mail-1"]]);
});

test("never opens another brand's email or an inbound reply", async () => {
  for (const activity of [{ ...email, brandId: "another-brand" }, { ...email, direction: "Inbound" }]) {
    assert.equal((await fixture({ activities: [activity] }).get("emailMessageId=MSG-exact")).status, 404);
  }
});

test("legacy records without a brand relation require a contact belonging to this brand", async () => {
  const activities = [{ ...email, brandId: null }];
  assert.equal((await fixture({ activities }).get("emailMessageId=MSG-exact")).status, 200);
  assert.equal((await fixture({ activities, contacts: ["other-contact"] }).get("emailMessageId=MSG-exact")).status, 404);
});

test("missing or ambiguous identities fail instead of opening a different email", async () => {
  assert.equal((await fixture({ activities: [] }).get("emailMessageId=MSG-exact")).status, 404);
  assert.equal((await fixture({ activities: [email, { ...email, id: "duplicate-message" }] }).get("emailMessageId=MSG-exact")).status, 409);
  assert.equal((await fixture().get("emailConversationId=mail-1&emailMessageId=wrong-message")).status, 404);
});

test("requires a signed-in authorized manager before looking up any email", async () => {
  for (const [options, expected] of [[{ emailAddress: null }, 401], [{ role: "Caller" }, 403], [{ canWrite: false }, 403]]) {
    const f = fixture(options);
    assert.equal((await f.get("emailMessageId=MSG-exact")).status, expected);
    assert.equal(f.calls.length, 0);
  }
});
