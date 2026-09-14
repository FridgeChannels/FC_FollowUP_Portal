import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExtendedParametersError, asExtendedParameters } from "./extended-parameters.ts";

describe("asExtendedParameters", () => {
  it("accepts an object and stores compact JSON", () => {
    assert.equal(
      asExtendedParameters({ gmailThreadId: "18c4", gmailMessageId: "18c4ef" }),
      '{"gmailThreadId":"18c4","gmailMessageId":"18c4ef"}',
    );
  });

  it("accepts a JSON string", () => {
    assert.equal(
      asExtendedParameters('{"gmailThreadId":"18c4"}'),
      '{"gmailThreadId":"18c4"}',
    );
  });

  it("treats empty values as omitted", () => {
    assert.equal(asExtendedParameters(""), null);
    assert.equal(asExtendedParameters("   "), null);
    assert.equal(asExtendedParameters(null), null);
    assert.equal(asExtendedParameters({}), null);
  });

  it("rejects invalid JSON and non-objects", () => {
    assert.throws(() => asExtendedParameters("{"), ExtendedParametersError);
    assert.throws(() => asExtendedParameters(["gmail"]), ExtendedParametersError);
    assert.throws(() => asExtendedParameters("not-json"), ExtendedParametersError);
  });
});
