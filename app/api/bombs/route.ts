import { viewerFromRequest } from "@/lib/brand-viewer-request";
import type { CreateBombInput } from "@/lib/bomb-list";
import { createFollowupBomb, listFollowupBombsCatalog } from "@/lib/notion/bombs";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    return Response.json(await listFollowupBombsCatalog());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      return Response.json({ error: "You do not have access to create OmniReach" }, { status: 403 });
    }
    const body = (await request.json()) as CreateBombInput;
    const bomb = await createFollowupBomb(body);
    return Response.json({ bomb }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
