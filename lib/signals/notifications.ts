import { parseTimelineMs } from "../scheduling-engine/calendar.ts";
import type { SignalEvent } from "./model";

export function signalNotificationTime(event: SignalEvent) {
  return event.type === "email" ? event.detectedAt || event.occurredAt
    : event.type === "linkedin" ? event.publishedAt || event.occurredAt
      : event.occurredAt;
}

/** All three signal types remain visible after reading; read state only controls the dot. */
export function buildSignalNotifications(events: SignalEvent[], readIds: string[]) {
  const groups = new Map<string, SignalEvent[]>();
  for (const event of new Map(events.map((item) => [item.id, item])).values()) {
    const key = `${event.type}:${event.signalKey || event.id}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  const read = new Set(readIds);
  const time = (event: SignalEvent) => parseTimelineMs(signalNotificationTime(event)) || 0;
  return [...groups].map(([key, group]) => {
    const ordered = [...group].sort((a, b) => time(b) - time(a) || a.id.localeCompare(b.id));
    const latest = ordered[0];
    const count = ordered.length;
    const subject = latest.subject?.trim();
    const title = latest.type === "sample"
      ? `Sample${latest.sampleId ? ` ${latest.sampleId}` : ""} visited ${count} time${count === 1 ? "" : "s"}`
      : latest.type === "email"
        ? `${subject && subject !== "Subject unavailable" ? subject : "Email"} · ${count} open${count === 1 ? "" : "s"} detected`
        : latest.summary.trim() || "LinkedIn update";
    return {
      key, events: ordered, latest, title,
      timestamp: signalNotificationTime(latest),
      timeLabel: latest.type === "email" ? "Last detected" : latest.type === "linkedin" ? "Published" : "Last activity",
      typeLabel: latest.type === "sample" ? "Sample Tap" : latest.type === "email" ? "Email Open" : "LinkedIn",
      unread: ordered.some((event) => !read.has(event.signalReadId || event.id)),
    };
  }).sort((a, b) => time(b.latest) - time(a.latest) || a.key.localeCompare(b.key));
}
