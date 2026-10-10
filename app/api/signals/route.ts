import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { canViewBrand } from "@/lib/brand-access";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { aggregateSignals, loadSignalEvents } from "@/lib/signals/data";
import { signalsWritesEnabled } from "@/lib/signals/config";
import { mockSignals } from "@/lib/signals/mock";
import { signalBrands } from "@/lib/signals/brands";
import { summarize, type SignalsPayload } from "@/lib/signals/model";

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
    if (!isSupabaseConfigured())
      return Response.json({
        readOnly: true,
        brands: [],
        sources: {
          sample: "Not connected",
          email: "Not connected",
          linkedin: "Not connected",
        },
        summary: summarize([]),
      } satisfies SignalsPayload);
    const { events, notifications } = await loadSignalEvents();
    const candidates = await signalBrands([
      ...new Set(events.map((e) => e.brandId)),
    ]);
    // Re-evaluate viewer access on every response, including cached CRM projections.
    const brands = candidates
      .filter((brand) => canViewBrand(viewer, brand))
      .map((brand) => aggregateSignals(brand, events, notifications, viewer.ownerId || viewer.email));
    return Response.json(
      {
        readOnly: !signalsWritesEnabled(),
        brands,
        sources: {
          sample: "Connected",
          email: events.some((e) => e.type === "email")
            ? "Connected"
            : "Not connected",
          linkedin: events.some((e) => e.type === "linkedin")
            ? "Connected"
            : "Not connected",
        },
        summary: summarize(brands),
      } satisfies SignalsPayload,
      { headers: { "Cache-Control": "no-store" } },
    );
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
