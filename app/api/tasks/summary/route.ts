import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { syncReplyInbox } from "@/lib/notion/followup-writes";
import { taskQueryForViewer } from "@/lib/notion/owner-filter";
import {
  countOpenPhoneBrandsForViewer,
  countOpenPhoneTasksForViewer,
  listOpenReplyTaskStubsForViewer,
} from "@/lib/notion/tasks";

/** Lightweight ReplyTask menu badge — no full BrandTask mapping. */
export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ openCount: 0 });
    }

    const query = taskQueryForViewer(viewer, null, "open");

    if (viewer.role === "Caller") {
      // Caller ReplyTask is brand-scoped: one badge unit per Follow-up Client.
      const openCount = await countOpenPhoneBrandsForViewer(query);
      return Response.json({ openCount });
    }

    const [phoneOpenCount, replyStubs] = await Promise.all([
      countOpenPhoneTasksForViewer(query),
      listOpenReplyTaskStubsForViewer(query),
    ]);
    const annotated = await syncReplyInbox(replyStubs, { backfill: false });
    const needsReplyCount = annotated.filter((item) => item.inboxStatus === "Needs Reply").length;
    return Response.json({
      openCount: phoneOpenCount + needsReplyCount,
      phoneOpenCount,
      needsReplyCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
