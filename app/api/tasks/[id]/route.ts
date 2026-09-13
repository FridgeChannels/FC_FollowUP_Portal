import { canViewTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listConversationsByIds } from "@/lib/notion/conversations";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const task = await retrieveFollowupTask(id);
    if (!canViewTask(viewer, task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }
    const activities = await listConversationsByIds(task.conversationIds);
    return Response.json({ task, activities });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
