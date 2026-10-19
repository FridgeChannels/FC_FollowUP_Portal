import { requireInternalDeviceUser } from "@/lib/sample/internal-device-auth";
import {
  getInternalDeviceIds,
  listInternalDeviceStats,
  markInternalDevice,
  unmarkInternalDevice,
} from "@/lib/sample/internal-devices";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: Request) {
  try {
    const auth = await requireInternalDeviceUser(request);
    if ("error" in auth) return auth.error;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    const query = new URL(request.url).searchParams;
    const requestedDeviceIds = query.getAll("deviceId").map((id) => id.trim());
    if (requestedDeviceIds.length) {
      if (requestedDeviceIds.length > 100 || requestedDeviceIds.some((id) => !id || id.length > 256)) {
        return Response.json({ error: "Provide up to 100 device IDs, each 1–256 characters" }, { status: 400 });
      }
      const internalIds = await getInternalDeviceIds();
      return Response.json({
        statuses: [...new Set(requestedDeviceIds)].map((deviceId) => ({
          deviceId,
          isInternal: internalIds.has(deviceId),
        })),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ devices: await listInternalDeviceStats() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] GET failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireInternalDeviceUser(request);
    if ("error" in auth) return auth.error;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    const body = await request.json() as { deviceId?: unknown; label?: unknown; note?: unknown };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId || deviceId.length > 256) return Response.json({ error: "deviceId must be 1–256 characters" }, { status: 400 });
    const device = await markInternalDevice({
      deviceId,
      label: typeof body.label === "string" ? body.label : auth.viewer.email,
      note: typeof body.note === "string" ? body.note : "Marked as an internal device",
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
    const auth = await requireInternalDeviceUser(request);
    if ("error" in auth) return auth.error;
    if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    const deviceId = (new URL(request.url).searchParams.get("deviceId") || "").trim();
    if (!deviceId || deviceId.length > 256) return Response.json({ error: "deviceId must be 1–256 characters" }, { status: 400 });
    await unmarkInternalDevice(deviceId);
    return Response.json({ ok: true, deviceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] DELETE failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
