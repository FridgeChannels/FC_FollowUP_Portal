/** Presentation policy only: historical stages remain valid stored data. */
export const VISIBLE_CP_CODES = ["CP1", "CP2", "CP3"] as const;
const PROGRESSION_CP_CODES = ["CP1", "CP2", "CP3"] as const;

/** CP can only move forward; NONE is the neutral state and is always reachable. */
export function isForwardCpTransition(current: string, target: string) {
  if (target === "NONE") return true;
  const currentIndex = PROGRESSION_CP_CODES.indexOf(current as typeof PROGRESSION_CP_CODES[number]);
  const targetIndex = PROGRESSION_CP_CODES.indexOf(target as typeof PROGRESSION_CP_CODES[number]);
  if (targetIndex < 0) return false;
  return current === "NONE" || currentIndex >= 0 && targetIndex >= currentIndex;
}

export function isCpVisible(value?: string | null) {
  return !/\bCP[456]\b/i.test(value || "");
}

export function visibleCpOptions<T extends { name: string }>(options: T[]): T[] {
  return options.filter(option => isCpVisible(option.name));
}

export function cpDisplayText(value?: string | null, fallback = "—") {
  const labels = (value || "").split(",").map(label => label.trim()).filter(label => label && isCpVisible(label));
  return labels.join(", ") || fallback;
}

export function cpHistoryText(value: string) {
  return value.replace(/\bCP[456]\b/gi, "—");
}
