import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInteractionCpFallbacks,
  resolveInteractionDisplayCp,
} from "./interaction-cp.ts";

describe("resolveInteractionDisplayCp", () => {
  it("keeps stamped CP2 on a shared thread that also has CP1 inbound", () => {
    const fallbacks = buildInteractionCpFallbacks([
      {
        threadId: "THR-shared-Email",
        direction: "Outbound",
        stampedCp: "CP1",
        sortAt: "2026-09-15T08:00:00.000Z",
      },
      {
        threadId: "THR-shared-Email",
        direction: "Inbound",
        stampedCp: "CP1",
        sortAt: "2026-09-16T08:00:00.000Z",
      },
      {
        threadId: "THR-shared-Email",
        direction: "Outbound",
        stampedCp: "CP2",
        sortAt: "2026-09-17T08:00:00.000Z",
      },
    ]);

    assert.equal(
      resolveInteractionDisplayCp("CP2", { threadId: "THR-shared-Email" }, fallbacks),
      "CP2",
    );
    assert.equal(
      resolveInteractionDisplayCp("CP1", { threadId: "THR-shared-Email" }, fallbacks),
      "CP1",
    );
  });

  it("fills missing CP from latest inbound on the same thread", () => {
    const fallbacks = buildInteractionCpFallbacks([
      {
        threadId: "THR-shared-Email",
        direction: "Inbound",
        stampedCp: "CP1",
        sortAt: "2026-09-16T08:00:00.000Z",
      },
      {
        threadId: "THR-shared-Email",
        direction: "Inbound",
        stampedCp: "CP3",
        sortAt: "2026-09-17T08:00:00.000Z",
      },
    ]);

    assert.equal(
      resolveInteractionDisplayCp(null, { threadId: "THR-shared-Email" }, fallbacks),
      "CP3",
    );
  });

  it("falls back to task CP when thread and stamp are empty", () => {
    const fallbacks = buildInteractionCpFallbacks([
      {
        taskId: "task-1",
        stampedCp: "CP2",
        sortAt: "2026-09-17T08:00:00.000Z",
      },
    ]);

    assert.equal(
      resolveInteractionDisplayCp(undefined, { taskId: "task-1" }, fallbacks),
      "CP2",
    );
  });
});
