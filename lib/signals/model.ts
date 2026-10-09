export type SignalType = "sample" | "email" | "linkedin";
export type SignalEvent = {
  id: string;
  brandId: string;
  contactId?: string;
  sampleId?: string;
  conversationId?: string;
  messageId?: string;
  threadId?: string;
  type: SignalType;
  summary: string;
  occurredAt: string;
  detectedAt: string;
  sourceUrl?: string;
  evidence?: string;
  subject?: string;
  publishedAt?: string;
  highPriority: boolean;
};
export type SignalReview = {
  eventIds: string[];
  status: "Reviewed" | "Handled" | "Later";
  taskId?: string;
};
export type SignalBrand = {
  id: string;
  name: string;
  ownerName: string | null;
  currentCp: string;
  events: SignalEvent[];
  readEventIds?: string[];
  reviewedEventIds?: string[];
  unread: boolean;
  needsReview: boolean;
  status: "Needs Review" | SignalReview["status"];
  taskId?: string;
};
export type SignalsPayload = {
  readOnly: boolean;
  brands: SignalBrand[];
  sources: Record<SignalType, "Connected" | "Not connected">;
  summary: { today: number; week: number; needsReview: number; unread: number };
};
export function aggregateBrand(input: {
  id: string;
  name: string;
  ownerName: string | null;
  currentCp: string;
  events: SignalEvent[];
  readIds: string[];
  review?: SignalReview;
}): SignalBrand {
  const events = [
    ...new Map(input.events.map((event) => [event.id, event])).values(),
  ].sort(
    (a, b) =>
      Date.parse(b.occurredAt) - Date.parse(a.occurredAt) ||
      a.id.localeCompare(b.id),
  );
  const read = new Set(input.readIds);
  const reviewed = new Set(input.review?.eventIds || []);
  const needsReview = events.some((event) => !reviewed.has(event.id));
  return {
    id: input.id,
    name: input.name,
    ownerName: input.ownerName,
    currentCp: input.currentCp,
    events,
    readEventIds: [...read],
    reviewedEventIds: [...reviewed],
    unread: events.some((event) => !read.has(event.id)),
    needsReview,
    status: needsReview ? "Needs Review" : input.review?.status || "Reviewed",
    taskId: input.review?.taskId,
  };
}
export function periodStart(period: "today" | "week", now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start.getTime();
}
export function filterQueue(
  brands: SignalBrand[],
  filters: {
    status: "review" | "all";
    time: "today" | "week";
    type: SignalType | "all";
  },
  now = new Date(),
) {
  const start = periodStart(filters.time, now);
  return brands
    .filter(
      (brand) =>
        (filters.status === "all" || brand.needsReview) &&
        brand.events.some(
          (event) =>
            Date.parse(event.occurredAt) >= start &&
            Date.parse(event.occurredAt) <= now.getTime() &&
            (filters.type === "all" || event.type === filters.type),
        ),
    )
    .sort(
      (a, b) =>
        Number(b.needsReview && b.events.some((e) => e.highPriority)) -
          Number(a.needsReview && a.events.some((e) => e.highPriority)) ||
        Date.parse(b.events[0].occurredAt) - Date.parse(a.events[0].occurredAt),
    );
}
export type SignalQueueView = "review" | "today" | "week" | "history";
/** Workspace views keep the pending queue independent of event date. */
export function filterWorkspaceQueue(
  brands: SignalBrand[],
  view: SignalQueueView,
  type: SignalType | "all",
  now = new Date(),
) {
  const start = view === "today" || view === "week" ? periodStart(view, now) : 0;
  return brands
    .filter((brand) =>
      (view !== "review" || brand.needsReview) &&
      (view !== "history" || !brand.needsReview) &&
      brand.events.some((event) =>
        (type === "all" || event.type === type) &&
        (view !== "today" && view !== "week" ||
          Date.parse(event.occurredAt) >= start && Date.parse(event.occurredAt) <= now.getTime()),
      ),
    )
    .sort((a, b) => {
      const matching = (brand: SignalBrand) => {
        const byType = type === "all" ? brand.events : brand.events.filter((event) => event.type === type);
        const pending = brand.needsReview
          ? byType.filter((event) => !brand.reviewedEventIds?.includes(event.id))
          : [];
        return view === "review" && pending.length ? pending : byType;
      };
      const aEvents = matching(a);
      const bEvents = matching(b);
      return Number(b.needsReview && bEvents.some((event) => event.highPriority)) -
        Number(a.needsReview && aEvents.some((event) => event.highPriority)) ||
        Date.parse(bEvents[0].occurredAt) - Date.parse(aEvents[0].occurredAt);
    });
}
export function summarize(brands: SignalBrand[], now = new Date()) {
  const updated = (period: "today" | "week") =>
    brands.filter((brand) =>
      brand.events.some(
        (event) =>
          Date.parse(event.occurredAt) >= periodStart(period, now) &&
          Date.parse(event.occurredAt) <= now.getTime(),
      ),
    ).length;
  return {
    today: updated("today"),
    week: updated("week"),
    needsReview: brands.filter((b) => b.needsReview).length,
    unread: brands.filter((b) => b.unread).length,
  };
}
export function safeSourceUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** A draft, queued message or unfinished / unanswered call is not a completed follow-up. */
export function effectiveFollowup(
  activity: {
    direction: string | null;
    channel: string | null;
    status: string | null;
    callResult: string | null;
    createdAt: string | null;
    recordedAt?: string | null;
    quo?: { call?: { completedAt?: string | null } | null } | null;
  },
  after: number,
) {
  const at = Date.parse(
    activity.quo?.call?.completedAt ||
      activity.recordedAt ||
      activity.createdAt ||
      "",
  );
  if (activity.direction !== "Outbound" || !Number.isFinite(at) || at < after)
    return false;
  if (activity.channel === "Phone")
    return (
      activity.callResult === "Connected" &&
      Boolean(activity.quo?.call?.completedAt)
    );
  return ["Sent", "Delivered"].includes(activity.status || "");
}
