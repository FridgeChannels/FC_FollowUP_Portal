import { listApplicableCps } from "@/lib/brand-list";
import type { UpdateBombInput } from "@/lib/bomb-list";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrieveFollowupBomb, updateFollowupBomb, listFollowupScenarios } from "@/lib/notion/bombs";

type Params = { params: Promise<{ id: string }> };

async function loadFormOptions() {
  return {
    scenarios: await listFollowupScenarios(),
    cps: listApplicableCps(),
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const [bomb, options] = await Promise.all([retrieveFollowupBomb(id), loadFormOptions()]);
    return Response.json({ bomb, ...options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ error: "You do not have access to edit OmniReach" }, { status: 403 });
    }
    const { id } = await params;
    const body = (await request.json()) as UpdateBombInput;
    const bomb = await updateFollowupBomb(id, body);
    return Response.json({ bomb });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
