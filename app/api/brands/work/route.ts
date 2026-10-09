import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listBrandWorkForViewer } from "@/lib/notion/brand-work";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";

export function GET(request: Request) {
  return runWithNotionLimit(async () => {
    try {
      const viewer = await viewerFromRequest(request);
      if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
      if (viewer.role === "Caller") return Response.json({ error: "AM work is unavailable to Callers" }, { status: 403 });
      if (!viewer.isAdmin && !viewer.ownerId) return Response.json({ brands: [], counts: { myWork: 0, newAssignments: 0, replies: 0, callReview: 0 } });
      const payload = await listBrandWorkForViewer({
        // Admins distribute work across the whole portfolio, including brands
        // that have not yet been assigned to an AccountManager.
        ownerPageId: viewer.isAdmin ? undefined : viewer.ownerId,
        includeTest: canAccessTestBrands(viewer),
        onlyTest: isTestOnlyViewer(viewer),
      });
      return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Unable to load work" }, { status: 500 });
    }
  });
}
