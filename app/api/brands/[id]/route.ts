import { CURRENT_CPS, type CurrentCpOption } from "@/lib/brand-list";
import { canAssignBrandOwner, canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { propertyText, retrievePage } from "@/lib/notion/client";
import { listCurrentCps } from "@/lib/notion/cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { updateFollowupClient } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string }> };

async function loadCurrentCps(): Promise<CurrentCpOption[]> {
  try {
    return await listCurrentCps();
  } catch {
    return CURRENT_CPS.map((name) => ({ id: name, name }));
  }
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const [page, cps] = await Promise.all([retrievePage(id), loadCurrentCps()]);
    const brand = await mapFollowupClientDetail(page);
    if (!canViewBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    return Response.json({ brand, cps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      currentCpId?: string | null;
      ownerId?: string | null;
      status?: string | null;
      handlingMode?: string | null;
      evidence?: string;
      note?: string;
    };
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    if (body.ownerId !== undefined && !canAssignBrandOwner(viewer)) {
      return Response.json({ error: "Only Admin can assign Owner" }, { status: 403 });
    }

    const extras: string[] = [];
    if (body.currentCpId && (body.evidence?.trim() || body.note?.trim())) {
      const cps = await listCurrentCps();
      const next = cps.find((item) => item.id === body.currentCpId);
      extras.push(
        [
          `CP 更新为 ${next?.name || "未知"}。`,
          body.evidence?.trim() ? `证据：${body.evidence.trim()}。` : "",
          body.note?.trim() || "",
        ]
          .filter(Boolean)
          .join(""),
      );
    }
    if (body.status && body.status !== brand.status) {
      extras.push(`状态更新为 ${body.status}。`);
    }
    if (body.handlingMode && body.handlingMode !== brand.handlingMode) {
      extras.push(`跟进方式更新为 ${body.handlingMode}。`);
    }
    const notes = extras.length
      ? [propertyText(page.properties?.Notes) || null, ...extras].filter(Boolean).join("\n")
      : undefined;

    await updateFollowupClient(id, {
      currentCpId: body.currentCpId,
      ownerId: body.ownerId,
      status: body.status,
      handlingMode: body.handlingMode,
      notes,
    });
    const [updated, cps] = await Promise.all([
      mapFollowupClientDetail(await retrievePage(id)),
      loadCurrentCps(),
    ]);
    return Response.json({ brand: updated, cps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
