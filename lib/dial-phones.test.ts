import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dialPhoneOptions, formatDialPhoneSummary, quoDialHref } from "./dial-phones.ts";

describe("dial phone options", () => {
  it("lists Phone, Direct Phone, then Office Phone", () => {
    assert.deepEqual(
      dialPhoneOptions({
        phone: "+1 415 555 0182",
        directPhone: "+1 415 555 0100",
        officePhone: "+1 415 555 0199",
      }),
      [
        { key: "phone", label: "Phone", number: "+1 415 555 0182" },
        { key: "directPhone", label: "Direct Phone", number: "+1 415 555 0100" },
        { key: "officePhone", label: "Office Phone", number: "+1 415 555 0199" },
      ],
    );
  });

  it("skips empty fields and keeps Phone first when present", () => {
    assert.deepEqual(
      dialPhoneOptions({
        phone: "",
        directPhone: "+1 415 555 0100",
        officePhone: "  ",
      }),
      [{ key: "directPhone", label: "Direct Phone", number: "+1 415 555 0100" }],
    );
  });

  it("uses the task fallback only when Phone is missing", () => {
    assert.deepEqual(
      dialPhoneOptions({ directPhone: "+1 415 555 0100" }, "+1 415 555 0182"),
      [
        { key: "phone", label: "Phone", number: "+1 415 555 0182" },
        { key: "directPhone", label: "Direct Phone", number: "+1 415 555 0100" },
      ],
    );
  });

  it("dedupes the same number and keeps the higher-priority label", () => {
    assert.deepEqual(
      dialPhoneOptions({
        phone: "+1 (415) 555-0182",
        directPhone: "14155550182",
        officePhone: "+1 415 555 0199",
      }),
      [
        { key: "phone", label: "Phone", number: "+1 (415) 555-0182" },
        { key: "officePhone", label: "Office Phone", number: "+1 415 555 0199" },
      ],
    );
  });

  it("collapses to the override number used for local Quo testing", () => {
    assert.deepEqual(
      dialPhoneOptions(
        { phone: "+1 415 555 0182", directPhone: "+1 415 555 0100" },
        null,
        "+1 972 900 0833",
      ),
      [{ key: "phone", label: "Phone", number: "+1 972 900 0833" }],
    );
  });

  it("formats a caller-facing summary", () => {
    assert.equal(formatDialPhoneSummary([]), "No phone number");
    assert.equal(
      formatDialPhoneSummary(dialPhoneOptions({
        phone: "+1 415 555 0182",
        officePhone: "+1 415 555 0199",
      })),
      "Phone +1 415 555 0182 · Office Phone +1 415 555 0199",
    );
  });

  it("builds a Quo dial link", () => {
    assert.equal(
      quoDialHref("+1 415 555 0182"),
      "openphone://dial?number=%2B1%20415%20555%200182&action=call",
    );
  });
});
