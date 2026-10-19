import { requireInternalDeviceUser } from "@/lib/sample/internal-device-auth";
import { markInternalDevice, unmarkInternalDevice } from "@/lib/sample/internal-devices";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request) {
  try {
    // Compatibility alias. Internal-device state is global, independent of this brand ID.
    const auth = await requireInternalDeviceUser(request);
    if ("error" in auth) return auth.error;
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const body = (await request.json()) as {
      deviceId?: unknown;
      label?: unknown;
      note?: unknown;
    };
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    if (!deviceId || deviceId.length > 256) {
      return Response.json({ error: "deviceId must be 1–256 characters" }, { status: 400 });
    }

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
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const url = new URL(request.url);
    const fromQuery = (url.searchParams.get("deviceId") || "").trim();
    const body = fromQuery
      ? null
      : ((await request.json().catch(() => ({}))) as { deviceId?: string });
    const deviceId = fromQuery || (body?.deviceId || "").trim();
    if (!deviceId || deviceId.length > 256) {
      return Response.json({ error: "deviceId must be 1–256 characters" }, { status: 400 });
    }

    await unmarkInternalDevice(deviceId);
    return Response.json({ ok: true, deviceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] DELETE failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
