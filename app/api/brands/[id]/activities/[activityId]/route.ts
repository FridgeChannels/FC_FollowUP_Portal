import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { propertyText, retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { markConversationRead } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string; activityId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }

    const { id: brandId, activityId } = await params;
    const [brandPage, activityPage] = await Promise.all([
      retrievePage(brandId),
      retrievePage(activityId),
    ]);
    const brand = await mapFollowupClientPage(brandPage);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const properties = activityPage.properties || {};
    const linkedBrandId = properties["Follow-up Client"]?.relation?.[0]?.id;
    if (linkedBrandId !== brandId || propertyText(properties.Direction) !== "Inbound") {
      return Response.json({ error: "Inbound activity not found for this brand" }, { status: 404 });
    }

    await markConversationRead(activityId);
    return Response.json({ ok: true, activityId, replyStatus: "Replied" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
