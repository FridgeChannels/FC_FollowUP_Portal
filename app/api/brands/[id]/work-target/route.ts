import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { listConversationsByIds } from "@/lib/notion/conversations";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };
const key = (id: string) => id.replace(/-/g, "").toLowerCase();

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (viewer.role === "Caller") return Response.json({ error: "AM work is unavailable to Callers" }, { status: 403 });
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) return Response.json({ error: "No access to this brand" }, { status: 403 });
    const url = new URL(request.url);
    const replyId = url.searchParams.get("replyId");
    const taskId = url.searchParams.get("taskId");
    let activity;
    let reviewTask;
    if (replyId) {
      activity = (await listConversationsByIds([replyId]))[0];
      if (activity?.direction !== "Inbound" || activity.replyStatus !== "Needs Reply") activity = undefined;
    } else if (taskId) {
      const task = await retrieveFollowupTask(taskId);
      if (task.channel !== "Phone" || task.callReviewStatus !== "Awaiting Review" || key(task.brandId || "") !== key(id)) {
        return Response.json({ error: "Call is no longer awaiting review" }, { status: 404 });
      }
      const round = [...(task.callReviewHistory || [])].reverse().find((item) => item.status === "Awaiting Review" && item.submittedAt && item.callIds.length);
      if (!round) return Response.json({ error: "Submitted call not found" }, { status: 404 });
      const activities = await listConversationsByIds(task.conversationIds);
      activity = activities.find((item) => item.quo?.callId && round.callIds.includes(item.quo.callId)) || activities.find((item) => item.channel === "Phone" && item.quo);
      reviewTask = task;
    }
    if (!activity) return Response.json({ error: "Work item not found" }, { status: 404 });
    if (activity.brandId && key(activity.brandId) !== key(id)) return Response.json({ error: "Work item not found" }, { status: 404 });
    if (!activity.brandId) {
      const contacts = await listFollowupContactIds(id, relationIds(page.properties?.["Follow-up Contacts"]));
      if (!activity.contactId || !contacts.some((contactId) => key(contactId) === key(activity.contactId!))) {
        return Response.json({ error: "Work item not found" }, { status: 404 });
      }
    }
    return Response.json({ activity, task: reviewTask }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to open work" }, { status: 500 });
  }
}
