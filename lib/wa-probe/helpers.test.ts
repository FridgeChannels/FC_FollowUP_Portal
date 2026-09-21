import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isTerminalProbeStatus,
  probeHasWhatsapp,
  toProbeE164,
} from "./helpers.ts";

describe("toProbeE164", () => {
  it("formats mobile without spaces", () => {
    assert.equal(toProbeE164("+1 555 123 4567"), "+15551234567");
    assert.equal(toProbeE164("(415) 555-0199"), "+14155550199");
  });

  it("rejects extension numbers", () => {
    assert.equal(toProbeE164("+15551234567 ext. 1"), null);
  });
});

describe("probeHasWhatsapp", () => {
  it("maps status yes/no", () => {
    assert.equal(probeHasWhatsapp({ status: "yes", has_whatsapp: true }), true);
    assert.equal(probeHasWhatsapp({ status: "no", has_whatsapp: false }), false);
    assert.equal(probeHasWhatsapp({ status: "unknown", has_whatsapp: null }), null);
    assert.equal(probeHasWhatsapp({ status: "pending", has_whatsapp: null }), null);
  });
});

describe("isTerminalProbeStatus", () => {
  it("pending is not terminal", () => {
    assert.equal(isTerminalProbeStatus("pending"), false);
    assert.equal(isTerminalProbeStatus("yes"), true);
    assert.equal(isTerminalProbeStatus("error"), true);
  });
});
