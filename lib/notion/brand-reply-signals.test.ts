import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastReplyAtFromActivities } from "../brand-list.ts";

describe("lastReplyAtFromActivities", () => {
  it("uses the latest inbound interaction time", () => {
    assert.equal(
      lastReplyAtFromActivities([
        { direction: "Outbound", createdAt: "2026-09-16T00:00:00.000Z" },
        { direction: "Inbound", createdAt: "2026-09-10T00:00:00.000Z" },
        { direction: "Inbound", createdAt: "2026-09-15T08:33:00.000Z" },
      ]),
      "2026-09-15T08:33:00.000Z",
    );
  });

  it("returns null when there is no inbound reply", () => {
    assert.equal(
      lastReplyAtFromActivities([
        { direction: "Outbound", createdAt: "2026-09-15T00:00:00.000Z" },
      ]),
      null,
    );
  });
});
