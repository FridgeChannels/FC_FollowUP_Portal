import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDevCallPhone } from "./dev-call-phone.ts";

describe("parseDevCallPhone", () => {
  it("returns a trimmed number", () => {
    assert.equal(parseDevCallPhone("  +1 8207863604  "), "+1 8207863604");
  });

  it("returns null when empty", () => {
    assert.equal(parseDevCallPhone(""), null);
    assert.equal(parseDevCallPhone(undefined), null);
  });
});
