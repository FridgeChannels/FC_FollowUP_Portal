import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { canWriteBrand } from "@/lib/brand-access";
import { retrievePage } from "@/lib/notion/client";
import {
  mapFollowupClientDetail,
  mapFollowupClientPage,
} from "@/lib/notion/followup-clients";
import { loadSignalEvents, saveSignalSnapshot } from "@/lib/signals/data";
import { signalsWritesEnabled } from "@/lib/signals/config";
import { classifySignalEvents, effectiveFollowup, type SignalReview } from "@/lib/signals/model";

type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!signalsWritesEnabled())
      return Response.json(
        {
          error:
            "Signals is in read-only preview. Review updates are disabled.",
        },
        { status: 423 },
      );
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand))
      return Response.json(
        { error: "You do not have access to this brand" },
        { status: 403 },
      );
    const body = (await request.json()) as {
      action?: string;
      eventIds?: string[];
      taskId?: string;
      activityId?: string;
    };
    if (
      !["read", "review", "later", "handled"].includes(body.action || "") ||
      !Array.isArray(body.eventIds) ||
      !body.eventIds.length ||
      !body.eventIds.every((id) => typeof id === "string")
    )
      return Response.json(
        { error: "A valid action and event snapshot are required" },
        { status: 400 },
      );
    const { events } = await loadSignalEvents(id);
    const allowed = new Set(classifySignalEvents(events).filter((e) => e.isNewSignal).map((e) => e.id));
    if (body.eventIds.some((id) => !allowed.has(id)))
      return Response.json(
        { error: "Signal snapshot is no longer available. Refresh and retry." },
        { status: 409 },
      );
    const review: Omit<SignalReview, "eventIds"> = { status: "Reviewed" };
    if (body.action === "handled") {
      const detail = await mapFollowupClientDetail(page, {
        includeActivities: true,
      });
      const activity = detail.activities.find((a) => a.id === body.activityId);
      const after = Math.max(
        ...events
          .filter((e) => body.eventIds!.includes(e.id))
          .map((e) => Date.parse(e.detectedAt)),
      );
      if (!activity || !effectiveFollowup(activity, after))
        return Response.json(
          {
            error:
              "A successfully sent message or completed connected call is required",
          },
          { status: 409 },
        );
      review.status = "Handled";
    }
    if (body.action === "later") {
      const detail = await mapFollowupClientDetail(page);
      const task = detail.tasks.find(
        (task) =>
          task.id === body.taskId &&
          !["Completed", "Cancelled", "Failed"].includes(task.status || "") &&
          task.scheduledAt &&
          Date.parse(task.scheduledAt) > Date.now(),
      );
      if (!task)
        return Response.json(
          {
            error: "Choose an existing scheduled follow-up task for this brand",
          },
          { status: 400 },
        );
      review.status = "Later";
      review.taskId = task.id;
    }
    await saveSignalSnapshot(
      id,
      viewer.ownerId || viewer.email,
      body.eventIds,
      body.action === "read" ? "read" : "review",
      body.action === "read" ? undefined : review,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to save review",
      },
      { status: 503 },
    );
  }
}
