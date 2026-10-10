import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinBombTemplateContent, splitBombTemplateContent } from "./bomb-template-attachments.ts";

describe("bomb template attachments", () => {
  it("keeps template text separate from stored attachments", () => {
    const value = joinBombTemplateContent("Hello {{contact_name}}", [{
      id: "media-1",
      kind: "image",
      name: "sample.png",
      mimeType: "image/png",
      size: 20,
      url: "https://example.com/sample.png",
    }]);

    assert.deepEqual(splitBombTemplateContent(value), {
      content: "Hello {{contact_name}}",
      attachments: [{
        id: "media-1",
        kind: "image",
        name: "sample.png",
        mimeType: "image/png",
        size: 20,
        url: "https://example.com/sample.png",
      }],
    });
  });
});
