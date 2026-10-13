import { canViewBrand, canWriteBrand, canAssignBrandOwner } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail } from "@/lib/notion/followup-clients";
import { followupHistory, markEncountersRead, mutateFollowup, projectFollowupState, seedFollowupHistory } from "@/lib/followup-data";
import { FollowupError } from "@/lib/followup-history";

type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientDetail(page);
    if (!canViewBrand(viewer, brand, brand.tasks)) return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    await seedFollowupHistory(page);
    return Response.json({ history: await followupHistory(page.id) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    let page = await retrievePage(id);
    const brand = await mapFollowupClientDetail(page);
    if (!canWriteBrand(viewer, brand)) return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "read") {
      await markEncountersRead(page.id, viewer.ownerId, viewer.isAdmin);
    } else if (body.action === "start" || body.action === "resume") {
      if (body.ownerId !== undefined && !canAssignBrandOwner(viewer)) throw new FollowupError("Only Admin can assign an Account Manager", 403);
      if (body.ownerId !== undefined && body.ownerId !== null && typeof body.ownerId !== "string") throw new FollowupError("Invalid Account Manager");
      await projectFollowupState(page.id);
      page = await retrievePage(page.id);
      await mutateFollowup(page, body.action, {
        ...(body.action === "start" && body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
        ...(typeof body.originEncounterId === "string" ? { originEncounterId: body.originEncounterId } : {}),
        ...(typeof body.expectedRoundId === "string" || body.expectedRoundId === null ? { expectedRoundId: body.expectedRoundId } : {}),
        ...(typeof body.expectedVersion === "number" ? { expectedVersion: body.expectedVersion } : {}),
        changedBy: viewer.name || viewer.email,
      });
    } else throw new FollowupError("Choose Start New Round or Resume");
    const updated = await mapFollowupClientDetail(await retrievePage(page.id));
    return Response.json({ history: await followupHistory(page.id), brand: updated });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Follow-up action failed" }, { status: error instanceof FollowupError ? error.status : 500 });
}
