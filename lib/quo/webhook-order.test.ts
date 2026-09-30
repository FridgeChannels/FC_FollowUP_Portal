import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldResolveOpenPhoneTask } from "./webhook-order.ts";

describe("shouldResolveOpenPhoneTask", () => {
  it("does not consult the phone line when the task line already has a task", () => {
    assert.equal(shouldResolveOpenPhoneTask({ hasTask: true }), false);
    assert.equal(shouldResolveOpenPhoneTask({
      hasTask: true,
      existingTaskId: "task-1",
    }), false);
  });

  it("does not consult the phone line when the call is already linked to a task", () => {
    assert.equal(shouldResolveOpenPhoneTask({
      hasTask: false,
      existingTaskId: "task-1",
    }), false);
  });

  it("consults the phone line only after the task line misses", () => {
    assert.equal(shouldResolveOpenPhoneTask({ hasTask: false }), true);
    assert.equal(shouldResolveOpenPhoneTask({
      hasTask: false,
      existingTaskId: null,
    }), true);
  });
});
