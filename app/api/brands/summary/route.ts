import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { countNeedsReplyBrandsForViewer } from "@/lib/notion/followup-clients";

/** Lightweight Brands menu badge — Needs Reply brands, deduped by Follow-up Client. */
export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ needsReplyBrandCount: 0 });
    }

    const needsReplyBrandCount = await countNeedsReplyBrandsForViewer({
      // Admin: all owners. AccountManager: own portfolio only.
      ownerPageId: viewer.isAdmin ? undefined : viewer.ownerId,
      includeTest: canAccessTestBrands(viewer),
      onlyTest: isTestOnlyViewer(viewer),
      // Align with Brands list visibility for non-Admin.
      excludeStatuses: viewer.isAdmin ? undefined : ["Paused", "Completed"],
    });

    return Response.json({ needsReplyBrandCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
