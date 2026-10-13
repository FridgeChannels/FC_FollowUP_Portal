type DatedCall = { createdAt: string; recordedAt?: string; quo?: { call?: { createdAt?: string | null } | null } | null };

/** Quo started-at is authoritative; never use a task schedule or sync creation date. */
export function phoneCallOccurredAt(item: DatedCall) {
  const candidates = item.quo ? [item.quo.call?.createdAt, item.recordedAt] : [item.recordedAt, item.createdAt];
  return candidates.find((value) => value && Number.isFinite(Date.parse(value))) || "";
}

export type PhoneCallDay<T> = {
  key: string;
  label: string;
  weekday: string;
  items: T[];
};

function timestamp(value: string) {
  return value.trim() ? Date.parse(value) : NaN;
}

/** Group in the display timezone, with newest dates/calls first and undated calls last. */
export function groupPhoneCallsByDay<T extends DatedCall>(items: T[], timeZone: string): PhoneCallDay<T>[] {
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const groups = new Map<string, PhoneCallDay<T>>();
  const sorted = [...items].sort((a, b) => {
    const left = timestamp(phoneCallOccurredAt(a));
    const right = timestamp(phoneCallOccurredAt(b));
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
    if (!Number.isFinite(right)) return -1;
    return right - left;
  });
  for (const item of sorted) {
    const parsed = timestamp(phoneCallOccurredAt(item));
    const parts = Number.isFinite(parsed) ? dayFormatter.formatToParts(new Date(parsed)) : [];
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
    const key = parts.length ? `${part("year")}-${part("month")}-${part("day")}` : "unknown";
    const group = groups.get(key) || { key, label: parts.length ? key : "Unknown date", weekday: part("weekday"), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function formatPhoneCallTime(value: string, timeZone: string) {
  const parsed = timestamp(value);
  if (!Number.isFinite(parsed)) return value || "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  }).format(new Date(parsed));
}
