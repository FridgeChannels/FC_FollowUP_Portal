import { canWriteTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { CallReviewError, submitCallReview } from "@/lib/notion/call-review";
import { buildCallerTaskDetailPayload } from "@/lib/notion/task-detail";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (viewer.role !== "Caller") {
      return Response.json({ error: "Only Callers can submit Phone tasks for review" }, { status: 403 });
    }

    const { id } = await params;
    const task = await retrieveFollowupTask(id);
    if (!canWriteTask(viewer, task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }

    const detail = await buildCallerTaskDetailPayload(id);
    const hasConnectedCall = detail.activities.some(
      (activity) => activity.taskId === id
        && activity.channel === "Phone"
        && activity.callResult === "Connected",
    );
    if (!hasConnectedCall) {
      throw new CallReviewError("A connected call is required before submitting for review", 409);
    }

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    await submitCallReview({
      taskId: id,
      callerEmail: viewer.email,
      callerName: viewer.name,
      note: body.note,
    });

    return Response.json(await buildCallerTaskDetailPayload(id));
  } catch (error) {
    if (error instanceof CallReviewError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("Could not find") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
