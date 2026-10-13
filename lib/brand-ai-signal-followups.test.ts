import assert from "node:assert/strict";
import test from "node:test";
import { signalFollowUps } from "./brand-ai-signal-followups.ts";
import type { BrandActivity } from "./brand-list.ts";
import type { SignalEvent } from "./signals/model.ts";

function signal(overrides: Partial<SignalEvent> = {}): SignalEvent {
  return {
    id: "signal-1", brandId: "brand-1", type: "sample", summary: "Sample visited",
    occurredAt: "2026-10-10T10:00:00.000Z", detectedAt: "2026-10-10T10:00:00.000Z",
    highPriority: false, isNewSignal: true, ...overrides,
  };
}

function activity(overrides: Partial<BrandActivity> = {}): BrandActivity {
  return {
    id: "action-1", contactId: null, taskId: null, channel: "Email", direction: "Outbound",
    status: "Sent", subject: null, content: "Follow-up", sender: "AM", notes: null,
    callResult: null, sourceUrl: null, threadId: null, messageId: null, replyStatus: null,
    cpId: null, cpAtInteraction: null, createdAt: "2026-10-10T11:00:00.000Z", ...overrides,
  };
}

test("uses the first recorded outbound action after a signal", () => {
  const result = signalFollowUps({
    signals: [signal()],
    outboundActivities: [
      activity({ id: "before", createdAt: "2026-10-10T09:00:00.000Z" }),
      activity({ id: "first", createdAt: "2026-10-10T11:00:00.000Z" }),
      activity({ id: "later", createdAt: "2026-10-11T11:00:00.000Z" }),
    ],
  });
  assert.equal(result[0].action?.id, "first");
});

test("does not associate a different contact or a late action", () => {
  const result = signalFollowUps({
    signals: [signal({ contactId: "contact-1" })],
    outboundActivities: [
      activity({ contactId: "contact-2" }),
      activity({ id: "late", contactId: "contact-1", createdAt: "2026-10-18T11:00:00.000Z" }),
    ],
  });
  assert.equal(result[0].action, null);
});
