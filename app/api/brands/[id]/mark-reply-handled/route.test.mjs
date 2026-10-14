import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the real route with in-memory Notion writes, without touching customer data.
const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function routeFixture() {
  const writes = [];
  const threadWrites = [];
  const mocks = {
    viewerFromRequest: async () => ({ email: "am@example.com" }),
    canWriteBrand: () => true,
    mapFollowupClientPage: async () => ({ ownerId: "am" }),
    retrievePage: async () => ({ properties: { Notes: "Existing note", "Follow-up Contacts": ["contact"] } }),
    relationIds: value => value || [],
    propertyText: value => value || "",
    richText: value => value,
    firstRelationId: value => value?.[0],
    listConversationsByIds: async () => [{
      id: "selected", brandId: "brand", contactId: "contact", channel: "Email",
      direction: "Inbound", replyStatus: "Needs Reply", threadId: "shared-thread",
    }],
    listFollowupConversations: async () => [{ id: "other-pending", replyStatus: "Needs Reply" }],
    markInboundsReplied: async (...args) => { threadWrites.push(args); },
    updatePage: async (...args) => { writes.push(args); },
    invalidateBrandReplySignalCache: () => {},
    encodeReplyActionReminder: value => JSON.stringify(value),
  };
  const exports = {};
  runInNewContext(compiled, { exports, require: () => mocks, Response });
  const request = body => exports.POST(
    new Request("http://localhost/api/brands/brand/mark-reply-handled", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "brand" }) },
  );
  return { request, writes, threadWrites };
}

test("reviewing one message preserves other pending replies in the same thread", async () => {
  const { request, writes, threadWrites } = routeFixture();
  const response = await request({ conversationId: "selected", note: "Automatic reply; no response required" });
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "selected");
  assert.equal(writes[0][1]["Reply Status"].select.name, "Replied");
  assert.match(writes[0][1].Notes.rich_text, /^Existing note\nReply review completed:/);
  assert.equal(threadWrites.length, 0);
});

test("completing review requires a note before changing any reply", async () => {
  const { request, writes, threadWrites } = routeFixture();
  const response = await request({ conversationId: "selected", note: " " });
  assert.equal(response.status, 400);
  assert.equal(writes.length, 0);
  assert.equal(threadWrites.length, 0);
});

test("message review still saves its optional AM reminder", async () => {
  const { request, writes, threadWrites } = routeFixture();
  const dueAt = "2026-10-15T12:00:00Z";
  const response = await request({ conversationId: "selected", note: "Follow up tomorrow", reminderAt: dueAt });
  assert.equal(response.status, 200);
  assert.match(writes[0][1].Notes.rich_text, /"activityId":"selected"/);
  assert.match(writes[0][1].Notes.rich_text, /"ownerId":"am"/);
  assert.ok(writes[0][1].Notes.rich_text.includes(dueAt));
  assert.equal(threadWrites.length, 0);
});
