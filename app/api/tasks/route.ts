import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { syncReplyInbox } from "@/lib/notion/followup-writes";
import { taskQueryForViewer } from "@/lib/notion/owner-filter";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import {
  DEFAULT_TASK_PAGE_SIZE,
  listFollowupTasksForViewerPage,
  listOpenManagerTasksForViewerPage,
} from "@/lib/notion/tasks";

async function getTasks(request: Request) {
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
    const dueFrom = url.searchParams.get("dueFrom");
    const dueTo = url.searchParams.get("dueTo");
    const cursor = url.searchParams.get("cursor");
    const limitRaw = Number(url.searchParams.get("limit") || DEFAULT_TASK_PAGE_SIZE);
    const pageSize = Number.isFinite(limitRaw) ? limitRaw : DEFAULT_TASK_PAGE_SIZE;
    const onlyTest = isTestOnlyViewer(viewer);
    const query = {
      ...taskQueryForViewer(viewer, ownerParam, statusParam),
      dueFrom,
      dueTo,
    };
    const testScope = {
      includeTest: canAccessTestBrands(viewer),
      onlyTest,
    };

    if (viewer.role !== "Caller" && query.statusScope === "open") {
      const listed = await listOpenManagerTasksForViewerPage(query, {
        cursor,
        pageSize,
        ...testScope,
      });
      return Response.json({
        tasks: listed.tasks,
        nextCursor: listed.nextCursor,
        hasMore: listed.hasMore,
        pageSize: listed.pageSize,
        viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
      });
    }

    const listed = await listFollowupTasksForViewerPage(query, {
      cursor,
      pageSize,
      ...testScope,
      // Caller ReplyTask table only needs brand name + task properties — skip Contact/Owner/KeyPerson.
      hydrate: viewer.role === "Caller" ? "caller-list" : "full",
    });
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

export function GET(request: Request) {
  return runWithNotionLimit(() => getTasks(request));
}
