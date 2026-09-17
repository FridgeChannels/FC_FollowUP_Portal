import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { evaluateLinkedInSendability } from "@/lib/linkedin";
import { firstRelationId, relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const contactId = new URL(request.url).searchParams.get("contactId")?.trim() || "";
    if (!contactId) {
      return Response.json({ error: "contactId is required" }, { status: 400 });
    }

    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const relatedContactIds = relationIds(page.properties?.["Follow-up Contacts"]);
    let contactAllowed = relatedContactIds.includes(contactId);
    if (!contactAllowed) {
      const contactIds = await listFollowupContactIds(id, relatedContactIds);
      contactAllowed = contactIds.includes(contactId);
    }
    if (!contactAllowed) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }

    const contactPage = await retrievePage(contactId);
    const contactClientId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
    if (contactClientId && contactClientId !== id) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }

    const result = await evaluateLinkedInSendability({ contactId });
    return Response.json({
      contactId,
      available: result.available,
      reason: result.reason || null,
      outreachKind: result.outreachKind || null,
      activeAccount: result.activeAccount || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
