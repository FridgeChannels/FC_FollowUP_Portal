import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FULLENRICH_CREDITS_EXHAUSTED_MESSAGE,
  FullenrichError,
  domainFromEmail,
  mapFullenrichError,
  pickBestPhone,
} from "./helpers.ts";

describe("pickBestPhone", () => {
  it("prefers most_probable_phone", () => {
    assert.equal(
      pickBestPhone({
        mostProbable: { number: "+1 555 123 0100", line_type: "MOBILE" },
        phones: [
          {
            number: "+1 555 999 8888",
            line_type: "MOBILE",
            line_status: "ACTIVE",
          },
        ],
      }),
      "+15551230100",
    );
  });

  it("ranks mobile active when no most_probable", () => {
    assert.equal(
      pickBestPhone({
        phones: [
          {
            number: "+1 415 555 0100",
            line_type: "LANDLINE",
            line_status: "ACTIVE",
          },
          {
            number: "+1 415 555 0199",
            line_type: "MOBILE",
            line_status: "ACTIVE",
          },
        ],
      }),
      "+14155550199",
    );
  });
});

describe("domainFromEmail", () => {
  it("extracts domain", () => {
    assert.equal(domainFromEmail("amy@Acme.com"), "acme.com");
  });
});

describe("mapFullenrichError", () => {
  it("maps credits exhausted", () => {
    const mapped = mapFullenrichError(
      new FullenrichError(FULLENRICH_CREDITS_EXHAUSTED_MESSAGE, "CREDITS_INSUFFICIENT", true),
    );
    assert.equal(mapped.message, FULLENRICH_CREDITS_EXHAUSTED_MESSAGE);
    assert.equal(mapped.creditsExhausted, true);
  });
});
