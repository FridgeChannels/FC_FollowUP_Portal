import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { searchExhibitions } from "@/lib/notion/exhibition-writes";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin) {
      return Response.json({ error: "Only Admin can search exhibitions" }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) {
      return Response.json({ exhibitions: [] });
    }

    const exhibitions = await searchExhibitions(q, 12);
    return Response.json({ exhibitions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
