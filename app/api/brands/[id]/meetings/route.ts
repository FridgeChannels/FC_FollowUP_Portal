import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  firstRelationId,
  isTestFollowupClientPage,
  propertyText,
  retrievePage,
  titleFromProperties,
} from "@/lib/notion/client";
import { createAiMeetingForFollowupClient } from "@/lib/notion/meeting-writes";
import { aiMeetingLinksPropertyName, parseAiMeetingLinks } from "@/lib/ai-meeting-links";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const properties = page.properties || {};
    const brand = {
      isTest: isTestFollowupClientPage(page),
      ownerId: firstRelationId(properties.Owner) || null,
      ownerEmail: null,
    };
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    const result = await createAiMeetingForFollowupClient({
      followupClientId: id,
      brandName: titleFromProperties(properties) || "Untitled Client",
      existingLinks: parseAiMeetingLinks(
        propertyText(properties[aiMeetingLinksPropertyName()]),
      ),
    });

    return Response.json({
      meeting: result.meeting,
      meetings: result.meetings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
