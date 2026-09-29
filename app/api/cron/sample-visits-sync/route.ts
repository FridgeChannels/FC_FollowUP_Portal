import { getSampleSyncSecret } from "@/lib/sample/config";
import { syncSampleVisitsBatch } from "@/lib/sample/sync";

function authorized(request: Request) {
  const secret = getSampleSyncSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      brandId?: string;
      maxSns?: number;
    };
    const { results } = await syncSampleVisitsBatch({
      brandId: body.brandId || null,
      maxSns: body.maxSns,
    });
    return Response.json({
      ok: true,
      count: results.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
