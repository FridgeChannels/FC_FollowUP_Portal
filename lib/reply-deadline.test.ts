import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expiredUnansweredReplyDeadline } from "./reply-deadline.ts";

const nowMs = Date.parse("2026-10-15T12:00:00.000Z");
const deadline = "2026-10-14";

describe("expiredUnansweredReplyDeadline", () => {
  it("includes a Ready brand after the deadline when the latest outbound has no reply", () => {
    assert.equal(expiredUnansweredReplyDeadline({
      deadline,
      status: "Ready",
      activities: [{ channel: "Email", direction: "Outbound", recordedAt: "2026-10-15T10:00:00.000Z" }],
      nowMs,
    }), "2026-10-14T23:59:59.999Z");
  });

  it("uses all five channels to detect a reply after the latest outbound", () => {
    for (const channel of ["Email", "SMS", "WhatsApp", "LinkedIn", "Phone"]) {
      assert.equal(expiredUnansweredReplyDeadline({
        deadline,
        status: "In Progress",
        activities: [
          { channel: "Email", direction: "Outbound", recordedAt: "2026-10-13T10:00:00.000Z" },
          { channel, direction: "Inbound", recordedAt: "2026-10-14T10:00:00.000Z" },
        ],
        nowMs,
      }), null, `${channel} inbound should satisfy the deadline`);
    }
  });

  it("uses the latest completed phone outbound and latest reply from the brand summary", () => {
    assert.equal(expiredUnansweredReplyDeadline({
      deadline: "2026-10-13",
      status: "Ready",
      activities: [
        { channel: "Email", direction: "Outbound", recordedAt: "2026-09-23T17:49:00.000Z" },
        { channel: "Phone", direction: "Inbound", recordedAt: "2026-10-02T20:56:00.000Z" },
      ],
      lastSuccessfulOutboundAt: "2026-10-07T13:25:00.000Z",
      lastReplyAt: "2026-10-02T20:56:00.000Z",
      nowMs,
    }), "2026-10-13T23:59:59.999Z");

    assert.equal(expiredUnansweredReplyDeadline({
      deadline: "2026-10-13",
      status: "Ready",
      activities: [],
      lastSuccessfulOutboundAt: "2026-10-07T13:25:00.000Z",
      lastReplyAt: "2026-10-08T13:25:00.000Z",
      nowMs,
    }), null);
  });

  it("does not include future, paused, or completed deadlines", () => {
    const activities = [{ channel: "Email", direction: "Outbound", recordedAt: "2026-10-13T10:00:00.000Z" }];
    assert.equal(expiredUnansweredReplyDeadline({ deadline: "2026-10-16", status: "Ready", activities, nowMs }), null);
    assert.equal(expiredUnansweredReplyDeadline({ deadline, status: "Paused", activities, nowMs }), null);
    assert.equal(expiredUnansweredReplyDeadline({ deadline, status: "Completed", activities, nowMs }), null);
  });
});
