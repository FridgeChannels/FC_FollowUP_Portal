import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchOpenPhoneTask,
  normalizePhoneLineNumber,
  phoneLineCounterparty,
} from "./phone-line.ts";

describe("normalizePhoneLineNumber", () => {
  it("keeps a US/CA number as 10 digits", () => {
    assert.equal(normalizePhoneLineNumber("+1 (415) 555-0182"), "4155550182");
    assert.equal(normalizePhoneLineNumber("14155550182"), "4155550182");
    assert.equal(normalizePhoneLineNumber("415-555-0182"), "4155550182");
    assert.equal(normalizePhoneLineNumber("0014155550182"), "4155550182");
    assert.equal(normalizePhoneLineNumber("+1 415 555 0182 x99"), "4155550182");
  });

  it("rejects numbers that are not 10-digit NANP", () => {
    assert.equal(normalizePhoneLineNumber("+44 20 7946 0958"), null);
    assert.equal(normalizePhoneLineNumber("555-0182"), null);
  });
});

describe("matchOpenPhoneTask", () => {
  const tasks = [
    { id: "task-1", contactPhone: "+1 415 555 0182" },
    { id: "task-2", contactPhone: "415-555-0199" },
    { id: "task-3", contactPhone: "" },
  ];

  it("returns the single open task with the same NANP number", () => {
    assert.equal(matchOpenPhoneTask("+14155550182", tasks)?.id, "task-1");
  });

  it("returns nothing when zero or several tasks share the number", () => {
    assert.equal(matchOpenPhoneTask("+1 212 555 0100", tasks), null);
    assert.equal(
      matchOpenPhoneTask("4155550182", [
        ...tasks,
        { id: "task-4", contactPhone: "415-555-0182" },
      ]),
      null,
    );
  });

  it("ignores an empty or non-NANP contact phone", () => {
    assert.equal(matchOpenPhoneTask("+44 20 7946 0958", tasks), null);
    assert.equal(matchOpenPhoneTask("4155550182", [{ id: "blank", contactPhone: null }]), null);
  });

  it("reads only the counterparty, not the workspace number", () => {
    const incoming = {
      direction: "incoming",
      from: "+1 415 555 0182",
      to: "+1 972 900 0833",
      participants: ["+1 972 900 0833", "+1 415 555 0199"],
    };
    assert.equal(phoneLineCounterparty(incoming), "+1 415 555 0182");
    assert.equal(
      matchOpenPhoneTask(phoneLineCounterparty(incoming), tasks)?.id,
      "task-1",
    );
    assert.equal(
      phoneLineCounterparty({
        direction: "outgoing",
        from: "+1 972 900 0833",
        to: "+1 415 555 0199",
      }),
      "+1 415 555 0199",
    );
    assert.equal(phoneLineCounterparty({ from: "+1 415 555 0182", to: "+1 415 555 0199" }), null);
  });
});
