import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { syncReplyInbox } from "@/lib/notion/followup-writes";
import { listFollowupTasksForViewer } from "@/lib/notion/tasks";
import { listMockCallerTasks } from "@/lib/mock-caller-tasks";
import { getCallerEmails } from "@/lib/notion/config";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (getCallerEmails().has(viewer.email)) {
      return Response.json({
        tasks: listMockCallerTasks(viewer.email),
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ tasks: [], viewer: { isAdmin: false, ownerName: viewer.name } });
    }
    const listed = await listFollowupTasksForViewer(
      viewer.isAdmin ? undefined : viewer.ownerId || undefined,
    );
    const tasks = await syncReplyInbox(listed);
    return Response.json({
      tasks,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
