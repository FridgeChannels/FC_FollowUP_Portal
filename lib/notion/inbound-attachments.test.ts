import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InboundReplyError } from "./inbound-errors.ts";
import {
  resolveInboundContent,
  resolveInboundEmailAttachments,
} from "./inbound-attachments.ts";
import { isAllowedS3MediaUrl } from "../s3-media.ts";

const sampleAttachment = {
  id: "abc123",
  kind: "file" as const,
  name: "quote.pdf",
  mimeType: "application/pdf",
  size: 1200,
  url: "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/files/abc123.pdf",
};

describe("resolveInboundEmailAttachments", () => {
  it("returns empty for omitted or empty arrays", () => {
    assert.deepEqual(resolveInboundEmailAttachments("Email", undefined), []);
    assert.deepEqual(resolveInboundEmailAttachments("Email", []), []);
  });

  it("rejects attachments on non-Email channels", () => {
    assert.throws(
      () => resolveInboundEmailAttachments("SMS", [sampleAttachment]),
      (error: unknown) =>
        error instanceof InboundReplyError
        && error.status === 400
        && /only supported on Email/.test(error.message),
    );
  });

  it("rejects invalid items and non-S3 urls", () => {
    assert.throws(
      () => resolveInboundEmailAttachments("Email", [{ ...sampleAttachment, mimeType: "application/zip" }]),
      (error: unknown) => error instanceof InboundReplyError && error.status === 400,
    );

    const previous = {
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_DEFAULT_REGION,
    };
    process.env.S3_BUCKET = "amzn-s3-fc-bucket";
    process.env.AWS_DEFAULT_REGION = "sa-east-1";
    try {
      assert.equal(isAllowedS3MediaUrl(sampleAttachment.url), true);
      assert.throws(
        () =>
          resolveInboundEmailAttachments("Email", [
            { ...sampleAttachment, url: "https://evil.example/files/abc.pdf" },
          ]),
        (error: unknown) =>
          error instanceof InboundReplyError && /S3 object URL/.test(error.message),
      );
      const kept = resolveInboundEmailAttachments("Email", [sampleAttachment]);
      assert.equal(kept.length, 1);
      assert.equal(kept[0]?.id, "abc123");
    } finally {
      if (previous.bucket == null) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = previous.bucket;
      if (previous.region == null) delete process.env.AWS_DEFAULT_REGION;
      else process.env.AWS_DEFAULT_REGION = previous.region;
    }
  });
});

describe("resolveInboundContent", () => {
  it("allows Email content empty when attachments exist", () => {
    assert.equal(
      resolveInboundContent("Email", "  ", [sampleAttachment]),
      "quote.pdf",
    );
  });

  it("still requires content without attachments", () => {
    assert.throws(
      () => resolveInboundContent("Email", "", []),
      (error: unknown) =>
        error instanceof InboundReplyError && /content is required/.test(error.message),
    );
  });
});
