import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listLinkedExhibitionOptions } from "@/lib/notion/exhibition-options";
import { EXHIBITION_OPTIONS_CACHE_MS } from "@/lib/notion/exhibition-options-cache";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";

async function getExhibitionOptions(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!viewer.isAdmin && !viewer.ownerId) {
    return Response.json({ exhibitions: [], cacheTtlMs: EXHIBITION_OPTIONS_CACHE_MS });
  }

  const exhibitions = await listLinkedExhibitionOptions({
    ownerPageId: viewer.isAdmin ? undefined : viewer.ownerId,
    includeTest: canAccessTestBrands(viewer),
    onlyTest: isTestOnlyViewer(viewer),
  });

  return Response.json({
    exhibitions,
    cacheTtlMs: EXHIBITION_OPTIONS_CACHE_MS,
  });
}

export function GET(request: Request) {
  return runWithNotionLimit(() => getExhibitionOptions(request));
}
