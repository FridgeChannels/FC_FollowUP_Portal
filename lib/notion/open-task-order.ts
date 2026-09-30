import type { BrandTask } from "../brand-list.ts";

export function compareOpenTaskOrder(left: BrandTask, right: BrandTask) {
  return (
    (left.scheduledAt || "").localeCompare(right.scheduledAt || "") ||
    left.id.localeCompare(right.id)
  );
}

/** Stable merge of two Scheduled-At-sorted open-task stub lists. */
export function mergeOpenTaskStubs(phone: BrandTask[], replies: BrandTask[]) {
  const left = [...phone].sort(compareOpenTaskOrder);
  const right = [...replies].sort(compareOpenTaskOrder);
  const merged: BrandTask[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compareOpenTaskOrder(left[i], right[j]) <= 0) {
      merged.push(left[i]);
      i += 1;
    } else {
      merged.push(right[j]);
      j += 1;
    }
  }
  while (i < left.length) {
    merged.push(left[i]);
    i += 1;
  }
  while (j < right.length) {
    merged.push(right[j]);
    j += 1;
  }
  return merged;
}
