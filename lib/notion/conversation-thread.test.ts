import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickContactChannelThreadId } from "./conversation-thread.ts";

describe("contact + channel thread identity", () => {
  it("reuses the oldest system Thread ID on the same channel", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Email", threadId: "THR-new-Email", createdAt: "2026-09-14T12:00:00.000Z" },
        { channel: "Email", threadId: "THR-old-Email", createdAt: "2026-09-01T08:00:00.000Z" },
        { channel: "LinkedIn", threadId: "THR-li-LinkedIn", createdAt: "2026-09-01T07:00:00.000Z" },
      ],
      "Email",
    );
    assert.equal(threadId, "THR-old-Email");
  });

  it("ignores other channels and blank Thread IDs", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Email", threadId: "   ", createdAt: "2026-09-01T08:00:00.000Z" },
        { channel: "SMS", threadId: "THR-sms-SMS", createdAt: "2026-09-01T08:00:00.000Z" },
      ],
      "Email",
    );
    assert.equal(threadId, null);
  });

  it("prefers a system THR- id over a vendor-shaped fallback", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Phone", threadId: "QUO_CALL:AC1", createdAt: "2026-09-01T08:00:00.000Z" },
        { channel: "Phone", threadId: "THR-phone-Phone", createdAt: "2026-09-10T08:00:00.000Z" },
      ],
      "Phone",
    );
    assert.equal(threadId, "THR-phone-Phone");
  });
});
