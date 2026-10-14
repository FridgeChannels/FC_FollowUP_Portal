import { readSessionFromRequest } from "@/lib/auth-session";
import { readSignalsVersion } from "@/lib/signals/live";

/**
 * Cheap change token for the Signals feed.
 *
 * Polled by the client every few seconds. It only reads three scalar timestamps
 * from Supabase and never touches Notion, so it is orders of magnitude cheaper
 * than `GET /api/signals` — when the token moves, the client pulls a full
 * payload.
 *
 * Authenticated with the session cookie alone on purpose: a version string
 * carries no brand data, so resolving the viewer's Notion role here would only
 * add latency.
 */
export async function GET(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session?.email)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const version = await readSignalsVersion();
    return Response.json(
      { version },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to read signals version",
      },
      { status: 503 },
    );
  }
}
