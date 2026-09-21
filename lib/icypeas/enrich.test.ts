import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffEnrichment,
  icypeasNamePayload,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  splitPersonName,
} from "./enrich.ts";
import {
  ICYPEAS_CREDITS_EXHAUSTED_MESSAGE,
  IcypeasError,
  mapIcypeasError,
  pickBestEmail,
} from "./helpers.ts";

describe("splitPersonName", () => {
  it("splits first and last", () => {
    assert.deepEqual(splitPersonName("Amy Chen"), {
      firstname: "Amy",
      lastname: "Chen",
    });
  });

  it("keeps multi-word last names", () => {
    assert.deepEqual(splitPersonName("Alexandra Seilis Van"), {
      firstname: "Alexandra",
      lastname: "Seilis Van",
    });
  });

  it("handles single token", () => {
    assert.deepEqual(splitPersonName("Madonna"), {
      firstname: "Madonna",
      lastname: "",
    });
  });
});

describe("icypeasNamePayload", () => {
  it("keeps empty lastname for email mode on single token", () => {
    assert.deepEqual(icypeasNamePayload("Amy", "email"), {
      firstname: "Amy",
      lastname: "",
    });
  });

  it("duplicates single token for profile mode", () => {
    assert.deepEqual(icypeasNamePayload("Amy", "profile"), {
      firstname: "Amy",
      lastname: "Amy",
    });
  });
});

describe("diffEnrichment", () => {
  it("auto-applies empty fields", () => {
    const result = diffEnrichment(
      { email: null, phone: null, linkedin: null },
      {
        email: "a@acme.com",
        phone: "+1 415 555 0100",
        linkedin: "https://linkedin.com/in/amy",
      },
    );
    assert.deepEqual(result.applied, {
      email: "a@acme.com",
      phone: "+1 415 555 0100",
      linkedin: "https://linkedin.com/in/amy",
    });
    assert.equal(result.conflicts.length, 0);
  });

  it("skips normalized equals", () => {
    const result = diffEnrichment(
      {
        email: "Amy@Acme.com",
        phone: "+1 (415) 555-0100",
        linkedin: "https://www.linkedin.com/in/amy-chen/",
      },
      {
        email: "amy@acme.com",
        phone: "14155550100",
        linkedin: "linkedin.com/in/amy-chen",
      },
    );
    assert.deepEqual(result.applied, {});
    assert.deepEqual(result.unchanged.sort(), ["email", "linkedin", "phone"]);
    assert.equal(result.conflicts.length, 0);
  });

  it("returns conflicts without overwriting", () => {
    const result = diffEnrichment(
      { email: "old@acme.com", phone: "+1 111", linkedin: "https://linkedin.com/in/old" },
      { email: "new@acme.com", phone: "+1 222", linkedin: "https://linkedin.com/in/new" },
    );
    assert.deepEqual(result.applied, {});
    assert.equal(result.conflicts.length, 3);
    assert.deepEqual(
      result.conflicts.map((item) => item.field).sort(),
      ["email", "linkedin", "phone"],
    );
  });

  it("marks missing proposed fields as notFound", () => {
    const result = diffEnrichment(
      { email: null, phone: "1", linkedin: null },
      { email: null, phone: null, linkedin: null },
    );
    assert.deepEqual(result.notFound.sort(), [
      "directPhone",
      "email",
      "linkedin",
      "officePhone",
      "phone",
      "whatsapp",
    ]);
  });
});

describe("normalizers", () => {
  it("normalizes email phone linkedin", () => {
    assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
    assert.equal(normalizePhone("+1 (415) 555-0199"), "14155550199");
    assert.equal(
      normalizeLinkedin("https://www.linkedin.com/in/Amy-Chen/?utm=1"),
      "amy-chen",
    );
  });
});

describe("pickBestEmail", () => {
  it("prefers ultra_sure", () => {
    assert.equal(
      pickBestEmail([
        { email: "a@x.com", certainty: "probable" },
        { email: "b@x.com", certainty: "ultra_sure" },
      ]),
      "b@x.com",
    );
  });
});

describe("mapIcypeasError", () => {
  it("maps credits exhausted", () => {
    const mapped = mapIcypeasError(
      new IcypeasError(ICYPEAS_CREDITS_EXHAUSTED_MESSAGE, "insufficient_credits", true),
    );
    assert.equal(mapped.message, ICYPEAS_CREDITS_EXHAUSTED_MESSAGE);
    assert.equal(mapped.creditsExhausted, true);
  });

  it("maps message containing insufficient credits", () => {
    const mapped = mapIcypeasError(new Error("insufficient_credits"));
    assert.equal(mapped.message, ICYPEAS_CREDITS_EXHAUSTED_MESSAGE);
    assert.equal(mapped.creditsExhausted, true);
  });
});
