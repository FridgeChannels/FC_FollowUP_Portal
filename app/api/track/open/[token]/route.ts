import { getPortalBaseUrl } from "@/lib/notify/config";
import { getEmailTrackSecret } from "@/lib/signals/email-config";
import { recordEmailOpen } from "@/lib/signals/email-open";
import { parseOpenTrackingToken } from "@/lib/signals/email-tracking";

type Params = { params: Promise<{ token: string }> };

/** 1x1 transparent GIF89a — the smallest thing an email client can load. */
const TRANSPARENT_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (char) => char.charCodeAt(0),
);

function pixelResponse() {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.byteLength),
      // Never let a proxy or mail client reuse a pixel response.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * The portal itself renders sent emails in the Timeline. When it does, the
 * browser fetches the pixel from our own origin — which would report a fake
 * open. Real mail clients never send these headers.
 */
function isPortalPreview(request: Request) {
  const site = (request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (site === "same-origin" || site === "same-site") return true;
  const referer = request.headers.get("referer") || "";
  const base = getPortalBaseUrl();
  return Boolean(base && referer.startsWith(base));
}

/**
 * GET /api/track/open/<token>
 *
 * Open-tracking pixel for outbound email. Always answers with the GIF — a mail
 * client loading this must never see an error, and a bad token must not reveal
 * anything about why it was rejected.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const payload = await parseOpenTrackingToken(token, getEmailTrackSecret());
    if (payload && !isPortalPreview(request)) {
      await recordEmailOpen(payload, {
        userAgent: request.headers.get("user-agent"),
      });
    }
  } catch (error) {
    // Swallow: the pixel must stay 200 even when the write fails.
    console.warn("[email-open] track failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return pixelResponse();
}
