import { CallerNotionError, type CallerNotionReport } from "./caller-notion";
import { SupabaseError, supabaseSelect, supabaseUpsert } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";

const TABLE = "caller_daily_notion_reports";

type ReportRow = {
  caller_id: string;
  caller_name: string;
  report_date: string;
  notion_page_id: string;
  notion_url: string;
  title: string;
  updated_at: string;
};

function mapError(error: unknown): never {
  if (error instanceof SupabaseError) {
    let detail: { message?: string; code?: string } = {};
    try { detail = JSON.parse(error.body); } catch { /* Keep internals out of client responses. */ }
    if (error.status === 404 || /PGRST202|42P01|42883/.test(detail.code || "")) {
      throw new CallerNotionError("Daily Notion storage is not installed", 503);
    }
    throw new CallerNotionError("Unable to access Daily Notion storage. Please try again.", 503);
  }
  if (error instanceof Error && /SUPABASE_SERVICE_ROLE_KEY is not configured/.test(error.message)) {
    throw new CallerNotionError("Daily Notion storage is not configured", 503);
  }
  throw error;
}

function requireStore() {
  if (!isSupabaseConfigured()) throw new CallerNotionError("Daily Notion storage is not configured", 503);
}

function rowToReport(row: ReportRow): CallerNotionReport {
  return {
    callerId: row.caller_id,
    callerName: row.caller_name,
    date: row.report_date,
    pageId: row.notion_page_id,
    url: row.notion_url,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export async function listCallerDailyNotionReports(callerId: string): Promise<CallerNotionReport[]> {
  requireStore();
  try {
    const rows = await supabaseSelect<ReportRow>(TABLE, {
      select: "caller_id,caller_name,report_date,notion_page_id,notion_url,title,updated_at",
      filters: { caller_id: `eq.${callerId}` },
      order: "report_date.desc",
    });
    return rows.map(rowToReport);
  } catch (error) {
    mapError(error);
  }
}

export async function saveCallerDailyNotionReport(report: CallerNotionReport): Promise<CallerNotionReport> {
  requireStore();
  try {
    const rows = await supabaseUpsert<ReportRow>(TABLE, [{
      caller_id: report.callerId,
      caller_name: report.callerName,
      report_date: report.date,
      notion_page_id: report.pageId,
      notion_url: report.url,
      title: report.title,
      updated_at: report.updatedAt,
    }], "caller_id,report_date");
    const saved = rows[0];
    if (!saved) throw new CallerNotionError("Unable to save Daily Notion link.", 503);
    return rowToReport(saved);
  } catch (error) {
    if (error instanceof CallerNotionError) throw error;
    mapError(error);
  }
}
