import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { CallerNotionError, reportToday, validReportDate } from "@/lib/caller-notion";
import { getDisplayTimeZone } from "@/lib/display-time";
import { getPortalBaseUrl } from "@/lib/notify/config";
import { listCallerNotionReports, saveCallerNotionReport } from "@/lib/notion/caller-notion";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import { MOCK_CALLER_NAME, mockCallerNotionEnabled, mockCallerNotionReports, saveMockCallerNotionReport } from "@/lib/mock-caller-notion";

/** CSRF check that survives reverse proxies (APISIX/Docker) where request.url is internal. */
function isAllowedRequestOrigin(request: Request, origin: string) {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getPortalBaseUrl()).origin);
  } catch {
    /* ignore bad PORTAL_BASE_URL */
  }
  allowed.add(new URL(request.url).origin);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host")?.trim();
  const proto = (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https").replace(/:$/, "");
  if (forwardedHost) allowed.add(`${proto}://${forwardedHost}`);
  return allowed.has(origin);
}

async function handle(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) throw new CallerNotionError("Sign in required", 401);
    if (viewer.role !== "Caller" || !viewer.ownerId || !viewer.name) throw new CallerNotionError("Only active Callers can manage their daily report.", 403);
    const timeZone = getDisplayTimeZone();
    const today = reportToday(timeZone);
    if (mockCallerNotionEnabled()) {
      if (request.method === "POST") {
        const body = await request.json().catch(() => null) as { date?: unknown; url?: unknown } | null;
        const date = body?.date ?? today;
        if (typeof date !== "string" || !validReportDate(date) || date > today) throw new CallerNotionError("Select today or a valid past date.");
        if (typeof body?.url !== "string" || !body.url.trim()) throw new CallerNotionError("Paste a valid report URL.");
        return Response.json({ report: saveMockCallerNotionReport({ date, url: body.url.trim() }), today, timeZone, callerName: MOCK_CALLER_NAME, mock: true }, { headers: { "Cache-Control": "no-store" } });
      }
      return Response.json({ reports: mockCallerNotionReports(), today, timeZone, callerName: MOCK_CALLER_NAME, mock: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (request.method === "POST") {
      const origin = request.headers.get("origin");
      if (origin && !isAllowedRequestOrigin(request, origin)) throw new CallerNotionError("Invalid request origin", 403);
      const body = await request.json().catch(() => null) as { date?: unknown; url?: unknown } | null;
      const date = body?.date ?? today;
      if (typeof date !== "string" || !validReportDate(date) || date > today) throw new CallerNotionError("Select today or a valid past date.");
      if (typeof body?.url !== "string" || body.url.length > 2000) throw new CallerNotionError("Paste a valid Notion page URL.");
      const report = await saveCallerNotionReport({ callerId: viewer.ownerId, callerName: viewer.name, date, url: body.url });
      return Response.json({ report, today, timeZone }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ reports: await listCallerNotionReports(viewer.ownerId), today, timeZone, callerName: viewer.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof CallerNotionError ? error.message : "Unable to access Notion. Please try again." }, { status: error instanceof CallerNotionError ? error.status : 503 });
  }
}
export function GET(request: Request) { return runWithNotionLimit(() => handle(request)); }
export function POST(request: Request) { return runWithNotionLimit(() => handle(request)); }
