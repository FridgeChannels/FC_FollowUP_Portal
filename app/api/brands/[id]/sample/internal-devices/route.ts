import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { markInternalDevice, unmarkInternalDevice } from "@/lib/sample/internal-devices";
import { markSampleNotificationsReadForDevice } from "@/lib/sample/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Params = { params: Promise<{ id: string }> };

async function requireWriter(request: Request, brandId: string) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) {
    return { error: Response.json({ error: "Sign in required" }, { status: 401 }) };
  }
  const page = await retrievePage(brandId);
  const brand = await mapFollowupClientPage(page);
  if (!canWriteBrand(viewer, brand)) {
    return {
      error: Response.json({ error: "You do not have access to this brand" }, { status: 403 }),
    };
  }
  return { viewer, brand };
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireWriter(request, id);
    if ("error" in auth && auth.error) return auth.error;
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const body = (await request.json()) as {
      deviceId?: string;
      label?: string | null;
      note?: string | null;
    };
    const deviceId = (body.deviceId || "").trim();
    if (!deviceId) {
      return Response.json({ error: "deviceId is required" }, { status: 400 });
    }

    const device = await markInternalDevice({
      deviceId,
      label: body.label || auth.viewer?.email || null,
      note: body.note || `Marked from brand ${id}`,
    });
    try {
      await markSampleNotificationsReadForDevice(id, deviceId);
    } catch (error) {
      console.error("[sample/internal-devices] clear notifications failed", error);
    }
    return Response.json({ ok: true, device });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] POST failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const auth = await requireWriter(request, id);
    if ("error" in auth && auth.error) return auth.error;
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const url = new URL(request.url);
    const fromQuery = (url.searchParams.get("deviceId") || "").trim();
    const body = fromQuery
      ? null
      : ((await request.json().catch(() => ({}))) as { deviceId?: string });
    const deviceId = fromQuery || (body?.deviceId || "").trim();
    if (!deviceId) {
      return Response.json({ error: "deviceId is required" }, { status: 400 });
    }

    await unmarkInternalDevice(deviceId);
    return Response.json({ ok: true, deviceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample/internal-devices] DELETE failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
