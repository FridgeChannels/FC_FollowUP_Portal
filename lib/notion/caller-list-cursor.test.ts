import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callerBrandKey,
  clearCallerListContinuations,
  encodeCallerListCursor,
  parseCallerListCursor,
} from "./caller-list-cursor.ts";

describe("caller-list-cursor", () => {
  it("round-trips stub buffers through a short server token", () => {
    clearCallerListContinuations();
    const stub = {
      id: "task-1",
      title: "Acme — Person — Phone — 2026-09-30",
      brandId: "brand-1",
      contactId: "contact-1",
      ownerId: null,
      channel: "Phone",
      status: "Pending",
      priority: null,
      scheduledAt: "2026-09-30",
      endedAt: null,
      creationMethod: null,
      callReviewStatus: null,
      callReviewReason: null,
      callQualifiedAt: null,
      templateId: null,
      sourceBombId: null,
      omniReachRunId: null,
    };
    const encoded = encodeCallerListCursor({
      notionCursor: "notion-abc",
      buffer: [stub],
      legacyBufferIds: [],
      seen: ["brand:b1"],
    });
    assert.match(encoded, /^cbrand:t:[0-9a-f-]+$/i);
    assert.ok(encoded.length < 80);
    assert.deepEqual(parseCallerListCursor(encoded), {
      notionCursor: "notion-abc",
      buffer: [stub],
      legacyBufferIds: [],
      seen: ["brand:b1"],
    });
    // Token stays valid within TTL for retries.
    assert.deepEqual(parseCallerListCursor(encoded).notionCursor, "notion-abc");
  });

  it("keeps legacy string buffers as retrieve fallbacks", () => {
    const legacy = `cbrand:${Buffer.from(
      JSON.stringify({ n: null, b: ["task-old"], s: [] }),
      "utf8",
    ).toString("base64url")}`;
    assert.deepEqual(parseCallerListCursor(legacy), {
      notionCursor: null,
      buffer: [],
      legacyBufferIds: ["task-old"],
      seen: [],
    });
  });

  it("prefers brand id, then contact, then task id", () => {
    assert.equal(
      callerBrandKey({ id: "t1", brandId: "b1", contactId: "c1" }),
      "brand:b1",
    );
    assert.equal(
      callerBrandKey({ id: "t1", brandId: null, contactId: "c1" }),
      "contact:c1",
    );
    assert.equal(
      callerBrandKey({ id: "t1", brandId: null, contactId: null }),
      "task:t1",
    );
  });
});
