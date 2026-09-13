import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrieveFollowupBomb } from "@/lib/notion/bombs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const bomb = await retrieveFollowupBomb(id);
    return Response.json({ bomb });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
