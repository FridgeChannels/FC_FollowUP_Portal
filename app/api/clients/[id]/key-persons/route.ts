import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listKeyPersonsByClient } from "@/lib/notion/key-person-writes";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin) {
      return Response.json({ error: "Only Admin can list Client KeyPersons" }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) {
      return Response.json({ error: "Client id is required" }, { status: 400 });
    }

    const keyPersons = await listKeyPersonsByClient(id);
    return Response.json({
      keyPersons: keyPersons.map((person) => ({
        id: person.id,
        name: person.name,
        title: person.title,
        ownerOrConnector: person.ownerOrConnector,
        email: person.email,
        phone: person.phone,
        directPhone: person.directPhone,
        officePhone: person.officePhone,
        whatsapp: person.whatsapp,
        linkedin: person.linkedin,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
