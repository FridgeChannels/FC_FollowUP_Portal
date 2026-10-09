import { canViewBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { firstRelationId, retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { getMagnetBrandParamBySn } from "@/lib/sample/magnet";
import { readNfcCardSnsFromClientPage } from "@/lib/sample/resolve";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canViewBrand(viewer, brand, [])) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    if (!isSupabaseConfigured()) return Response.json({ profiles: [] });
    const clientId = firstRelationId(page.properties?.Client);
    const sns = await readNfcCardSnsFromClientPage(clientId);
    const profiles = await Promise.all(sns.map(async (sn) => ({
      sn,
      profile: await getMagnetBrandParamBySn(sn),
    })));
    return Response.json({ profiles }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load profiles" }, { status: 503 });
  }
}
