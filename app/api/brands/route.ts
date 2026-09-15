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
    const cps = await listCheckpoints();
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({
        brands: [],
        cps,
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }
    const ownerParam = new URL(request.url).searchParams.get("owner");
    const pages = await queryFollowupClientPages(
      ownerPageIdFromQueryParam(viewer.isAdmin, viewer.ownerId, ownerParam),
    );
    const [mapped, replySignals] = await Promise.all([
      mapFollowupClientPages(pages),
      listBrandReplySignals().catch(() => new Map()),
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
