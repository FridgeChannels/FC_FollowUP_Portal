import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import { computeSignals } from "@/lib/signals/live";
import { mockSignals } from "@/lib/signals/mock";

async function getSignals(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    if (viewer.role === "Caller")
      return Response.json(
        { error: "Signals is available to Account Managers and Admins" },
        { status: 403 },
      );
    const url = new URL(request.url);
    if (process.env.NODE_ENV !== "production" && url.searchParams.get("mock") === "1")
      return Response.json(mockSignals(), {
        headers: { "Cache-Control": "no-store" },
      });
    const payload = await computeSignals(viewer);
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to load signals",
      },
      { status: 503 },
    );
  }
}
export function GET(request: Request) {
  return runWithNotionLimit(() => getSignals(request));
}
