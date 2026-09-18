import { canWriteTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { CallReviewError, submitCallReview } from "@/lib/notion/call-review";
import { listConversationsByIds } from "@/lib/notion/conversations";
import { buildCallerTaskDetailPayload } from "@/lib/notion/task-detail";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

function sameNotionId(left?: string | null, right?: string | null) {
  if (!left || !right) return false;
  return left.replace(/-/g, "").toLowerCase() === right.replace(/-/g, "").toLowerCase();
}

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

    // Lightweight Connected check: only this task's linked conversations.
    // (Previously loaded the full brand Caller payload twice — very slow on Notion.)
    const phoneActivities = await listConversationsByIds(task.conversationIds);
    const hasConnectedCall = phoneActivities.some(
      (activity) =>
        activity.channel === "Phone"
        && activity.callResult === "Connected"
        && (!activity.taskId || sameNotionId(activity.taskId, id)),
    );
    if (!hasConnectedCall) {
      throw new CallReviewError("A connected call is required before submitting for review", 409);
    }

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const callIds = [...new Set(
      phoneActivities.map((item) => item.quo?.callId).filter((id): id is string => !!id),
    )];
    await submitCallReview({
      taskId: id,
      callerEmail: viewer.email,
      callerName: viewer.name,
      note: body.note,
      callIds,
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
