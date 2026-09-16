import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ownerPageIdFromQueryParam,
  ownerRelationFilter,
  parseTaskStatusScope,
  taskListFilter,
  taskQueryForViewer,
  taskStatusFilter,
} from "./owner-filter.ts";

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

describe("parseTaskStatusScope", () => {
  it("defaults to open", () => {
    assert.equal(parseTaskStatusScope(null), "open");
    assert.equal(parseTaskStatusScope(undefined), "open");
    assert.equal(parseTaskStatusScope(""), "open");
  });

  it("accepts completed and all", () => {
    assert.equal(parseTaskStatusScope("completed"), "completed");
    assert.equal(parseTaskStatusScope("closed"), "completed");
    assert.equal(parseTaskStatusScope("all"), "all");
  });
});

describe("taskQueryForViewer", () => {
  it("queries assigned Phone + open tasks for Caller by default", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: false, role: "Caller", ownerId: "caller-1" }),
      { channel: "Phone", ownerPageId: "caller-1", statusScope: "open" },
    );
  });

  it("scopes AccountManager to their Owner relation and open status", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: false, role: "AccountManager", ownerId: "owner-1" }),
      { ownerPageId: "owner-1", statusScope: "open" },
    );
  });

  it("passes through status=all", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: true, role: "Admin", ownerId: "admin-1" }, null, "all"),
      { ownerPageId: undefined, statusScope: "all" },
    );
  });
});

describe("taskListFilter", () => {
  it("filters Caller lists by Owner, Channel Phone, and open status", () => {
    assert.deepEqual(taskListFilter({ channel: "Phone", ownerPageId: "caller-1" }), {
      and: [
        { property: "Owner", relation: { contains: "caller-1" } },
        { property: "Channel", select: { equals: "Phone" } },
        taskStatusFilter("open"),
      ],
    });
  });

  it("omits status when scope is all", () => {
    assert.deepEqual(taskListFilter({ channel: "Phone", ownerPageId: "caller-1", statusScope: "all" }), {
      and: [
        { property: "Owner", relation: { contains: "caller-1" } },
        { property: "Channel", select: { equals: "Phone" } },
      ],
    });
  });

  it("filters completed statuses", () => {
    assert.deepEqual(taskListFilter({ statusScope: "completed" }), taskStatusFilter("completed"));
  });
});
