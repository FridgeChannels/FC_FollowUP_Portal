import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExtendedParametersError, asExtendedParameters, withQuoteHistory } from "./extended-parameters.ts";

describe("withQuoteHistory", () => {
  const inherited = '{"gmailThreadId":"t1","gmailMessageId":"m1"}';

  it("leaves inherited parameters alone when the quote is kept", () => {
    assert.equal(withQuoteHistory(inherited, undefined), inherited);
    assert.equal(withQuoteHistory(null, undefined), null);
  });

  it("records a removed quote alongside the thread ids", () => {
    assert.equal(withQuoteHistory(inherited, false), '{"gmailThreadId":"t1","gmailMessageId":"m1","quoteHistory":false}');
    assert.equal(withQuoteHistory(null, false), '{"quoteHistory":false}');
  });

  it("drops a quote choice inherited from an earlier message", () => {
    assert.equal(withQuoteHistory('{"gmailThreadId":"t1","quoteHistory":false}', undefined), '{"gmailThreadId":"t1"}');
    assert.equal(withQuoteHistory('{"quoteHistory":false}', undefined), null);
  });
});

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
