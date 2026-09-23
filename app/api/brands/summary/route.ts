import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { countNeedsReplyBrandsForViewer } from "@/lib/notion/followup-clients";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";

/** Lightweight Brands menu badge — Needs Reply brands, deduped by Follow-up Client. */
async function getBrandsSummary(request: Request) {
  const traceId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  try {
    const viewerStartedAt = Date.now();
    const viewer = await viewerFromRequest(request);
    console.info("[brands/summary] phase", {
      traceId,
      phase: "viewer",
      durationMs: Date.now() - viewerStartedAt,
    });
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ needsReplyBrandCount: 0 });
    }

    const countStartedAt = Date.now();
    const needsReplyBrandCount = await countNeedsReplyBrandsForViewer({
      // Admin: all owners. AccountManager: own portfolio only.
      ownerPageId: viewer.isAdmin ? undefined : viewer.ownerId,
      includeTest: canAccessTestBrands(viewer),
      onlyTest: isTestOnlyViewer(viewer),
      // Align with Brands list visibility for non-Admin.
      excludeStatuses: viewer.isAdmin ? undefined : ["Paused", "Completed"],
    });
    console.info("[brands/summary] phase", {
      traceId,
      phase: "count",
      durationMs: Date.now() - countStartedAt,
      count: needsReplyBrandCount,
    });
    console.info("[brands/summary] request complete", {
      traceId,
      durationMs: Date.now() - requestStartedAt,
    });

    return Response.json({ needsReplyBrandCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export function GET(request: Request) {
  return runWithNotionLimit(() => getBrandsSummary(request));
}
