import assert from "node:assert/strict";
import { test } from "node:test";
import { notificationSignal } from "./events.ts";
const base = {
  type: "email.opened",
  body: null,
  dedupe_key: "provider-event-1",
  brand_id: "brand-a",
  title: "Email opened",
  created_at: "2026-10-09T00:00:00Z",
};
test("email provider stable ID survives delivery retries", () => {
  const event = notificationSignal({
    ...base,
    body: JSON.stringify({
      subject: "Hello",
      contactId: "c",
      conversationId: "conversation-1",
      messageId: "provider-message-1",
      occurredAt: base.created_at,
    }),
  });
  assert.equal(event?.id, "email.opened:provider-event-1");
  assert.equal(event?.subject, "Hello");
  assert.equal(event?.contactId, "c");
  assert.equal(event?.conversationId, "conversation-1");
  assert.equal(event?.messageId, "provider-message-1");
});
test("LinkedIn only admits relevant sourced dated changes", () => {
  const linked = { ...base, type: "linkedin.updated" };
  assert.equal(notificationSignal(linked), null);
  assert.equal(
    notificationSignal({
      ...linked,
      body: JSON.stringify({
        relevant: false,
        sourceUrl: "https://www.linkedin.com/",
        publishedAt: base.created_at,
      }),
    }),
    null,
  );
  assert.equal(
    notificationSignal({
      ...linked,
      body: JSON.stringify({
        relevant: true,
        sourceUrl: "https://www.linkedin.com/",
        publishedAt: base.created_at,
      }),
    })?.type,
    "linkedin",
  );
});
test("invalid provider payloads never become real signals", () => {
  for (const body of [
    "null",
    "[]",
    "broken",
    JSON.stringify({ occurredAt: "invalid" }),
  ])
    assert.equal(notificationSignal({ ...base, body }), null);
  assert.equal(notificationSignal({ ...base, brand_id: "" }), null);
  assert.equal(
    notificationSignal({
      ...base,
      type: "linkedin.updated",
      body: JSON.stringify({
        relevant: true,
        sourceUrl: "javascript:alert(1)",
        publishedAt: base.created_at,
      }),
    }),
    null,
  );
});
