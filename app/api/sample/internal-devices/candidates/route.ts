import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { listInternalDeviceCandidates } from "@/lib/sample/internal-devices";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    return Response.json({ candidates: await listInternalDeviceCandidates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] candidates GET failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
