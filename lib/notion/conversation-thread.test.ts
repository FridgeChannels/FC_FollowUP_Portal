import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseConversationThreadId,
  pickContactChannelThreadId,
} from "./conversation-thread.ts";

describe("contact + channel thread identity", () => {
  it("reuses the latest interaction Thread ID on the same channel", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Email", threadId: "THR-old-Email", createdAt: "2026-09-01T08:00:00.000Z" },
        { channel: "Email", threadId: "THR-new-Email", createdAt: "2026-09-14T12:00:00.000Z" },
        { channel: "LinkedIn", threadId: "THR-li-LinkedIn", createdAt: "2026-09-01T07:00:00.000Z" },
      ],
      "Email",
    );
    assert.equal(threadId, "THR-new-Email");
  });

  it("uses recordedAt when newer than createdAt peers", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Email", threadId: "THR-created", createdAt: "2026-09-14T12:00:00.000Z" },
        {
          channel: "Email",
          threadId: "THR-recorded",
          createdAt: "2026-09-01T08:00:00.000Z",
          recordedAt: "2026-09-15T09:00:00.000Z",
        },
      ],
      "Email",
    );
    assert.equal(threadId, "THR-recorded");
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

  it("prefers a system THR- id when timestamps tie", () => {
    const threadId = pickContactChannelThreadId(
      [
        { channel: "Phone", threadId: "QUO_CALL:AC1", createdAt: "2026-09-10T08:00:00.000Z" },
        { channel: "Phone", threadId: "THR-phone-Phone", createdAt: "2026-09-10T08:00:00.000Z" },
      ],
      "Phone",
    );
    assert.equal(threadId, "THR-phone-Phone");
  });
});

describe("chooseConversationThreadId", () => {
  const existing = [
    { channel: "Email", threadId: "THR-old-Email", createdAt: "2026-09-01T08:00:00.000Z" },
    { channel: "Email", threadId: "THR-latest-Email", createdAt: "2026-09-14T12:00:00.000Z" },
  ];
  const allocate = (channel: string) => `THR-fresh-${channel}`;

  it("forceNew allocates a fresh Thread", () => {
    assert.equal(
      chooseConversationThreadId({
        channel: "Email",
        existing,
        forceNew: true,
        allocate,
      }),
      "THR-fresh-Email",
    );
  });

  it("preferred Thread wins over contact+channel reuse", () => {
    assert.equal(
      chooseConversationThreadId({
        channel: "Email",
        preferredThreadId: "THR-run-cp2-Email",
        existing,
        allocate,
      }),
      "THR-run-cp2-Email",
    );
  });

  it("falls back to latest channel Thread when neither forceNew nor preferred", () => {
    assert.equal(
      chooseConversationThreadId({
        channel: "Email",
        existing,
        allocate,
      }),
      "THR-latest-Email",
    );
  });
});
