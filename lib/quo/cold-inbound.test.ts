import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  counterpartyPhone,
  normalizeNanpPhone,
  planQuoColdInbound,
} from "./cold-inbound.ts";
import type { QuoCall } from "./types.ts";

describe("normalizeNanpPhone", () => {
  it("keeps a US/CA number as 10 digits", () => {
    assert.equal(normalizeNanpPhone("+1 (415) 555-0182"), "4155550182");
    assert.equal(normalizeNanpPhone("14155550182"), "4155550182");
    assert.equal(normalizeNanpPhone("415-555-0182"), "4155550182");
    assert.equal(normalizeNanpPhone("0014155550182"), "4155550182");
    assert.equal(normalizeNanpPhone("+1 415 555 0182 x99"), "4155550182");
  });

  it("rejects numbers that are not 10-digit NANP", () => {
    assert.equal(normalizeNanpPhone("+44 20 7946 0958"), null);
    assert.equal(normalizeNanpPhone(""), null);
    assert.equal(normalizeNanpPhone("555-0182"), null);
  });
});

describe("planQuoColdInbound", () => {
  const incoming: QuoCall = {
    direction: "incoming",
    from: "+1 (415) 555-0182",
    to: "+1 972 900 0833",
    participants: ["+1 972 900 0833", "+1 415 555 0182"],
  };

  it("uses the caller number for an inbound call", () => {
    assert.equal(counterpartyPhone(incoming), "+1 (415) 555-0182");
    assert.deepEqual(planQuoColdInbound({ call: incoming, hasExistingConversation: false }), {
      action: "create",
      phone: "+1 (415) 555-0182",
      nanp: "4155550182",
    });
  });

  it("does not turn an unmatched outbound call into a cold inbound", () => {
    const plan = planQuoColdInbound({
      call: { direction: "outgoing", from: "+19729000833", to: "+14155550182" },
      hasExistingConversation: false,
    });
    assert.deepEqual(plan, { action: "skip", reason: "not-inbound" });
  });

  it("updates an existing untasked conversation without reading the phone again", () => {
    assert.deepEqual(planQuoColdInbound({
      call: { direction: "incoming" },
      hasExistingConversation: true,
    }), { action: "update" });
  });

  it("does not open a second conversation when the call is already on a task", () => {
    assert.deepEqual(planQuoColdInbound({
      call: incoming,
      hasExistingConversation: true,
      existingTaskId: "task-1",
    }), { action: "skip", reason: "task-linked" });
  });
});
