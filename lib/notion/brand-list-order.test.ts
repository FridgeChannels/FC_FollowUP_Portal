import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrandListItem } from "../brand-list.ts";
import {
  brandListSourceIsExhausted,
  encodeBrandListCursor,
  parseBrandListCursor,
  sortBrandListItems,
} from "./brand-list-order.ts";

function brand(partial: Partial<BrandListItem> & Pick<BrandListItem, "id" | "name">): BrandListItem {
  return {
    initials: "BR",
    currentCp: "NONE",
    status: "In Progress",
    handlingMode: null,
    lastInteractionAt: null,
    lastInteractionChannel: null,
    lastInteractionDirection: null,
    lastInteractionStatus: null,
    lastInteractionCallResult: null,
    lastReplyAt: null,
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    ...partial,
  };
}

describe("sortBrandListItems", () => {
  it("puts Needs Reply brands ahead of qualification and others", () => {
    const sorted = sortBrandListItems([
      brand({ id: "1", name: "Zebra", needsQualification: true }),
      brand({ id: "2", name: "Alpha" }),
      brand({
        id: "3",
        name: "Reply Late",
        needsReply: true,
        replyDueAt: "2026-09-20T00:00:00.000Z",
      }),
      brand({
        id: "4",
        name: "Reply Soon",
        needsReply: true,
        replyDueAt: "2026-09-10T00:00:00.000Z",
      }),
    ]);
    assert.deepEqual(
      sorted.map((item) => item.id),
      ["4", "3", "1", "2"],
    );
  });
});

describe("brand list cursor", () => {
  it("treats a buffered null cursor as an exhausted Notion source", () => {
    assert.equal(brandListSourceIsExhausted(null, ["b1", "b2"]), true);
    assert.equal(brandListSourceIsExhausted(null, []), false);
    assert.equal(brandListSourceIsExhausted("next", ["b1"]), false);
  });

  it("defaults to reply phase offset 0", () => {
    assert.deepEqual(parseBrandListCursor(null), { phase: "reply", offset: 0 });
    assert.deepEqual(parseBrandListCursor(""), { phase: "reply", offset: 0 });
  });

  it("round-trips reply and rest cursors", () => {
    const reply = encodeBrandListCursor({ phase: "reply", offset: 12 });
    assert.equal(reply, "reply:12");
    assert.deepEqual(parseBrandListCursor(reply), { phase: "reply", offset: 12 });

    const rest = encodeBrandListCursor({
      phase: "rest",
      notionCursor: "abc",
      buffer: ["b1", "b2"],
    });
    assert.deepEqual(parseBrandListCursor(rest), {
      phase: "rest",
      notionCursor: "abc",
      buffer: ["b1", "b2"],
    });
  });

  it("treats legacy Notion cursors as rest phase", () => {
    assert.deepEqual(parseBrandListCursor("notion-cursor-xyz"), {
      phase: "rest",
      notionCursor: "notion-cursor-xyz",
      buffer: [],
    });
  });
});
