import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrandTask } from "../brand-list.ts";
import {
  compareOpenTaskOrder,
  mergeOpenTaskStubs,
} from "./open-task-order.ts";

function stub(
  partial: Pick<BrandTask, "id" | "scheduledAt"> & Partial<BrandTask>,
): BrandTask {
  return {
    title: partial.id,
    contactId: null,
    contactName: null,
    brandId: null,
    brandName: null,
    brandOwnerId: null,
    ownerId: null,
    ownerName: null,
    channel: "Phone",
    status: "Pending",
    priority: null,
    creationMethod: null,
    endedAt: null,
    notes: null,
    conversationIds: [],
    templateId: null,
    sourceBombId: null,
    ...partial,
  };
}

describe("mergeOpenTaskStubs", () => {
  it("merges phone and reply stubs by Scheduled At then id", () => {
    const phone = [
      stub({ id: "p2", scheduledAt: "2026-09-02", channel: "Phone" }),
      stub({ id: "p1", scheduledAt: "2026-09-01", channel: "Phone" }),
    ];
    const replies = [
      stub({
        id: "r1",
        scheduledAt: "2026-09-01T12:00:00.000Z",
        channel: "Email",
        inboxStatus: "Needs Reply",
      }),
      stub({
        id: "r0",
        scheduledAt: "2026-08-31",
        channel: "LinkedIn",
        inboxStatus: "Needs Reply",
      }),
    ];

    assert.deepEqual(
      mergeOpenTaskStubs(phone, replies).map((item) => item.id),
      ["r0", "p1", "r1", "p2"],
    );
  });

  it("compareOpenTaskOrder is stable on equal dates", () => {
    assert.ok(
      compareOpenTaskOrder(
        stub({ id: "a", scheduledAt: "2026-09-01" }),
        stub({ id: "b", scheduledAt: "2026-09-01" }),
      ) < 0,
    );
  });
});
