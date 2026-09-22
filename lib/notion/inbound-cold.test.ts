import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundReplyError } from "./inbound-errors.ts";
import { normalizeInboundColdInput } from "./inbound-cold-input.ts";

describe("normalizeInboundColdInput", () => {
  it("accepts FollowUpClientId + sender for Email", () => {
    const normalized = normalizeInboundColdInput({
      channel: "Email",
      object: "Magnet inquiry",
      content: "We saw your Magnet offer…",
      FollowUpClientId: "brand-1",
      sender: "buyer@acme.com",
    });
    assert.equal(normalized.channel, "Email");
    assert.equal(normalized.object, "Magnet inquiry");
    assert.equal(normalized.brandId, "brand-1");
    assert.equal(normalized.sender, "buyer@acme.com");
  });

  it("accepts brandId as alias for FollowUpClientId", () => {
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

  it("allows Email with sender only (no FollowUpClientId)", () => {
    const normalized = normalizeInboundColdInput({
      channel: "Email",
      object: "Magnet inquiry",
      content: "Hello",
      sender: "buyer@acme.com",
    });
    assert.equal(normalized.brandId, "");
    assert.equal(normalized.sender, "buyer@acme.com");
  });

  it("requires object for Email", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "Email",
          content: "Hello",
          sender: "buyer@acme.com",
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
          brandId: "brand-1",
          sender: "+14155550182",
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
          sender: "buyer@acme.com",
          taskId: "task-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError
        && error.status === 400
        && /\/api\/replies/.test(error.message),
    );
  });

  it("rejects contactId", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "Email",
          object: "Subject",
          content: "Body",
          contactId: "contact-1",
          sender: "buyer@acme.com",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 400 && /contactId/.test(error.message),
    );
  });

  it("allows Phone without content when brand + sender present", () => {
    const normalized = normalizeInboundColdInput({
      channel: "Phone",
      FollowUpClientId: "brand-1",
      sender: "+14155550182",
    });
    assert.equal(normalized.content, "Inbound call");
  });

  it("requires FollowUpClientId for non-Email", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "LinkedIn",
          content: "Hello",
          sender: "linkedin.com/in/someone",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 422 && /FollowUpClientId/.test(error.message),
    );
  });

  it("requires sender", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "Email",
          object: "Subject",
          content: "Body",
          FollowUpClientId: "brand-1",
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && error.status === 422 && /sender/.test(error.message),
    );
  });

  it("allows Email with attachments and empty content", () => {
    const previous = {
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_DEFAULT_REGION,
    };
    process.env.S3_BUCKET = "amzn-s3-fc-bucket";
    process.env.AWS_DEFAULT_REGION = "sa-east-1";
    try {
      const normalized = normalizeInboundColdInput({
        channel: "Email",
        object: "Magnet inquiry",
        content: "",
        sender: "buyer@acme.com",
        attachments: [{
          id: "abc123",
          kind: "file",
          name: "quote.pdf",
          mimeType: "application/pdf",
          size: 1200,
          url: "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/files/abc123.pdf",
        }],
      });
      assert.equal(normalized.attachments.length, 1);
      assert.equal(normalized.content, "quote.pdf");
    } finally {
      if (previous.bucket == null) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = previous.bucket;
      if (previous.region == null) delete process.env.AWS_DEFAULT_REGION;
      else process.env.AWS_DEFAULT_REGION = previous.region;
    }
  });

  it("rejects attachments on non-Email cold inbound", () => {
    assert.throws(
      () =>
        normalizeInboundColdInput({
          channel: "SMS",
          content: "Hi",
          brandId: "brand-1",
          sender: "+14155550182",
          attachments: [{
            id: "abc123",
            kind: "file",
            name: "quote.pdf",
            mimeType: "application/pdf",
            size: 1200,
            url: "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/files/abc123.pdf",
          }],
        }),
      (error: unknown) =>
        error instanceof InboundReplyError && /only supported on Email/.test(error.message),
    );
  });
});
