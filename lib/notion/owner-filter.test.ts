import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  andFilters,
  followupClientListFilter,
  nonTestClientFilter,
  ownerPageIdFromQueryParam,
  ownerRelationFilter,
  parseDateOnlyParam,
  parseTaskStatusScope,
  scheduledAtRangeFilters,
  taskListFilter,
  taskQueryForViewer,
  taskStatusFilter,
  testClientFilter,
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

describe("nonTestClientFilter", () => {
  it("filters Is Test checkbox equals false", () => {
    assert.deepEqual(nonTestClientFilter(), {
      property: "Is Test",
      checkbox: { equals: false },
    });
  });

  it("andFilters combines owner + non-test", () => {
    assert.deepEqual(andFilters(ownerRelationFilter("owner-1"), nonTestClientFilter()), {
      and: [
        { property: "Owner", relation: { contains: "owner-1" } },
        { property: "Is Test", checkbox: { equals: false } },
      ],
    });
  });

  it("andFilters returns non-test alone for admin all-owners", () => {
    assert.deepEqual(andFilters(ownerRelationFilter(undefined), nonTestClientFilter()), {
      property: "Is Test",
      checkbox: { equals: false },
    });
  });

  it("testClientFilter selects checked Is Test", () => {
    assert.deepEqual(testClientFilter(), {
      property: "Is Test",
      checkbox: { equals: true },
    });
  });
});

describe("followupClientListFilter", () => {
  it("always excludes Is Test unless includeTest", () => {
    assert.deepEqual(followupClientListFilter({ includeTest: false }), {
      property: "Is Test",
      checkbox: { equals: false },
    });
    assert.equal(followupClientListFilter({ includeTest: true }), undefined);
  });

  it("onlyTest forces Is Test checkbox equals true", () => {
    assert.deepEqual(followupClientListFilter({ onlyTest: true, includeTest: true }), {
      property: "Is Test",
      checkbox: { equals: true },
    });
  });

  it("combines owner, status, title, and non-test", () => {
    assert.deepEqual(
      followupClientListFilter({
        ownerPageId: "owner-1",
        status: "In Progress",
        excludeStatuses: ["Paused"],
        titleContains: "Acme",
        currentCpPageId: "cp-1",
      }),
      {
        and: [
          { property: "Owner", relation: { contains: "owner-1" } },
          { property: "Is Test", checkbox: { equals: false } },
          { property: "Follow-up Status", status: { equals: "In Progress" } },
          { property: "Follow-up Status", status: { does_not_equal: "Paused" } },
          { property: "Follow-up Client", title: { contains: "Acme" } },
          { property: "Current CP", relation: { contains: "cp-1" } },
        ],
      },
    );
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
  it("queries Phone + open tasks for Caller by default (all owners)", () => {
    assert.deepEqual(
      taskQueryForViewer({ isAdmin: false, role: "Caller", ownerId: "caller-1" }),
      { channel: "Phone", statusScope: "open" },
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
  it("filters Caller lists by Channel Phone and open status", () => {
    assert.deepEqual(taskListFilter({ channel: "Phone" }), {
      and: [
        { property: "Channel", select: { equals: "Phone" } },
        taskStatusFilter("open"),
      ],
    });
  });

  it("omits status when scope is all", () => {
    assert.deepEqual(taskListFilter({ channel: "Phone", statusScope: "all" }), {
      property: "Channel",
      select: { equals: "Phone" },
    });
  });

  it("filters completed statuses", () => {
    assert.deepEqual(taskListFilter({ statusScope: "completed" }), taskStatusFilter("completed"));
  });

  it("adds inclusive Scheduled At range for due dates", () => {
    assert.deepEqual(
      taskListFilter({ channel: "Phone", statusScope: "all", dueFrom: "2026-09-18", dueTo: "2026-09-20" }),
      {
        and: [
          { property: "Channel", select: { equals: "Phone" } },
          { property: "Scheduled At", date: { on_or_after: "2026-09-18" } },
          { property: "Scheduled At", date: { before: "2026-09-21" } },
        ],
      },
    );
  });
});

describe("scheduledAtRangeFilters", () => {
  it("returns nothing without valid dates", () => {
    assert.deepEqual(scheduledAtRangeFilters(), []);
    assert.deepEqual(scheduledAtRangeFilters("nope", "also-nope"), []);
    assert.equal(parseDateOnlyParam("2026-13-40"), undefined);
  });

  it("swaps inverted ranges and uses next-day exclusive end", () => {
    assert.deepEqual(scheduledAtRangeFilters("2026-09-20", "2026-09-18"), [
      { property: "Scheduled At", date: { on_or_after: "2026-09-18" } },
      { property: "Scheduled At", date: { before: "2026-09-21" } },
    ]);
  });

  it("filters a single day inclusively", () => {
    assert.deepEqual(scheduledAtRangeFilters("2026-09-18", "2026-09-18"), [
      { property: "Scheduled At", date: { on_or_after: "2026-09-18" } },
      { property: "Scheduled At", date: { before: "2026-09-19" } },
    ]);
  });
});
