import { canViewBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { CallerNotionError } from "@/lib/caller-notion";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { brandCallerNotionReports } from "@/lib/notion/caller-notion";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import { MOCK_CALLER_ID, MOCK_CALLER_NAME, MOCK_PETER_BRAND_ID, mockCallerNotionEnabled, mockCallerNotionReports } from "@/lib/mock-caller-notion";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runWithNotionLimit(async () => {
    try {
      const viewer = await viewerFromRequest(request);
      if (!viewer.email || !viewer.ownerId) throw new CallerNotionError("Sign in required", 401);
      const { id } = await params;
      if (mockCallerNotionEnabled() && id === MOCK_PETER_BRAND_ID) {
        return Response.json({ caller: { id: MOCK_CALLER_ID, name: MOCK_CALLER_NAME }, reports: mockCallerNotionReports(), mock: true }, { headers: { "Cache-Control": "no-store" } });
      }
      const page = await retrievePage(id);
      const brand = await mapFollowupClientPage(page);
      const allowed = canViewBrand(viewer, brand)
        || (viewer.role === "Caller" && canViewBrand(viewer, brand, (await mapFollowupClientDetail(page)).tasks));
      if (!allowed) throw new CallerNotionError("You do not have access to this brand", 403);
      return Response.json(await brandCallerNotionReports(!!brand.isTest), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({ error: error instanceof CallerNotionError ? error.message : "Notion links are temporarily unavailable." }, { status: error instanceof CallerNotionError ? error.status : 503 });
    }
  });
}
