import assert from "node:assert/strict";
import test from "node:test";
import {
  assertColorPatch,
  notionCheckDecision,
  planMagnetColorChange,
  unexpectedChangedColumns,
} from "./magnet-color-plan.mjs";

test("moves primary into secondary and sets primary to white", () => {
  const plan = planMagnetColorChange({
    primary_color: "\n#F9E8C5",
    secondary_color: "#AB240A ",
    brand_name: "keep",
  });
  assert.equal(plan.action, "update");
  assert.deepEqual(plan.patch, {
    secondary_color: "#F9E8C5",
    primary_color: "#FFFFFF",
  });
  assert.equal(plan.before.primary_color, "\n#F9E8C5");
  assert.equal(plan.before.secondary_color, "#AB240A ");
  assert.deepEqual(Object.keys(plan.patch).sort(), ["primary_color", "secondary_color"]);
  assertColorPatch(plan.patch);
});

test("skips rows whose primary is already white", () => {
  const plan = planMagnetColorChange({
    primary_color: "#ffffff",
    secondary_color: "#374131",
  });
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "primary_already_white");
  assert.equal(plan.patch, null);
});

test("includeAlreadyWhite still only patches the two color columns", () => {
  const plan = planMagnetColorChange(
    { primary_color: "#FFF", secondary_color: "#374131" },
    { includeAlreadyWhite: true },
  );
  assert.equal(plan.action, "update");
  assert.deepEqual(plan.patch, {
    secondary_color: "#FFF",
    primary_color: "#FFFFFF",
  });
});

test("skips a row that is already at the target colors", () => {
  const plan = planMagnetColorChange(
    { primary_color: "#FFFFFF", secondary_color: "#FFFFFF" },
    { includeAlreadyWhite: true },
  );
  assert.equal(plan.action, "skip");
  assert.equal(plan.reason, "already_target");
});

test("null primary becomes a null secondary", () => {
  const plan = planMagnetColorChange({
    primary_color: "  ",
    secondary_color: "#112233",
  });
  assert.equal(plan.action, "update");
  assert.equal(plan.patch.secondary_color, null);
  assert.equal(plan.patch.primary_color, "#FFFFFF");
});

test("checks Notion only after a finished color decision", () => {
  assert.deepEqual(notionCheckDecision(["dry_run"]), { check: true, reason: null });
  assert.deepEqual(notionCheckDecision(["applied", "skip"]), { check: true, reason: null });
  assert.deepEqual(notionCheckDecision(["unmatched"]), { check: false, reason: "not_finished" });
  assert.deepEqual(notionCheckDecision(["applied", "anomaly"]), { check: false, reason: "not_finished" });
});

test("other column changes are reported by name only", () => {
  const before = {
    id: 1,
    magnet_sn: "ABC",
    primary_color: "#111111",
    secondary_color: "#222222",
    pilot_initial_password: "secret",
  };
  const after = {
    ...before,
    primary_color: "#FFFFFF",
    secondary_color: "#111111",
    brand_name: "changed",
  };
  assert.deepEqual(unexpectedChangedColumns(before, after), ["brand_name"]);
});
