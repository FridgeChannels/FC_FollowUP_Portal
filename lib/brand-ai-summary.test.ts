import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBrandAiSummaryStore,
  putBrandAiSummary,
  stringifyBrandAiSummaryStore,
  summaryForScope,
} from "./brand-ai-summary.ts";

const overall = {
  content: "Overall progress",
  generatedAt: "2026-10-13T10:00:00.000Z",
  generatedBy: "Admin",
  dataAsOf: "2026-10-13T10:00:00.000Z",
};

test("stores and restores an overall summary", () => {
  const raw = stringifyBrandAiSummaryStore(putBrandAiSummary({}, "overall", overall));
  assert.deepEqual(summaryForScope(parseBrandAiSummaryStore(raw), "overall"), overall);
});

test("keeps summaries separated by AM", () => {
  const first = putBrandAiSummary({}, "am", { ...overall, amId: "am-one", amName: "Ada" });
  const store = putBrandAiSummary(first, "am", { ...overall, amId: "am-two", amName: "Bo" });
  assert.equal(summaryForScope(store, "am", "am-one")?.amName, "Ada");
  assert.equal(summaryForScope(store, "am", "am-two")?.amName, "Bo");
});

test("keeps overall and AM progress when initialized together", () => {
  const store = putBrandAiSummary(
    putBrandAiSummary({}, "overall", overall),
    "am",
    { ...overall, amId: "am-one", amName: "Ada" },
  );
  assert.equal(summaryForScope(store, "overall")?.content, "Overall progress");
  assert.equal(summaryForScope(store, "am", "am-one")?.amName, "Ada");
});

test("ignores malformed stored values", () => {
  assert.deepEqual(parseBrandAiSummaryStore("not-json"), {});
  assert.deepEqual(parseBrandAiSummaryStore('{"overall":{"content":true}}'), {});
});
