import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  callerBrandKey,
  encodeCallerListCursor,
  parseCallerListCursor,
} from "./caller-list-cursor.ts";

describe("caller-list-cursor", () => {
  it("round-trips brand pagination state", () => {
    const encoded = encodeCallerListCursor({
      notionCursor: "notion-abc",
      buffer: ["task-1", "task-2"],
      seen: ["brand:b1", "contact:c1"],
    });
    assert.match(encoded, /^cbrand:/);
    assert.deepEqual(parseCallerListCursor(encoded), {
      notionCursor: "notion-abc",
      buffer: ["task-1", "task-2"],
      seen: ["brand:b1", "contact:c1"],
    });
  });

  it("treats empty and legacy Notion cursors safely", () => {
    assert.deepEqual(parseCallerListCursor(null), {
      notionCursor: null,
      buffer: [],
      seen: [],
    });
    assert.deepEqual(parseCallerListCursor("raw-notion-cursor"), {
      notionCursor: "raw-notion-cursor",
      buffer: [],
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
