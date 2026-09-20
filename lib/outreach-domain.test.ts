import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareInteractionSort,
  interactionSortAt,
  type Interaction,
} from "./outreach-domain.ts";
import { parseTimelineMs } from "./scheduling-engine/calendar.ts";

function item(
  partial: Pick<Interaction, "id" | "direction"> &
    Partial<Pick<Interaction, "scheduledAt" | "recordedAt" | "createdAt">>,
) {
  return {
    scheduledAt: partial.scheduledAt,
    recordedAt: partial.recordedAt,
    createdAt: partial.createdAt || "",
    id: partial.id,
    direction: partial.direction,
  };
}

describe("parseTimelineMs", () => {
  it("treats naive Notion Scheduled At as Eastern wall time", () => {
    assert.equal(parseTimelineMs("2026-09-18T07:01:00.000"), Date.parse("2026-09-18T11:01:00.000Z"));
    assert.equal(parseTimelineMs("2026-09-18T07:01:00.000-04:00"), Date.parse("2026-09-18T11:01:00.000Z"));
  });

  it("keeps explicit UTC instants", () => {
    assert.equal(parseTimelineMs("2026-09-18T10:41:00.000Z"), Date.parse("2026-09-18T10:41:00.000Z"));
  });
});

describe("interactionSortAt", () => {
  it("does not rank an Eastern outbound after an earlier UTC inbound via string compare", () => {
    const outbound = item({
      id: "out-701",
      direction: "Outbound",
      scheduledAt: "2026-09-18T07:01:00.000-04:00",
      createdAt: "2026-09-18T11:01:00.000Z",
    });
    const inbound = item({
      id: "in-641",
      direction: "Inbound",
      recordedAt: "2026-09-18T10:41:00.000Z",
      createdAt: "2026-09-18T10:41:00.000Z",
    });
    assert.equal(compareInteractionSort(inbound, outbound) < 0, true);
    assert.match(interactionSortAt(inbound), /T10:41:00\.000Z$/);
    assert.match(interactionSortAt(outbound), /T11:01:00\.000Z$/);
  });

  it("orders the Test Peter WhatsApp thread by actual time", () => {
    const messages = [
      item({
        id: "human-625",
        direction: "Outbound",
        scheduledAt: "2026-09-18T06:25:00.000-04:00",
        createdAt: "2026-09-18T10:25:00.000Z",
      }),
      item({
        id: "human-632",
        direction: "Outbound",
        scheduledAt: "2026-09-18T06:32:00.000-04:00",
        createdAt: "2026-09-18T10:32:00.000Z",
      }),
      item({
        id: "reply-641",
        direction: "Inbound",
        recordedAt: "2026-09-18T10:41:00.000Z",
        createdAt: "2026-09-18T10:41:00.000Z",
      }),
      item({
        id: "human-642",
        direction: "Outbound",
        scheduledAt: "2026-09-18T06:42:00.000-04:00",
        createdAt: "2026-09-18T10:42:00.000Z",
      }),
      item({
        id: "pending-900",
        direction: "Outbound",
        scheduledAt: "2026-09-18T09:00:00.000-04:00",
        createdAt: "2026-09-18T10:47:00.000Z",
      }),
      item({
        id: "human-701",
        direction: "Outbound",
        scheduledAt: "2026-09-18T07:01:00.000-04:00",
        createdAt: "2026-09-18T11:01:00.000Z",
      }),
      item({
        id: "reply-702",
        direction: "Inbound",
        recordedAt: "2026-09-18T11:02:00.000Z",
        createdAt: "2026-09-18T11:02:00.000Z",
      }),
      item({
        id: "omnir-cancelled",
        direction: "Outbound",
        scheduledAt: "2026-09-21T09:00:00.000-04:00",
        createdAt: "2026-09-18T09:39:00.000Z",
      }),
    ];
    const ordered = [...messages].sort(compareInteractionSort).map((entry) => entry.id);
    assert.deepEqual(ordered, [
      "human-625",
      "human-632",
      "reply-641",
      "human-642",
      "human-701",
      "reply-702",
      "pending-900",
      "omnir-cancelled",
    ]);
  });

  it("still sorts naive Eastern scheduledAt against UTC replies", () => {
    const outbound = item({
      id: "out",
      direction: "Outbound",
      scheduledAt: "2026-09-18T07:01:00.000",
      createdAt: "2026-09-18T11:01:00.000Z",
    });
    const inbound = item({
      id: "in",
      direction: "Inbound",
      recordedAt: "2026-09-18T10:41:00.000Z",
      createdAt: "2026-09-18T10:41:00.000Z",
    });
    assert.equal(compareInteractionSort(inbound, outbound) < 0, true);
  });

  it("uses Scheduled At for an outbound row when no actual send time was recorded", () => {
    const outbound = item({
      id: "planned-send",
      direction: "Outbound",
      scheduledAt: "2026-09-18T09:00:00.000-04:00",
      createdAt: "2026-09-20T10:00:00.000Z",
    });
    assert.match(interactionSortAt(outbound), /2026-09-18T13:00:00\.000Z$/);
  });

  it("uses an actual outbound Interaction At ahead of its Scheduled At", () => {
    const outbound = item({
      id: "sent",
      direction: "Outbound",
      recordedAt: "2026-09-18T15:20:00.000Z",
      scheduledAt: "2026-09-18T09:00:00.000-04:00",
      createdAt: "2026-09-18T12:00:00.000Z",
    });
    assert.match(interactionSortAt(outbound), /2026-09-18T15:20:00\.000Z$/);
  });
});
