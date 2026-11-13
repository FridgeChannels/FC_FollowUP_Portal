import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AFTER_EMAIL_MIN_OFFSET_MINUTES,
  normalizeAfterEmailOffsetMinutes,
  scheduledAtAfterEmail,
} from "./after-email-followup.ts";

describe("after-email-followup", () => {
  it("enforces a 15 minute minimum offset", () => {
    assert.equal(normalizeAfterEmailOffsetMinutes(1), AFTER_EMAIL_MIN_OFFSET_MINUTES);
    assert.equal(normalizeAfterEmailOffsetMinutes(15), 15);
    assert.equal(normalizeAfterEmailOffsetMinutes(45), 45);
  });

  it("adds offset minutes to the email scheduled instant", () => {
    assert.equal(scheduledAtAfterEmail("2026-11-13T15:00:00.000Z", 15), "2026-11-13T15:15:00.000Z");
  });
});
