import assert from "node:assert/strict";
import { test } from "node:test";
import { inboundEmailRecipient } from "./email-recipient.ts";
import type { Interaction } from "./outreach-domain.ts";

const reply: Interaction = {
  id: "reply", customerId: "brand", type: "Message", channel: "Email",
  direction: "Inbound", title: "Re: Hello", content: "Thanks",
  createdAt: "2026-09-29T13:16:00Z", taskId: "parent-task", threadId: "thread",
  sender: "gabe@archwaypet.com",
};
const sent: Interaction = {
  ...reply, id: "sent", direction: "Outbound", sender: "beril@fridgechannels.com",
  createdAt: "2026-09-29T13:15:00Z",
};

test("uses the original sending mailbox rather than the contact or another email in the thread", () => {
  const earlier = { ...sent, id: "earlier", taskId: "another-task", sender: "other@example.com" };
  const later = { ...sent, id: "later", sender: "later@example.com", createdAt: "2026-09-30T13:15:00Z" };
  assert.equal(inboundEmailRecipient(reply, [earlier, later, sent]), "beril@fridgechannels.com");
});

test("prefers an explicit recipient when available", () => {
  assert.equal(inboundEmailRecipient({ ...reply, recipient: " shared@example.com " }, [sent]), "shared@example.com");
});

test("resolves legacy messages by thread only when the task is missing", () => {
  assert.equal(inboundEmailRecipient({ ...reply, taskId: undefined }, [sent]), "beril@fridgechannels.com");
  assert.equal(inboundEmailRecipient(reply, [{ ...sent, taskId: "another-task" }]), undefined);
});

test("never substitutes the inbound sender, another brand, or another channel", () => {
  assert.equal(inboundEmailRecipient(reply, [reply, { ...sent, customerId: "other-brand" }, { ...sent, channel: "SMS" }]), undefined);
  assert.equal(inboundEmailRecipient(reply, [{ ...sent, sender: undefined }]), undefined);
});
