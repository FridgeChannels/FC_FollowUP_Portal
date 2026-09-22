import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { searchClientCompanies } from "@/lib/notion/client-db-writes";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin) {
      return Response.json({ error: "Only Admin can search ClientDB" }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) {
      return Response.json({ clients: [] });
    }

    const clients = await searchClientCompanies(q, 12, { excludeFollowupLinked: true });
    return Response.json({ clients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
