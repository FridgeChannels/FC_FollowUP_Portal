import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { queryFollowupClientPages } from "@/lib/notion/client";
import {
  attachBrandReplySignals,
  listBrandReplySignals,
} from "@/lib/notion/brand-reply-signals";
import { listCheckpoints } from "@/lib/notion/cps";
import { mapFollowupClientPages } from "@/lib/notion/followup-clients";
import { ownerPageIdFromQueryParam } from "@/lib/notion/owner-filter";

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
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }

    const ownerParam = new URL(request.url).searchParams.get("owner");
    const ownerPageId = ownerPageIdFromQueryParam(
      viewer.isAdmin,
      viewer.ownerId,
      ownerParam,
    );
    const [cps, pages] = await Promise.all([
      listCheckpoints(),
      queryFollowupClientPages(ownerPageId),
    ]);
    // Skip per-brand full conversation scans — list uses rollup Last Interaction At /
    // Last Reply At. Reply-needed badges still come from Needs Reply query.
    const [mapped, replySignals] = await Promise.all([
      mapFollowupClientPages(pages),
      listBrandReplySignals(pages).catch(() => new Map()),
    ]);
    const brands = attachBrandReplySignals(mapped, replySignals);
    return Response.json({
      brands,
      cps,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
