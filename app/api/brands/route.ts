import { CURRENT_CPS, type CurrentCpOption } from "@/lib/brand-list";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { queryFollowupClientPages } from "@/lib/notion/client";
import { listCurrentCps } from "@/lib/notion/cps";
import { mapFollowupClientPages } from "@/lib/notion/followup-clients";

async function loadCurrentCps(): Promise<CurrentCpOption[]> {
  try {
    return await listCurrentCps();
  } catch {
    return CURRENT_CPS.map((name) => ({ id: name, name }));
  }
}

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const cps = await loadCurrentCps();
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({
        brands: [],
        cps,
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }
    const pages = await queryFollowupClientPages(
      viewer.isAdmin ? undefined : viewer.ownerId || undefined,
    );
    const brands = await mapFollowupClientPages(pages);
    return Response.json({
      brands,
      cps,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
