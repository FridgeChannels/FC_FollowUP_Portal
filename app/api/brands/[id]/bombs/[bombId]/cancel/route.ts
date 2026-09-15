import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { cancelOpenBombTasks } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string; bombId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });

    const { id, bombId } = await params;
    const body = (await request.json()) as { contactId?: string };
    if (!body.contactId) return Response.json({ error: "A KeyPerson is required" }, { status: 400 });

    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) return Response.json({ error: "You do not have access to this brand" }, { status: 403 });

    const detail = await mapFollowupClientDetail(page);
    const matchingTasks = detail.tasks.filter((task) =>
      task.contactId === body.contactId && task.sourceBombId === bombId,
    );
    if (!matchingTasks.length) return Response.json({ error: "OmniReach execution plan not found" }, { status: 404 });

    const cancelled = await cancelOpenBombTasks({ brandId: id, bombId, contactId: body.contactId });
    return Response.json({ cancelledTaskIds: cancelled.map((task) => task.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
