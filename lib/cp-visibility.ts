/** Presentation policy only: historical stages remain valid stored data. */
export const VISIBLE_CP_CODES = ["CP1", "CP2", "CP3"] as const;

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
