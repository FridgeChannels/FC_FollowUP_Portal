import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendAiMeetingLink,
  encodeAiMeetingLinks,
  parseAiMeetingLinks,
  sortAiMeetingLinks,
} from "./ai-meeting-links.ts";

describe("ai-meeting-links", () => {
  it("parses and encodes JSON text property", () => {
    const links = [
      {
        id: "abc",
        title: "Brand · 2026-09-22 12:00",
        url: "https://www.notion.so/abc",
        createdAt: "2026-09-22T04:00:00.000Z",
      },
    ];
    const encoded = encodeAiMeetingLinks(links);
    assert.equal(typeof encoded, "string");
    assert.deepEqual(parseAiMeetingLinks(encoded), links);
  });

  it("returns empty for invalid JSON", () => {
    assert.deepEqual(parseAiMeetingLinks(""), []);
    assert.deepEqual(parseAiMeetingLinks("not-json"), []);
    assert.deepEqual(parseAiMeetingLinks("{}"), []);
  });

  it("appends newest-first and dedupes by id", () => {
    const older = {
      id: "1",
      title: "Old",
      url: "https://www.notion.so/1",
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    const newer = {
      id: "2",
      title: "New",
      url: "https://www.notion.so/2",
      createdAt: "2026-09-22T00:00:00.000Z",
    };
    const next = appendAiMeetingLink([older], newer);
    assert.deepEqual(
      next.map((item) => item.id),
      ["2", "1"],
    );
    assert.deepEqual(appendAiMeetingLink(next, { ...newer, title: "Updated" })[0].title, "Updated");
    assert.equal(sortAiMeetingLinks([older, newer])[0].id, "2");
  });
});
