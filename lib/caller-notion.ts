/** A daily link belongs to an OwnerDB caller, never the person viewing a brand. */
export type CallerNotionReport = {
  callerId: string;
  callerName: string;
  date: string;
  pageId: string;
  url: string;
  title: string;
  updatedAt: string;
};

export class CallerNotionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validReportDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function reportToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function notionReportPageId(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new CallerNotionError("Paste a valid Notion page URL."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !(host === "notion.com" || host.endsWith(".notion.com") || host === "notion.so" || host.endsWith(".notion.so") || host === "notion.site" || host.endsWith(".notion.site"))) {
    throw new CallerNotionError("Use an https:// Notion page link (notion.so, notion.com or notion.site).");
  }
  const match = url.pathname.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i);
  if (!match) throw new CallerNotionError("Copy the full Notion page link, including its page ID.");
  return match[1].replace(/-/g, "").toLowerCase();
}

export type ReportBookmark = {
  id: string;
  type?: string;
  archived?: boolean;
  last_edited_time?: string;
  bookmark?: { url?: string; caption?: Array<{ plain_text?: string; text?: { content?: string } }> };
};

const MARKER = "SFU daily report · ";
export function reportCaption(report: CallerNotionReport) {
  return MARKER + JSON.stringify(report);
}

export function readReportBookmark(block: ReportBookmark, callerId: string): CallerNotionReport | null {
  if (block.archived || block.type !== "bookmark") return null;
  const text = block.bookmark?.caption?.map((part) => part.plain_text ?? part.text?.content ?? "").join("") || "";
  if (!text.startsWith(MARKER)) return null;
  try {
    const data = JSON.parse(text.slice(MARKER.length)) as CallerNotionReport;
    if (data.callerId !== callerId || !validReportDate(data.date)
      || typeof data.title !== "string" || typeof data.callerName !== "string"
      || !Number.isFinite(Date.parse(data.updatedAt))
      || notionReportPageId(data.url) !== data.pageId
      || block.bookmark?.url !== data.url) return null;
    return data;
  } catch { return null; }
}

/** Concurrent submissions remain durable; newest registration wins per civil day. */
export function reportsFromBookmarks(blocks: ReportBookmark[], callerId: string) {
  const reports = new Map<string, CallerNotionReport>();
  for (const block of blocks) {
    const report = readReportBookmark(block, callerId);
    if (!report) continue;
    const previous = reports.get(report.date);
    if (!previous || report.updatedAt >= previous.updatedAt) reports.set(report.date, report);
  }
  return [...reports.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Validate the selected date and URL, then persist without reading the linked page. */
export async function registerCallerReport(
  input: { callerId: string; callerName: string; date: string; url: string },
  store: {
    save: (report: CallerNotionReport) => Promise<CallerNotionReport | void>;
    now?: () => Date;
  },
) {
  if (!validReportDate(input.date)) throw new CallerNotionError("Select a valid report date.");
  const pageId = notionReportPageId(input.url);
  const dateLabel = `${input.date.slice(5, 7)}-${input.date.slice(8, 10)}-${input.date.slice(0, 4)}`;
  const report: CallerNotionReport = {
    callerId: input.callerId, callerName: input.callerName, date: input.date,
    pageId, title: `Daily report · ${dateLabel}`, url: `https://www.notion.so/${pageId}`, updatedAt: (store.now?.() || new Date()).toISOString(),
  };
  return (await store.save(report)) || report;
}
