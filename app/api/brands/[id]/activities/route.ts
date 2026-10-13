import { canViewBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { listFollowupConversationsPage, listFollowupConversations } from "@/lib/notion/conversations";
import { followupHistory } from "@/lib/followup-data";
import { FollowupError } from "@/lib/followup-history";
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
    const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
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

    const roundId = url.searchParams.get("roundId");
    if (roundId) {
      const history = await followupHistory(page.id);
      if (!history.rounds.some(r => r.id === roundId)) throw new FollowupError("Round does not belong to this Brand", 404);
      // Query the existing list, including direct Brand relations for departed
      // contacts. Unknown legacy attribution is kept in the unfiltered list.
      const all = (await listFollowupConversations(contactIds, page.id)).filter(a => a.roundId === roundId);
      const offset = Number.parseInt(cursor || "0", 10);
      if (!Number.isInteger(offset) || offset < 0) throw new FollowupError("Invalid Round conversation cursor");
      const size = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
      const activities = all.slice(offset, offset + size).map(a => ({ ...a, extendedParameters: null }));
      const hasMore = offset + size < all.length;
      return Response.json({ activities, hasMore, nextCursor: hasMore ? String(offset + size) : null });
    }
    if (!allowed) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const result = await listFollowupConversationsPage(contactIds, {
      brandId: page.id,
      limit: Number.isFinite(limit) ? limit : 50,
      cursor,
      trimPayload: true,
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof FollowupError ? error.status : message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
