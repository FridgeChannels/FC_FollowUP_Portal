import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentsFromExtendedParameters,
  captionForAttachments,
  channelSupportsMedia,
  mediaFieldsFromAttachments,
  sanitizeMediaAttachments,
  validateMediaFile,
} from "./media-attachments.ts";
import { isAllowedS3MediaUrl, publicS3ObjectUrl } from "./s3-media.ts";

describe("media attachments", () => {
  it("only enables media on WhatsApp", () => {
    assert.equal(channelSupportsMedia("WhatsApp"), true);
    assert.equal(channelSupportsMedia("SMS"), false);
    assert.equal(channelSupportsMedia("Email"), false);
  });

  it("rejects oversized or unsupported files", () => {
    assert.equal(validateMediaFile({ type: "image/png", size: 1200, name: "a.png" }, "image"), null);
    assert.match(validateMediaFile({ type: "image/png", size: 6 * 1024 * 1024, name: "a.png" }, "image") || "", /5 MB/);
    assert.match(validateMediaFile({ type: "image/png", size: 1200, name: "a.png" }, "video") || "", /MP4/);
  });

  it("reads mediaUrl/mediaType from extendedParameters JSON", () => {
    const attachments = attachmentsFromExtendedParameters(JSON.stringify({
      wamid: "wamid.123",
      mediaUrl: "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/images/abc.png",
      mediaType: "image",
    }));
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.url, "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/images/abc.png");
    assert.equal(attachments[0]?.kind, "image");
  });

  it("ignores legacy attachments array format", () => {
    const attachments = attachmentsFromExtendedParameters(JSON.stringify({
      attachments: [{
        id: "abc",
        kind: "image",
        name: "sample.png",
        mimeType: "image/png",
        size: 12,
        url: "https://example.test/api/media/abc",
      }],
    }));
    assert.equal(attachments.length, 0);
  });

  it("sanitizes to a single attachment and builds media fields", () => {
    const kept = sanitizeMediaAttachments([
      { id: "a", kind: "image", name: "a.png", mimeType: "image/png", size: 1, url: "https://bucket.s3.us-east-1.amazonaws.com/images/a.png" },
      { id: "b", kind: "video", name: "b.mp4", mimeType: "video/mp4", size: 2, url: "https://bucket.s3.us-east-1.amazonaws.com/videos/b.mp4" },
      { kind: "image" },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(captionForAttachments(kept), "Image");
    assert.deepEqual(mediaFieldsFromAttachments(kept), {
      mediaUrl: "https://bucket.s3.us-east-1.amazonaws.com/images/a.png",
      mediaType: "image",
    });
  });
});

describe("s3 media urls", () => {
  it("builds virtual-hosted public urls", () => {
    assert.equal(
      publicS3ObjectUrl("amzn-s3-fc-bucket", "sa-east-1", "images/abc.png"),
      "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/images/abc.png",
    );
  });

  it("allows configured bucket urls when env is set", () => {
    const previous = {
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_DEFAULT_REGION,
    };
    process.env.S3_BUCKET = "amzn-s3-fc-bucket";
    process.env.AWS_DEFAULT_REGION = "sa-east-1";
    try {
      assert.equal(
        isAllowedS3MediaUrl("https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/images/abc.png"),
        true,
      );
      assert.equal(
        isAllowedS3MediaUrl("https://evil.example/images/abc.png"),
        false,
      );
    } finally {
      if (previous.bucket == null) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = previous.bucket;
      if (previous.region == null) delete process.env.AWS_DEFAULT_REGION;
      else process.env.AWS_DEFAULT_REGION = previous.region;
    }
  });
});
