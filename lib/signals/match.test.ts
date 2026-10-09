import assert from "node:assert/strict";
import { test } from "node:test";
import { emailSignalMatchesInteraction } from "./match.ts";
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
