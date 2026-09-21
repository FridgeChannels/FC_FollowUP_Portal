import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composePhoneCallContent, parsePhoneCallContent } from "./phone-call-content.ts";

describe("phone call content", () => {
  it("round-trips context and script", () => {
    const composed = composePhoneCallContent(
      "Prior email confirmed magnet delivery.",
      "Ask if they received the setup form.",
    );
    assert.equal(
      composed,
      "Context:\nPrior email confirmed magnet delivery.\n\nScript:\nAsk if they received the setup form.",
    );
    assert.deepEqual(parsePhoneCallContent(composed), {
      context: "Prior email confirmed magnet delivery.",
      script: "Ask if they received the setup form.",
    });
  });

  it("keeps legacy script-only content as script", () => {
    assert.deepEqual(parsePhoneCallContent("Ask who owns lifecycle."), {
      context: "",
      script: "Ask who owns lifecycle.",
    });
  });

  it("omits the Context header when context is empty", () => {
    assert.equal(composePhoneCallContent("  ", "Call the KeyPerson."), "Call the KeyPerson.");
  });

  it("parses context-only content", () => {
    assert.deepEqual(parsePhoneCallContent("Context:\nThey asked to talk tomorrow."), {
      context: "They asked to talk tomorrow.",
      script: "",
    });
  });

  it("treats blank content as empty parts", () => {
    assert.deepEqual(parsePhoneCallContent("  \n"), { context: "", script: "" });
    assert.deepEqual(parsePhoneCallContent(null), { context: "", script: "" });
  });
});
