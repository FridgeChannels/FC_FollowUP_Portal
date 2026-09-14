import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { launchFollowupBomb, type LaunchStepCopy } from "@/lib/notion/launch-bomb";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const brand = await mapFollowupClientPage(await retrievePage(id));
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    const body = (await request.json()) as {
      bombId?: string;
      contactId?: string;
      copies?: Record<string, LaunchStepCopy>;
    };
    if (!body.bombId || !body.contactId) {
      return Response.json({ error: "OmniReach and KeyPerson are required" }, { status: 400 });
    }
    const result = await launchFollowupBomb({
      brandId: id,
      bombId: body.bombId,
      contactId: body.contactId,
      copies: body.copies,
      sender: viewer.email,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
