import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNeedsReplySignalState,
  isOverdueReplyDueAt,
  normalizeBrandReplyState,
} from "./brand-reply-state.ts";

describe("normalizeBrandReplyState", () => {
  it("defaults unknown values to all", () => {
    assert.equal(normalizeBrandReplyState(undefined), "all");
    assert.equal(normalizeBrandReplyState(""), "all");
    assert.equal(normalizeBrandReplyState("nope"), "all");
  });

  it("accepts each Brands list reply state", () => {
    for (const state of [
      "all",
      "needsReply",
      "overdue",
      "replied",
      "never",
      "qualification",
    ]) {
      assert.equal(normalizeBrandReplyState(state), state);
    }
  });
});

describe("isNeedsReplySignalState", () => {
  it("uses ConversationDB Needs Reply index for needsReply and overdue", () => {
    assert.equal(isNeedsReplySignalState("needsReply"), true);
    assert.equal(isNeedsReplySignalState("overdue"), true);
    assert.equal(isNeedsReplySignalState("replied"), false);
  });
});

describe("isOverdueReplyDueAt", () => {
  it("treats missing due dates as not overdue", () => {
    assert.equal(isOverdueReplyDueAt(null, Date.now()), false);
    assert.equal(isOverdueReplyDueAt("", Date.now()), false);
  });

  it("compares due timestamps against now", () => {
    const now = Date.parse("2026-09-28T12:00:00.000Z");
    assert.equal(isOverdueReplyDueAt("2026-09-28T11:59:59.000Z", now), true);
    assert.equal(isOverdueReplyDueAt("2026-09-28T12:00:00.000Z", now), false);
    assert.equal(isOverdueReplyDueAt("2026-09-28T12:00:01.000Z", now), false);
  });
});
