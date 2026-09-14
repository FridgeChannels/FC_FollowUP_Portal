import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { InboundReplyError, ingestInboundReply } from "@/lib/notion/inbound-reply";
import { hasReplyIngestToken } from "@/lib/reply-ingest-auth";

export async function POST(request: Request) {
  try {
    const ingestAuth = hasReplyIngestToken(request);
    const viewer = ingestAuth ? null : await viewerFromRequest(request);
    if (!ingestAuth && !viewer?.email) {
      return Response.json({ error: "Sign in or ingest token required" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const result = await ingestInboundReply(body, async (target) => {
      if (ingestAuth) return;
      const brand = await mapFollowupClientPage(await retrievePage(target.brandId));
      if (!viewer || !canWriteBrand(viewer, brand)) {
        throw new InboundReplyError("You do not have access to this brand", 403);
      }
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof InboundReplyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
