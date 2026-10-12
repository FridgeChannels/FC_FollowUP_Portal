import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  encodeBrandAssignment,
  brandAssignmentHistory,
  latestBrandAssignment,
  withoutBrandAssignmentRecords,
} from "./brand-assignment.ts";

describe("brand assignment records", () => {
  it("uses the latest valid assignment and keeps it out of visible notes", () => {
    const first = encodeBrandAssignment({
      ownerId: "owner-a",
      assignedAt: "2026-10-09T01:00:00.000Z",
    });
    const latest = encodeBrandAssignment({
      ownerId: "owner-b",
      assignedAt: "2026-10-09T02:00:00.000Z",
    });
    const notes = `Shared context\n${first}\n${latest}`;

    assert.deepEqual(latestBrandAssignment(notes), {
      ownerId: "owner-b",
      assignedAt: "2026-10-09T02:00:00.000Z",
    });
    assert.equal(withoutBrandAssignmentRecords(notes), "Shared context");
  });
});

it("keeps past Account Managers available after a later unassignment", () => {
  const first = encodeBrandAssignment({ ownerId: "owner-a", assignedAt: "2026-10-09T01:00:00.000Z" });
  const cleared = encodeBrandAssignment({ ownerId: null, assignedAt: "2026-10-09T03:00:00.000Z" });

  assert.deepEqual(brandAssignmentHistory(`${first}\n${cleared}`), [
    { ownerId: null, assignedAt: "2026-10-09T03:00:00.000Z" },
    { ownerId: "owner-a", assignedAt: "2026-10-09T01:00:00.000Z" },
  ]);
});
