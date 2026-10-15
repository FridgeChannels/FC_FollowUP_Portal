import type { SignalBrand, SignalType } from "./model";

function eventTime(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** One row per brand, showing and sorting by its latest matching event. */
export function buildSignalQueue(brands: SignalBrand[], type: SignalType | "all") {
  const unique = new Map<string, SignalBrand>();
  for (const brand of brands) {
    const key = brand.id.replace(/-/g, "").toLowerCase();
    const previous = unique.get(key);
    unique.set(key, previous ? {
      ...previous,
      events: [...new Map([...previous.events, ...brand.events].map((event) => [event.id, event])).values()],
      readEventIds: [...new Set([...(previous.readEventIds || []), ...(brand.readEventIds || [])])],
      newEventIds: [...new Set([
        ...(previous.newEventIds || previous.events.filter((event) => event.isNewSignal).map((event) => event.id)),
        ...(brand.newEventIds || brand.events.filter((event) => event.isNewSignal).map((event) => event.id)),
      ])],
      unread: previous.unread || brand.unread,
    } : brand);
  }
  return [...unique.values()].flatMap((brand) => {
    const latest = brand.events
      .filter((event) => type === "all" || event.type === type)
      .sort((left, right) => eventTime(right.occurredAt) - eventTime(left.occurredAt) || left.id.localeCompare(right.id))[0];
    return latest ? [{ brand, latest }] : [];
  }).sort((left, right) =>
    eventTime(right.latest.occurredAt) - eventTime(left.latest.occurredAt) || left.brand.id.localeCompare(right.brand.id),
  );
}
