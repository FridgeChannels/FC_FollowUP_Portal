import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { syncReplyInbox } from "@/lib/notion/followup-writes";
import { taskQueryForViewer } from "@/lib/notion/owner-filter";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import {
  DEFAULT_TASK_PAGE_SIZE,
  listFollowupTasksForViewerPage,
  listOpenPhoneTaskStubsForViewer,
  listOpenReplyTaskStubsForViewer,
  retrieveFollowupTask,
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
      const [phoneStubs, replyStubs] = await Promise.all([
        listOpenPhoneTaskStubsForViewer(query, testScope),
        listOpenReplyTaskStubsForViewer(query, testScope),
      ]);
      const annotatedReplies = await syncReplyInbox(replyStubs, { backfill: false });
      const eligible = [
        ...phoneStubs,
        ...annotatedReplies.filter((task) => task.inboxStatus === "Needs Reply"),
      ].sort(
        (left, right) =>
          (left.scheduledAt || "").localeCompare(right.scheduledAt || "") ||
          left.id.localeCompare(right.id),
      );
      const offset = Math.max(0, Number(cursor || 0) || 0);
      const selected = eligible.slice(offset, offset + pageSize);
      const tasks = await Promise.all(
        selected.map(async (stub) => {
          const task = await retrieveFollowupTask(stub.id).catch(() => stub);
          return {
            ...task,
            inboxStatus: stub.inboxStatus,
            preview: stub.preview,
            lastInboundAt: stub.lastInboundAt,
          };
        }),
      );
      const nextOffset = offset + selected.length;
      const hasMore = nextOffset < eligible.length;
      return Response.json({
        tasks,
        nextCursor: hasMore ? String(nextOffset) : null,
        hasMore,
        pageSize,
        viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
      });
    }

    const listed = await listFollowupTasksForViewerPage(
      query,
      { cursor, pageSize, ...testScope },
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

export function GET(request: Request) {
  return runWithNotionLimit(() => getTasks(request));
}
