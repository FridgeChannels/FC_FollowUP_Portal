import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerPageIdFromQueryParam, ownerRelationFilter, taskListFilter, taskQueryForViewer } from "./owner-filter.ts";

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

describe("taskQueryForViewer", () => {
  it("queries Phone tasks for Caller", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: false, role: "Caller", ownerId: "caller-1" }),
      { channel: "Phone" },
    );
  });

  it("scopes FC_Owner to their Owner relation", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: false, role: "FC_Owner", ownerId: "owner-1" }),
      { ownerPageId: "owner-1" },
    );
  });
});

describe("taskListFilter", () => {
  it("filters Caller lists by Channel Phone", () => {
    assert.deepEqual(taskListFilter({ channel: "Phone" }), {
      property: "Channel",
      select: { equals: "Phone" },
    });
  });
});
