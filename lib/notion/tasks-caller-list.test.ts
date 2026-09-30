import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandNameFromTaskTitle,
  callerListTaskFromPage,
  type CallerListTaskPage,
} from "./tasks-caller-list.ts";

function page(partial: {
  id?: string;
  created_time?: string;
  properties?: CallerListTaskPage["properties"];
}): CallerListTaskPage {
  return {
    id: partial.id || "task-1",
    created_time: partial.created_time || "2026-09-30T00:00:00.000Z",
    properties: partial.properties || {},
  };
}

function relation(id: string) {
  return { type: "relation" as const, relation: [{ id }] };
}

function select(name: string) {
  return { type: "select" as const, select: { name } };
}

function title(text: string) {
  return {
    type: "title" as const,
    title: [{ plain_text: text }],
  };
}

function date(start: string) {
  return { type: "date" as const, date: { start } };
}

describe("brandNameFromTaskTitle", () => {
  it("takes the segment before the first em dash", () => {
    assert.equal(
      brandNameFromTaskTitle(
        "AllSprouts — Cameron den Hoed — Email — 2026-09-29T13:05:00.000Z",
      ),
      "AllSprouts",
    );
  });

  it("returns null when the title is not the standard pattern", () => {
    assert.equal(brandNameFromTaskTitle("Call Acme"), null);
    assert.equal(brandNameFromTaskTitle(""), null);
    assert.equal(brandNameFromTaskTitle(null), null);
  });
});

describe("callerListTaskFromPage", () => {
  it("maps list fields and brand name from the task title without Client hydrate", () => {
    const task = callerListTaskFromPage(
      page({
        id: "task-phone-1",
        properties: {
          "Follow-up Task": title(
            "AllSprouts — Cameron den Hoed — Phone — 2026-09-30",
          ),
          Channel: select("Phone"),
          "Task Status": select("Pending"),
          Priority: select("P0"),
          "Scheduled At": date("2026-09-30"),
          "Follow-up Contact": relation("contact-1"),
          "Follow-up Client": relation("brand-1"),
          Owner: relation("owner-1"),
          "Call Review Status": select("Awaiting Review"),
        },
      }),
    );

    assert.equal(task.id, "task-phone-1");
    assert.equal(task.brandId, "brand-1");
    assert.equal(task.brandName, "AllSprouts");
    assert.equal(task.contactId, "contact-1");
    assert.equal(task.ownerId, "owner-1");
    assert.equal(task.callReviewStatus, "Awaiting Review");
    assert.equal(task.contactName, null);
    assert.equal(task.ownerName, null);
  });

  it("prefers an explicit brand name override when provided", () => {
    const task = callerListTaskFromPage(
      page({
        properties: {
          "Follow-up Task": title("AllSprouts — Person — Phone — 2026-09-30"),
          Channel: select("Phone"),
          "Task Status": select("In Progress"),
        },
      }),
      {
        id: "brand-9",
        name: "Acme Co",
        ownerId: "owner-9",
        isTest: true,
      },
    );

    assert.equal(task.brandId, "brand-9");
    assert.equal(task.brandName, "Acme Co");
    assert.equal(task.brandIsTest, true);
  });
});
