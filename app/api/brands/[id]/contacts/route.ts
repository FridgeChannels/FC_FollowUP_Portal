import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { firstRelationId, retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { createFollowupContactWithKeyPerson } from "@/lib/notion/followup-contact-writes";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      title?: string | null;
      ownerOrConnector?: "Owner" | "Connector" | null;
      email?: string | null;
      phone?: string | null;
      linkedin?: string | null;
      contactOrder?: "Primary" | "Secondary" | "Backup" | null;
    };

    const name = body.name?.trim() || "";
    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }

    const clientPageId = firstRelationId(page.properties?.Client);
    const result = await createFollowupContactWithKeyPerson({
      followupClientId: id,
      clientPageId,
      companyName: brand.name,
      name,
      title: body.title,
      ownerOrConnector: body.ownerOrConnector || null,
      email: body.email,
      phone: body.phone,
      linkedin: body.linkedin,
      contactOrder: body.contactOrder || null,
    });

    return Response.json({
      contact: result.contact,
      contacts: result.contacts,
      contactId: result.contactId,
      keyPersonId: result.keyPersonId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
