import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { taskQueryForViewer } from "@/lib/notion/owner-filter";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import {
  countOpenNeedsReplyTasksForViewer,
  countOpenPhoneBrandsForViewer,
} from "@/lib/notion/tasks";

/** Lightweight ReplyTask menu badge — no full BrandTask mapping. */
async function getTasksSummary(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ openCount: 0 });
    }

    const query = taskQueryForViewer(viewer, null, "open");
    const includeTest = canAccessTestBrands(viewer);
    const onlyTest = isTestOnlyViewer(viewer);
    const testScope = { includeTest, onlyTest };

    // Shared Phone rule: one badge unit per Follow-up Client with an open Phone task.
    // Admin / AccountManager also count Needs Reply rows (Caller queue is Phone-only).
    if (viewer.role === "Caller") {
      const phoneOpenCount = await countOpenPhoneBrandsForViewer(query, testScope);
      return Response.json({ openCount: phoneOpenCount, phoneOpenCount });
    }

    const [phoneOpenCount, needsReplyCount] = await Promise.all([
      countOpenPhoneBrandsForViewer(query, testScope),
      countOpenNeedsReplyTasksForViewer(query, testScope),
    ]);
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

export function GET(request: Request) {
  return runWithNotionLimit(() => getTasksSummary(request));
}
