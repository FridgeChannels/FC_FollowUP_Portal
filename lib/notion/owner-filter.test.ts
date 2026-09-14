import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerPageIdFromQueryParam, ownerRelationFilter } from "./owner-filter.ts";

describe("ownerRelationFilter", () => {
  it("queries all owners when no owner is selected", () => {
    assert.equal(ownerRelationFilter(undefined), undefined);
  });

  it("queries empty Owner for Unassigned", () => {
    assert.deepEqual(ownerRelationFilter(null), {
      property: "Owner",
      relation: { is_empty: true },
    });
  });

  it("queries a specific Owner relation", () => {
    assert.deepEqual(ownerRelationFilter("owner-1"), {
      property: "Owner",
      relation: { contains: "owner-1" },
    });
  });
});

describe("ownerPageIdFromQueryParam", () => {
  it("keeps non-admin viewers scoped to their Owner", () => {
    assert.equal(ownerPageIdFromQueryParam(false, "owner-1", "unassigned"), "owner-1");
  });

  it("lets admin query Unassigned as empty Owner", () => {
    assert.equal(ownerPageIdFromQueryParam(true, "admin-1", "unassigned"), null);
  });

  it("lets admin query all owners", () => {
    assert.equal(ownerPageIdFromQueryParam(true, "admin-1", "all"), undefined);
    assert.equal(ownerPageIdFromQueryParam(true, "admin-1", null), undefined);
  });
});
