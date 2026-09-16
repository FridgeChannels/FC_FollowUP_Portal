import { canViewBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { listFollowupConversationsPage } from "@/lib/notion/conversations";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { listFollowupTasks } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "40", 10);
    const cursor = url.searchParams.get("cursor");

    const page = await retrievePage(id);
    const [brand, contactIds] = await Promise.all([
      mapFollowupClientPage(page),
      listFollowupContactIds(page.id, relationIds(page.properties?.["Follow-up Contacts"])),
    ]);

    let allowed = canViewBrand(viewer, brand);
    if (!allowed) {
      const tasks = await listFollowupTasks(contactIds, {
        brand: { id: brand.id, name: brand.name, ownerId: brand.ownerId },
      });
      allowed = canViewBrand(viewer, brand, tasks);
    }
    if (!allowed) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const result = await listFollowupConversationsPage(contactIds, {
      limit: Number.isFinite(limit) ? limit : 40,
      cursor,
      trimPayload: true,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
