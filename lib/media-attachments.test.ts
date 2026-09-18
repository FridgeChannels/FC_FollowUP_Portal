import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentsFromExtendedParameters,
  captionForAttachments,
  channelSupportsMedia,
  sanitizeMediaAttachments,
  validateMediaFile,
} from "./media-attachments.ts";

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

  it("reads attachments from extendedParameters JSON", () => {
    const attachments = attachmentsFromExtendedParameters(JSON.stringify({
      wamid: "wamid.123",
      attachments: [{
        id: "abc",
        kind: "image",
        name: "sample.png",
        mimeType: "image/png",
        size: 12,
        url: "https://example.test/api/media/abc",
      }],
    }));
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.name, "sample.png");
  });

  it("sanitizes and captions attachments", () => {
    const kept = sanitizeMediaAttachments([
      { id: "a", kind: "image", name: "a.png", mimeType: "image/png", size: 1, url: "/api/media/a" },
      { kind: "image" },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(captionForAttachments(kept), "Image");
    assert.equal(captionForAttachments([...kept, { ...kept[0]!, id: "b", kind: "video", name: "b.mp4", mimeType: "video/mp4" }]), "2 media files");
  });
});
