import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizePendingOutboundTasks } from "./brand-list.ts";

describe("summarizePendingOutboundTasks", () => {
  it("lists unique queued non-phone channels and the earliest queue time", () => {
    assert.deepEqual(summarizePendingOutboundTasks([
      { channel: "Email", status: "Pending", createdAt: "2026-10-10T09:00:00Z" },
      { channel: "SMS", status: "Pending", createdAt: "2026-10-10T08:00:00Z" },
      { channel: "Email", status: "Pending", createdAt: "2026-10-11T09:00:00Z" },
      { channel: "Phone", status: "Pending", createdAt: "2026-10-10T07:00:00Z" },
      { channel: "WhatsApp", status: "Completed", createdAt: "2026-10-10T06:00:00Z" },
    ]), {
      channels: ["Email", "SMS"],
      nextAt: "2026-10-10T08:00:00Z",
    });
  });

  it("returns no pending channels when all tasks have executed", () => {
    assert.deepEqual(summarizePendingOutboundTasks([
      { channel: "Email", status: "Completed" },
      { channel: "Phone", status: "Pending" },
    ]), { channels: [], nextAt: null });
  });
});
