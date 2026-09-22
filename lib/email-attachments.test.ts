import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentsFromProperty,
  channelSupportsEmailAttachments,
  encodeAttachmentsProperty,
  sanitizeEmailAttachments,
  validateEmailAttachmentFile,
} from "./email-attachments.ts";

describe("email attachments", () => {
  it("only enables attachments on Email", () => {
    assert.equal(channelSupportsEmailAttachments("Email"), true);
    assert.equal(channelSupportsEmailAttachments("WhatsApp"), false);
  });

  it("validates default mime types and size", () => {
    assert.equal(
      validateEmailAttachmentFile({ type: "application/pdf", size: 1200, name: "a.pdf" }),
      null,
    );
    assert.equal(
      validateEmailAttachmentFile({ type: "image/png", size: 1200, name: "a.png" }),
      null,
    );
    assert.match(
      validateEmailAttachmentFile({ type: "application/zip", size: 1200, name: "a.zip" }) || "",
      /Unsupported/,
    );
    assert.match(
      validateEmailAttachmentFile({
        type: "application/pdf",
        size: 11 * 1024 * 1024,
        name: "big.pdf",
      }) || "",
      /MB/,
    );
  });

  it("sanitizes and encodes Attachments property JSON", () => {
    const kept = sanitizeEmailAttachments([
      {
        id: "abc",
        kind: "file",
        name: "catalog.pdf",
        mimeType: "application/pdf",
        size: 12,
        url: "https://bucket.s3.us-east-1.amazonaws.com/files/abc.pdf",
      },
      {
        id: "img",
        kind: "image",
        name: "shot.png",
        mimeType: "image/png",
        size: 9,
        url: "https://bucket.s3.us-east-1.amazonaws.com/images/img.png",
      },
      { kind: "file" },
      {
        id: "bad",
        kind: "file",
        name: "x.zip",
        mimeType: "application/zip",
        size: 9,
        url: "https://bucket.s3.us-east-1.amazonaws.com/files/bad.zip",
      },
    ]);
    assert.equal(kept.length, 2);
    const encoded = encodeAttachmentsProperty(kept);
    assert.ok(encoded);
    const roundTrip = attachmentsFromProperty(encoded);
    assert.equal(roundTrip.length, 2);
    assert.equal(roundTrip[0]?.id, "abc");
    assert.equal(roundTrip[1]?.kind, "image");
  });

  it("reads historical attachments even if mime is no longer allowed", () => {
    const encoded = JSON.stringify([
      {
        id: "legacy",
        kind: "file",
        name: "old.doc",
        mimeType: "application/msword",
        size: 10,
        url: "https://bucket.s3.us-east-1.amazonaws.com/files/legacy.doc",
      },
    ]);
    const parsed = attachmentsFromProperty(encoded);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.name, "old.doc");
  });
});
