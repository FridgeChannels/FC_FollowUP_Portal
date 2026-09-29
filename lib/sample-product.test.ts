import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelTypeFromIcpGroup,
  normalizePortalChannelType,
  resolveChannelType,
} from "./sample-product.ts";

describe("normalizePortalChannelType", () => {
  it("accepts known select values", () => {
    assert.equal(normalizePortalChannelType("DTC"), "DTC");
    assert.equal(normalizePortalChannelType("Amazon"), "Amazon");
    assert.equal(normalizePortalChannelType("DTC&Amazon"), "DTC&Amazon");
  });

  it("rejects blank / unknown", () => {
    assert.equal(normalizePortalChannelType(null), null);
    assert.equal(normalizePortalChannelType(""), null);
    assert.equal(normalizePortalChannelType("A"), null);
  });
});

describe("channelTypeFromIcpGroup", () => {
  it("maps A / B / A&B and passthrough labels", () => {
    assert.equal(channelTypeFromIcpGroup("A"), "DTC");
    assert.equal(channelTypeFromIcpGroup("B"), "Amazon");
    assert.equal(channelTypeFromIcpGroup("A&B"), "DTC&Amazon");
    assert.equal(channelTypeFromIcpGroup("A & B"), "DTC&Amazon");
    assert.equal(channelTypeFromIcpGroup("Amazon"), "Amazon");
  });

  it("defaults unknown / empty to DTC", () => {
    assert.equal(channelTypeFromIcpGroup(null), "DTC");
    assert.equal(channelTypeFromIcpGroup(""), "DTC");
    assert.equal(channelTypeFromIcpGroup("Z"), "DTC");
  });
});

describe("resolveChannelType", () => {
  it("prefers Portal Channel Type over ICP Group", () => {
    assert.equal(
      resolveChannelType({ portal: "Amazon", icpGroup: "A" }),
      "Amazon",
    );
    assert.equal(
      resolveChannelType({ portal: "DTC&Amazon", icpGroup: "B" }),
      "DTC&Amazon",
    );
  });

  it("falls back to ICP Group when Portal is empty", () => {
    assert.equal(resolveChannelType({ portal: null, icpGroup: "B" }), "Amazon");
    assert.equal(resolveChannelType({ portal: "", icpGroup: "A&B" }), "DTC&Amazon");
    assert.equal(resolveChannelType({ portal: "nope", icpGroup: "A" }), "DTC");
  });
});
