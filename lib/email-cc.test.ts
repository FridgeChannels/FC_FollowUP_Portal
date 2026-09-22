import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EmailCcError, normalizeEmailCc } from "./email-cc.ts";

describe("normalizeEmailCc", () => {
  it("returns null for empty input", () => {
    assert.equal(normalizeEmailCc(null), null);
    assert.equal(normalizeEmailCc(undefined), null);
    assert.equal(normalizeEmailCc(""), null);
    assert.equal(normalizeEmailCc("  ,  , "), null);
  });

  it("normalizes comma-separated emails", () => {
    assert.equal(
      normalizeEmailCc(" Amy@Acme.com , bob@acme.com "),
      "amy@acme.com,bob@acme.com",
    );
  });

  it("deduplicates case-insensitively", () => {
    assert.equal(
      normalizeEmailCc("a@x.com,A@x.com, b@y.com"),
      "a@x.com,b@y.com",
    );
  });

  it("rejects invalid addresses", () => {
    assert.throws(() => normalizeEmailCc("not-an-email"), EmailCcError);
    assert.throws(() => normalizeEmailCc("ok@x.com, bad"), EmailCcError);
  });
});
