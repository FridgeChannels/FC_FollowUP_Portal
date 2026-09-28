import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { invalidateAllPortalCaches } from "@/lib/notion/portal-caches";

/** Admin-only: flush long-lived Portal Notion caches (exhibition options, reply signals, …). */
export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin) {
      return Response.json({ error: "Only Admin can clear portal caches" }, { status: 403 });
    }

    invalidateAllPortalCaches();
    return Response.json({ ok: true, clearedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
