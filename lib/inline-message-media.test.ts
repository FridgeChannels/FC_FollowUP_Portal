import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inlineMessagePreview, splitInlineMessageMedia } from "./inline-message-media.ts";

const AUDIO = "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/wa-inbound/audio/70d3a904fd3842a08888059efc379f31_PTT-20261009-WA0000.opus";
const IMAGE = "https://amzn-s3-fc-bucket.s3.sa-east-1.amazonaws.com/wa-inbound/image/photo.jpg";

describe("inline message media", () => {
  it("turns a voice-message caption and opus URL into playable audio", () => {
    const segments = splitInlineMessageMedia(`Thanks for the update\n🎤 Voice message (0:20)\n${AUDIO}`);
    assert.deepEqual(segments, [
      { type: "text", text: "Thanks for the update" },
      { type: "media", kind: "audio", url: AUDIO, label: "Voice message (0:20)" },
    ]);
    assert.equal(inlineMessagePreview(`🎤 Voice message (0:20)\n${AUDIO}`), "Voice message (0:20)");
  });

  it("turns an image URL into a preview, including the same-line caption", () => {
    const segments = splitInlineMessageMedia(`📷 Photo\n${IMAGE}`);
    assert.equal(segments[0]?.type, "media");
    if (segments[0]?.type === "media") {
      assert.equal(segments[0].kind, "image");
      assert.equal(segments[0].label, "Photo");
      assert.equal(segments[0].url, IMAGE);
    }
    const sameLine = splitInlineMessageMedia(`Image ${IMAGE}`);
    assert.equal(sameLine[0]?.type, "media");
  });

  it("leaves ordinary text and non-media links alone", () => {
    const content = "See https://fridgechannels.com/pricing for details.";
    assert.deepEqual(splitInlineMessageMedia(content), [{ type: "text", text: content }]);
  });
});
