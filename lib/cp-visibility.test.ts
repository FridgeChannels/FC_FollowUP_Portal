import { test } from "node:test";
import assert from "node:assert/strict";
import { cpDisplayText, cpHistoryText, isCpVisible, visibleCpOptions, VISIBLE_CP_CODES } from "./cp-visibility.ts";
import { listVisibleCurrentCps, listVisibleApplicableCps, parseCurrentCp, currentCpSelect } from "./brand-list.ts";
import { VISIBLE_STAGES } from "./performance/data.ts";

test("all UI stage catalogs omit later CPs while retaining the visible stages", () => {
  assert.deepEqual(VISIBLE_CP_CODES, ["CP1", "CP2", "CP3"]);
  assert.deepEqual(VISIBLE_STAGES, ["CP0", "CP1", "CP2", "CP3", "Nurture"]);
  assert.deepEqual(listVisibleCurrentCps().map(cp => cp.name), ["NONE", "CP1", "CP2", "CP3", "Nurture"]);
  assert.deepEqual(listVisibleApplicableCps().map(cp => cp.name), ["CP1", "CP2", "CP3"]);
});

test("remote option filtering preserves actual IDs and does not mutate cached records", () => {
  const remote = [{ id: "notion-1", name: "CP1" }, { id: "notion-4", name: "CP4 - Plan Confirmed" }, { id: "notion-5", name: "cp5" }, { id: "notion-6", name: "CP6" }, { id: "nurture", name: "Nurture" }];
  assert.deepEqual(visibleCpOptions(remote).map(cp => cp.id), ["notion-1", "nurture"]);
  assert.equal(remote.length, 5);
});

test("historical labels and multi-stage template badges never expose hidden CPs", () => {
  assert.equal(cpDisplayText("CP4"), "—");
  assert.equal(cpDisplayText("CP4, CP2, CP6"), "CP2");
  assert.equal(cpDisplayText("CP5 - Fulfillment Delivered", ""), "");
  assert.equal(cpHistoryText("CP3 → CP4"), "CP3 → —");
  assert.equal(cpHistoryText("CP5 → CP6"), "— → —");
  assert.equal(isCpVisible("CP3"), true);
});

test("presentation filtering does not rewrite historical data or backend stage validation", () => {
  for (const cp of ["CP4", "CP5", "CP6"] as const) {
    assert.equal(parseCurrentCp(cp), cp);
    assert.deepEqual(currentCpSelect(cp), { select: { name: cp } });
  }
});
