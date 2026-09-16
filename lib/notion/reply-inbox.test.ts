import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tasksNeedingReplyInboxSync } from "./reply-inbox.ts";
import type { BrandTask } from "../brand-list.ts";

function task(partial: Partial<BrandTask> & Pick<BrandTask, "id">): BrandTask {
  return {
    title: "t",
    status: "Pending",
    channel: "Email",
    contactId: "c1",
    ...partial,
  } as BrandTask;
}

describe("tasksNeedingReplyInboxSync", () => {
  it("keeps open non-Phone tasks only", () => {
    const items = [
      task({ id: "1", channel: "Email", status: "Pending" }),
      task({ id: "2", channel: "Phone", status: "Pending" }),
      task({ id: "3", channel: "LinkedIn", status: "In Progress" }),
      task({ id: "4", channel: "Email", status: "Completed" }),
      task({ id: "5", channel: "WhatsApp", status: "Cancelled" }),
    ];
    assert.deepEqual(
      tasksNeedingReplyInboxSync(items).map((item) => item.id),
      ["1", "3"],
    );
  });
});
