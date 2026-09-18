import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { syncReplyInbox } from "@/lib/notion/followup-writes";
import { taskQueryForViewer } from "@/lib/notion/owner-filter";
import { DEFAULT_TASK_PAGE_SIZE, listFollowupTasksForViewerPage } from "@/lib/notion/tasks";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({
        tasks: [],
        nextCursor: null,
        hasMore: false,
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }
    const url = new URL(request.url);
    const ownerParam = url.searchParams.get("owner");
    const statusParam = url.searchParams.get("status");
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") || DEFAULT_TASK_PAGE_SIZE);
    const pageSize = Number.isFinite(limitRaw) ? limitRaw : DEFAULT_TASK_PAGE_SIZE;
    const onlyTest = isTestOnlyViewer(viewer);

    const listed = await listFollowupTasksForViewerPage(
      taskQueryForViewer(viewer, ownerParam, statusParam),
      { cursor, pageSize, includeTest: canAccessTestBrands(viewer), onlyTest },
    );
    // List path: annotate open non-Phone only; skip Notion backfill (detail/inbound handle writes).
    const tasks =
      viewer.role === "Caller" ? listed.tasks : await syncReplyInbox(listed.tasks, { backfill: false });
    return Response.json({
      tasks,
      nextCursor: listed.nextCursor,
      hasMore: listed.hasMore,
      pageSize: listed.pageSize,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
