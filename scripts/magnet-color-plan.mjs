/** Pure color-swap plan. Does not touch Notion or Supabase. */

export const TARGET_PRIMARY_COLOR = "#FFFFFF";
export const PATCH_COLUMNS = ["secondary_color", "primary_color"];

export function normalizeColor(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function isWhite(value) {
  const color = normalizeColor(value);
  if (!color) return false;
  const hex = color.toUpperCase();
  return hex === "#FFFFFF" || hex === "#FFF";
}

/**
 * Move the current primary color into secondary, then set primary to #FFFFFF.
 * Rows whose primary is already white are skipped so a second run cannot
 * overwrite a real secondary color with white.
 */
export function planMagnetColorChange(row, options = {}) {
  const includeAlreadyWhite = Boolean(options.includeAlreadyWhite);
  const before = {
    primary_color: row?.primary_color ?? null,
    secondary_color: row?.secondary_color ?? null,
  };
  const nextSecondary = normalizeColor(before.primary_color);
  const after = {
    primary_color: TARGET_PRIMARY_COLOR,
    secondary_color: nextSecondary,
  };

  if (isWhite(before.primary_color) && !includeAlreadyWhite) {
    return {
      action: "skip",
      reason: "primary_already_white",
      before,
      after: null,
      patch: null,
    };
  }

  const samePrimary = normalizeColor(before.primary_color) === after.primary_color;
  const sameSecondary = normalizeColor(before.secondary_color) === after.secondary_color;
  if (samePrimary && sameSecondary) {
    return {
      action: "skip",
      reason: "already_target",
      before,
      after: null,
      patch: null,
    };
  }

  const patch = {
    secondary_color: after.secondary_color,
    primary_color: after.primary_color,
  };
  assertColorPatch(patch);
  return {
    action: "update",
    reason: null,
    before,
    after,
    patch,
  };
}

export function assertColorPatch(patch) {
  const keys = Object.keys(patch || {}).sort();
  const expected = [...PATCH_COLUMNS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`Refusing patch with columns: ${keys.join(",") || "(none)"}`);
  }
}

/**
 * Check the Notion row only after every matched magnet row finished.
 * Unmatched and anomaly rows stay unchecked so they can be retried.
 */
export function notionCheckDecision(actions) {
  if (!actions.length) return { check: false, reason: "empty" };
  if (actions.some((action) => action === "unmatched" || action === "anomaly")) {
    return { check: false, reason: "not_finished" };
  }
  const finished = actions.every((action) => action === "dry_run" || action === "applied" || action === "skip");
  return finished ? { check: true, reason: null } : { check: false, reason: "not_finished" };
}

/** Column names whose values differ. Values are not returned. */
export function changedColumnNames(beforeRow, afterRow) {
  const keys = new Set([...Object.keys(beforeRow || {}), ...Object.keys(afterRow || {})]);
  const changed = [];
  for (const key of keys) {
    if (stableValue(beforeRow?.[key]) !== stableValue(afterRow?.[key])) changed.push(key);
  }
  return changed.sort();
}

export function unexpectedChangedColumns(beforeRow, afterRow) {
  return changedColumnNames(beforeRow, afterRow).filter((key) => !PATCH_COLUMNS.includes(key));
}

function stableValue(value) {
  return JSON.stringify(value ?? null);
}
