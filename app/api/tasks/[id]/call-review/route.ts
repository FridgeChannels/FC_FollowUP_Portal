import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { applyCallReview, CallReviewError, type CallReviewStatus } from "@/lib/notion/call-review";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (viewer.role === "Caller") {
      return Response.json({ error: "Callers cannot review Phone tasks" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json()) as { status?: CallReviewStatus; reviewReason?: string; reviewNote?: string };
    if (body.status !== "Qualified" && body.status !== "Unqualified") {
      return Response.json({ error: "status must be Qualified or Unqualified" }, { status: 400 });
    }

    const task = await retrieveFollowupTask(id);
    if (!task.brandId) {
      return Response.json({ error: "Phone task is missing Follow-up Client" }, { status: 422 });
    }
    const brand = await mapFollowupClientPage(await retrievePage(task.brandId));
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const updated = await applyCallReview({
      taskId: id,
      status: body.status,
      reviewerEmail: viewer.email,
      reviewerName: viewer.name,
      reviewReason: body.reviewReason,
      reviewNote: body.reviewNote,
    });
    return Response.json({ task: updated });
  } catch (error) {
    if (error instanceof CallReviewError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("Could not find") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
