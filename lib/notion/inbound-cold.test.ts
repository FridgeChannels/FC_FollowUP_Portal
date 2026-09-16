import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundReplyError } from "./inbound-errors.ts";
import { normalizeInboundColdInput } from "./inbound-cold-input.ts";

describe("normalizeInboundColdInput", () => {
  it("accepts contactId path for Email with object", () => {
    const normalized = normalizeInboundColdInput({
      channel: "Email",
      object: "Magnet inquiry",
      content: "We saw your Magnet offer…",
      contactId: "contact-1",
    });
    assert.equal(normalized.channel, "Email");
    assert.equal(normalized.object, "Magnet inquiry");
    assert.equal(normalized.contactId, "contact-1");
  });

  it("accepts brandId + sender path", () => {
    const normalized = normalizeInboundColdInput({
      channel: "SMS",
      content: "Got the sample.",
      brandId: "brand-1",
      sender: "+14155550182",
    });
    assert.equal(normalized.brandId, "brand-1");
    assert.equal(normalized.sender, "+14155550182");
    assert.equal(normalized.object, "");
  });

  it("requires object for Email", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "Email",
          content: "Hello",
          contactId: "contact-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 400 && /object/.test(error.message),
    );
  });

  it("rejects object on non-Email channels", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "SMS",
          object: "should not appear",
          content: "Hi",
          contactId: "contact-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 400 && /only valid for Email/.test(error.message),
    );
  });

  it("rejects taskId and points callers to /api/replies", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "Email",
          object: "Subject",
          content: "Body",
          contactId: "contact-1",
          taskId: "task-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError
        && error.status === 400
        && /\/api\/replies/.test(error.message),
    );
  });

  it("allows Phone without content", () => {
    const normalized = normalizeInboundColdInput({
      channel: "Phone",
      contactId: "contact-1",
    });
    assert.equal(normalized.content, "Inbound call");
  });

  it("requires contactId or brandId+sender", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "LinkedIn",
          content: "Hello",
          brandId: "brand-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 422,
    );
  });
});
