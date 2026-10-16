import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  listInternalDeviceStats,
  markInternalDevice,
  unmarkInternalDevice,
} from "@/lib/sample/internal-devices";
import { isSupabaseConfigured } from "@/lib/supabase/config";

async function requireSignedIn(request: Request) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) return { response: Response.json({ error: "Sign in required" }, { status: 401 }) };
  return { viewer };
}

export async function GET(request: Request) {
  try {
    const auth = await requireSignedIn(request);
    if ("response" in auth) return auth.response;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    return Response.json({ devices: await listInternalDeviceStats() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] GET failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSignedIn(request);
    if ("response" in auth) return auth.response;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    const body = await request.json() as { deviceId?: string; label?: string | null; note?: string | null };
    const deviceId = (body.deviceId || "").trim();
    if (!deviceId || deviceId.length > 256) return Response.json({ error: "deviceId must be 1–256 characters" }, { status: 400 });
    const device = await markInternalDevice({
      deviceId,
      label: body.label || auth.viewer.email,
      note: body.note || "Marked as an internal device",
    });
    return Response.json({ ok: true, device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] POST failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireSignedIn(request);
    if ("response" in auth) return auth.response;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    const deviceId = (new URL(request.url).searchParams.get("deviceId") || "").trim();
    if (!deviceId) return Response.json({ error: "deviceId is required" }, { status: 400 });
    await unmarkInternalDevice(deviceId);
    return Response.json({ ok: true, deviceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] DELETE failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
