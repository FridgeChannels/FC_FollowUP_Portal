import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSampleVisitDedupeKey,
  deviceIdFromSampleDedupeKey,
  experienceToSampleType,
  formatReferrer,
  normalizeMagnetExperience,
  pathnameForSn,
  sampleTypeToExperience,
} from "./paths.ts";

describe("pathnameForSn", () => {
  it("builds /p/{SN} path", () => {
    assert.equal(pathnameForSn("TGW4K9ZM6G"), "/p/TGW4K9ZM6G");
  });
});

describe("formatReferrer", () => {
  it("maps PostHog direct tokens to Direct", () => {
    assert.equal(formatReferrer("$direct"), "Direct");
    assert.equal(formatReferrer("direct"), "Direct");
    assert.equal(formatReferrer(""), "Direct");
    assert.equal(formatReferrer("https://mail.example.com"), "https://mail.example.com");
  });
});

describe("experience mapping", () => {
  it("normalizes magnet experience values", () => {
    assert.equal(normalizeMagnetExperience("dtc"), "dtc");
    assert.equal(normalizeMagnetExperience("asin_plus"), "asin_plus");
    assert.equal(normalizeMagnetExperience("Amazon"), "asin_plus");
    assert.equal(normalizeMagnetExperience("other"), null);
  });

  it("maps experience <-> sample tab", () => {
    assert.equal(experienceToSampleType("dtc"), "DTC");
    assert.equal(experienceToSampleType("asin_plus"), "Amazon");
    assert.equal(sampleTypeToExperience("DTC"), "dtc");
    assert.equal(sampleTypeToExperience("Amazon"), "asin_plus");
  });
});

describe("buildSampleVisitDedupeKey", () => {
  it("includes sn and device", () => {
    const key = buildSampleVisitDedupeKey({
      sn: "TGW4K9ZM6G",
      deviceId: "dev-1",
      occurredAt: "2026-09-29T01:00:00.000Z",
      windowMinutes: 30,
    });
    assert.match(key, /^sample\.visited:TGW4K9ZM6G:dev-1:/);
  });
});

describe("deviceIdFromSampleDedupeKey", () => {
  it("parses device id from sample.visited keys (dot, not colon, after sample)", () => {
    assert.equal(
      deviceIdFromSampleDedupeKey(
        "sample.visited:P978SGEV0M:01a022cc-b4a0-7a17-9287-242282fc73eb:994815",
      ),
      "01a022cc-b4a0-7a17-9287-242282fc73eb",
    );
  });

  it("returns null for malformed keys", () => {
    assert.equal(deviceIdFromSampleDedupeKey("sample.visited:only-sn"), null);
    assert.equal(deviceIdFromSampleDedupeKey("other:x:y:z"), null);
  });
});
