import { attachBombScenario, type UpdateBombInput } from "@/lib/bomb-list";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrieveFollowupBomb, updateFollowupBomb, listFollowupScenarios } from "@/lib/notion/bombs";
import { listApplicableCheckpoints } from "@/lib/notion/cps";
import { cancelScheduledBombTasks } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string }> };

async function loadFormOptions() {
  const [scenarios, cps] = await Promise.all([
    listFollowupScenarios(),
    listApplicableCheckpoints(),
  ]);
  return { scenarios, cps };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const [viewer, bomb, options] = await Promise.all([
      viewerFromRequest(request),
      retrieveFollowupBomb(id),
      loadFormOptions(),
    ]);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    return Response.json({ bomb: attachBombScenario(bomb, options.scenarios), ...options });
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
    const current = await retrieveFollowupBomb(id);
    const bomb = await updateFollowupBomb(id, body);
    const stopped =
      current.status === "Active" &&
      body.status !== undefined &&
      body.status !== "Active";
    const cancelledTasks = stopped ? await cancelScheduledBombTasks(id) : [];
    return Response.json({ bomb, cancelledTasks: cancelledTasks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
