import { hasReplyIngestToken } from "@/lib/reply-ingest-auth";
import { ingestSampleTapEvents, type SampleTapIngestRequest } from "@/lib/sample/ingest";

/**
 * Third-party ingest for Sample tap pageviews.
 *
 * POST /api/webhooks/sample-tap
 * Authorization: Bearer <REPLY_INGEST_TOKEN>
 *
 * Body:
 * {
 *   "sn": "93H68D44ER",
 *   "brandId": "optional-followup-client-id",
 *   "events": [
 *     {
 *       "posthogEventUuid": "…",
 *       "occurredAt": "2026-09-29T12:00:00.000Z",
 *       "deviceId": "…",
 *       "distinctId": "…",
 *       "pathname": "/p/93H68D44ER",
 *       "url": "https://tap.fridgechannels.com/p/93H68D44ER",
 *       "geoCity": "…",
 *       "geoCountry": "…",
 *       "browser": "…",
 *       "os": "…",
 *       "referrer": "…"
 *     }
 *   ]
 * }
 */
export async function POST(request: Request) {
  if (!hasReplyIngestToken(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SampleTapIngestRequest;
    const result = await ingestSampleTapEvents(body);
    if (result.error && result.upserted === 0 && result.received === 0) {
      return Response.json({ ok: false, ...result }, { status: 400 });
    }
    if (result.error && result.upserted === 0) {
      const status = result.error.includes("Supabase") ? 503 : 400;
      return Response.json({ ok: false, ...result }, { status });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
