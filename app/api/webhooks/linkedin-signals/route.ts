import { hasReplyIngestToken } from "@/lib/reply-ingest-auth";
import { ingestLinkedInFindings } from "@/lib/signals/linkedin-ingest";

/**
 * Ingests the `findings` JSON emitted by the weekly Notion AI LinkedIn monitor.
 *
 * POST /api/webhooks/linkedin-signals
 * Authorization: Bearer <REPLY_INGEST_TOKEN>
 */
export async function POST(request: Request) {
  if (!hasReplyIngestToken(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await ingestLinkedInFindings(await request.json());
    if (!result.accepted) {
      return Response.json({ ok: false, ...result }, { status: 400 });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to ingest LinkedIn findings";
    return Response.json({ error: message }, { status: 500 });
  }
}
