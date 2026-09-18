import { canAccessTestBrands } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listCheckpoints } from "@/lib/notion/cps";
import { listFollowupClientsForViewerPage } from "@/lib/notion/followup-clients";
import {
  DEFAULT_BRAND_PAGE_SIZE,
  ownerPageIdFromQueryParam,
} from "@/lib/notion/owner-filter";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      const cps = await listCheckpoints();
      return Response.json({
        brands: [],
        cps,
        pageSize: DEFAULT_BRAND_PAGE_SIZE,
        nextCursor: null,
        hasMore: false,
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }

    const url = new URL(request.url);
    const ownerParam = url.searchParams.get("owner");
    const statusParam = url.searchParams.get("status");
    const cpParam = url.searchParams.get("cp");
    const qParam = url.searchParams.get("q");
    const replyFrom = url.searchParams.get("replyFrom");
    const replyTo = url.searchParams.get("replyTo");
    const cursor = url.searchParams.get("cursor");

    const ownerPageId = ownerPageIdFromQueryParam(
      viewer.isAdmin,
      viewer.ownerId,
      ownerParam,
    );

    const status = viewer.isAdmin ? statusParam : "all";
    const excludeStatuses = viewer.isAdmin ? undefined : ["Paused", "Completed"];

    const [cps, listed] = await Promise.all([
      listCheckpoints(),
      listFollowupClientsForViewerPage({
        ownerPageId,
        includeTest: canAccessTestBrands(viewer),
        status,
        excludeStatuses,
        q: qParam,
        cp: cpParam,
        replyFrom,
        replyTo,
        cursor,
        pageSize: DEFAULT_BRAND_PAGE_SIZE,
      }),
    ]);

    return Response.json({
      brands: listed.brands,
      cps,
      pageSize: listed.pageSize,
      nextCursor: listed.nextCursor,
      hasMore: listed.hasMore,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
