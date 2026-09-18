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
    const body = (await request.json().catch(() => ({}))) as { note?: string; callId?: string };
    const selectedCallId = body.callId?.trim();
    if (!selectedCallId) {
      throw new CallReviewError("Select one call to submit for review", 400);
    }
    const selectedCall = phoneActivities.find((activity) => activity.quo?.callId === selectedCallId);
    if (
      !selectedCall
      || (selectedCall.taskId && !sameNotionId(selectedCall.taskId, id))
    ) {
      throw new CallReviewError("The selected call is not part of this Phone task", 400);
    }
    if (selectedCall.callResult !== "Connected") {
      throw new CallReviewError("A connected call is required before submitting for review", 409);
    }
    const callIds = [...new Set(
      phoneActivities.map((item) => item.quo?.callId).filter((id): id is string => !!id),
    )];
    await submitCallReview({
      taskId: id,
      callerEmail: viewer.email,
      callerName: viewer.name,
      note: body.note,
      callIds,
      selectedCallId,
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
