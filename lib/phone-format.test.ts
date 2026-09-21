import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFullenrichPhones,
  classifyRawPhone,
  formatStandardPhone,
  normalizeStandardPhone,
} from "./phone-format.ts";

describe("formatStandardPhone", () => {
  it("formats e164 without spaces", () => {
    assert.equal(formatStandardPhone("+1 555-123-4567")?.formatted, "+15551234567");
    assert.equal(formatStandardPhone("(415) 555-0199")?.formatted, "+14155550199");
  });

  it("formats extension as ext. N", () => {
    assert.equal(
      formatStandardPhone("+1 555 123 4567 x123")?.formatted,
      "+15551234567 ext. 123",
    );
    assert.equal(
      formatStandardPhone("+15551234567 ext. 1")?.formatted,
      "+15551234567 ext. 1",
    );
  });
});

describe("classifyFullenrichPhones", () => {
  it("puts MOBILE on Phone and LANDLINE on Office Phone", () => {
    const result = classifyFullenrichPhones({
      mostProbable: {
        number: "+1 555-123-4567",
        line_type: "MOBILE",
        line_status: "ACTIVE",
      },
      phones: [
        { number: "+1 555-123-4567", line_type: "MOBILE", line_status: "ACTIVE" },
        { number: "+33 1 42 86 82 82", line_type: "LANDLINE", line_status: "ACTIVE" },
      ],
    });
    assert.equal(result.phone, "+15551234567");
    assert.equal(result.officePhone, "+33142868282");
    assert.equal(result.directPhone, null);
  });

  it("never puts extension numbers on Phone", () => {
    const result = classifyFullenrichPhones({
      phones: [
        {
          number: "+1 555 123 4567 ext. 1",
          line_type: "MOBILE",
          line_status: "ACTIVE",
        },
        { number: "+1 415 555 0100", line_type: "VOIP", line_status: "ACTIVE" },
      ],
    });
    assert.equal(result.phone, null);
    assert.equal(result.officePhone, "+15551234567 ext. 1");
    assert.equal(result.directPhone, "+14155550100");
  });
});

describe("classifyRawPhone", () => {
  it("routes extension to office", () => {
    assert.deepEqual(classifyRawPhone("+1 555 123 0100 x9"), {
      phone: null,
      directPhone: null,
      officePhone: "+15551230100 ext. 9",
    });
  });
});

describe("normalizeStandardPhone", () => {
  it("matches formatted variants", () => {
    assert.equal(
      normalizeStandardPhone("+1 (555) 123-4567"),
      normalizeStandardPhone("+15551234567"),
    );
  });
});
