import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { cancelOpenBombTasks } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string; bombId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });

    const { id, bombId } = await params;
    const body = (await request.json()) as { contactId?: string; omniReachRunId?: string };
    const contactId = body.contactId?.trim() || "";
    if (!contactId) return Response.json({ error: "A KeyPerson is required" }, { status: 400 });

    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const related = relationIds(page.properties?.["Follow-up Contacts"]);
    let allowed = related.includes(contactId);
    if (!allowed) {
      allowed = (await listFollowupContactIds(id, related)).includes(contactId);
    }
    if (!allowed) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }

    const runId = body.omniReachRunId?.trim() || null;
    const result = await cancelOpenBombTasks({
      brandId: id,
      bombId,
      contactId,
      omniReachRunId: runId,
      knownStatus: brand.status,
      knownHandlingMode: brand.handlingMode,
    });
    if (!result.matched) {
      return Response.json({ error: "OmniReach execution plan not found" }, { status: 404 });
    }
    return Response.json({ cancelledTaskIds: result.cancelledTaskIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
