import assert from "node:assert/strict";
import { test } from "node:test";
import { emailSignalMatchesInteraction, matchesEmailSignalReference } from "./match.ts";
import type { SignalEvent } from "./model.ts";
import type { Interaction } from "../outreach-domain.ts";

const interaction: Interaction = {
  id: "12345678-1234-1234-1234-123456789abc",
  customerId: "brand-a", type: "Message", channel: "Email", direction: "Outbound",
  title: "Proposal", content: "Hello", createdAt: "2026-10-09T00:00:00Z",
  messageId: "provider-message-1",
};
const event: SignalEvent = {
  id: "email:1", brandId: "brand-a", type: "email", summary: "Open detected",
  occurredAt: interaction.createdAt, detectedAt: interaction.createdAt, highPriority: false,
};

test("email opens attach only through the exact outbound email identity", () => {
  assert.equal(emailSignalMatchesInteraction({...event, conversationId: "12345678123412341234123456789abc"}, interaction), true);
  assert.equal(emailSignalMatchesInteraction({...event, messageId: "provider-message-1"}, interaction), true);
  assert.equal(emailSignalMatchesInteraction({...event, subject: "Proposal"}, interaction), false);
  assert.equal(emailSignalMatchesInteraction({...event, messageId: "another-message"}, interaction), false);
  assert.equal(emailSignalMatchesInteraction({...event, brandId: "another-brand", messageId: "provider-message-1"}, interaction), false);
  assert.equal(emailSignalMatchesInteraction({...event, messageId: "provider-message-1"}, {...interaction, direction: "Inbound"}), false);
});

test("same subject or thread never redirects a notification to a different email", () => {
  assert.equal(emailSignalMatchesInteraction({ ...event, threadId: "thread", subject: "Proposal", messageId: "other-email" }, { ...interaction, threadId: "thread" }), false);
  assert.equal(matchesEmailSignalReference({ conversationId: interaction.id, messageId: "other-email" }, interaction), false);
});

test("Notion brand and conversation IDs accept canonical hyphen variants", () => {
  assert.equal(emailSignalMatchesInteraction({ ...event, brandId: "AA-BB", conversationId: interaction.id.replaceAll("-", "") }, { ...interaction, customerId: "aabb" }), true);
});

test("original tracking identity survives the sender replacing Message ID with Gmail ID", () => {
  const body = Buffer.from(JSON.stringify({ b: "brand-a", m: "portal-id", s: "Proposal" })).toString("base64url");
  const content = `<p>Hello</p><img src="https://portal.example/api/track/open/eo1.${body}.${"0".repeat(32)}" width="1" height="1" />`;
  const delivered = { ...interaction, messageId: "gmail-id", content };
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "portal-id" }, delivered), true);
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "other-id" }, delivered), false);
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "portal-id" }, { ...delivered, direction: "Inbound" }), false);
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "portal-id" }, { ...delivered, content: content.replace('"brand-a"', '"other"').replace('<img', '<span') }), false);
  const wrongBrand = Buffer.from(JSON.stringify({ b: "other-brand", m: "portal-id" })).toString("base64url");
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "portal-id" }, { ...delivered, content: content.replace(body, wrongBrand) }), false);
  const later = Buffer.from(JSON.stringify({ b: "brand-a", m: "later-email" })).toString("base64url");
  const quoted = `${content}<img src="https://portal.example/api/track/open/eo1.${later}.${"0".repeat(32)}" />`;
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "portal-id" }, { ...delivered, content: quoted }), false);
  assert.equal(emailSignalMatchesInteraction({ ...event, messageId: "later-email" }, { ...delivered, content: quoted }), true);
});
