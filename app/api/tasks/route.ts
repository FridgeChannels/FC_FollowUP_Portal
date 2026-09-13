import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listFollowupTasksForViewer } from "@/lib/notion/tasks";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ tasks: [], viewer: { isAdmin: false, ownerName: viewer.name } });
    }
    const tasks = await listFollowupTasksForViewer(
      viewer.isAdmin ? undefined : viewer.ownerId || undefined,
    );
    return Response.json({
      tasks,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
