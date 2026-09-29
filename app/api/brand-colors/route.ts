import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  getDtcDashboardKey,
  getDtcDashboardUrl,
  isBrandColorsConfigured,
} from "@/lib/brand-colors/config";

export type BrandColorsFcPayload = {
  brandName?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  industry?: string | null;
  source?: string | null;
  colors?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  } | null;
};

function asColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeFcColors(data: BrandColorsFcPayload) {
  const primary =
    asColor(data.primaryColor) || asColor(data.colors?.primary) || null;
  const secondary =
    asColor(data.secondaryColor) ||
    asColor(data.colors?.secondary) ||
    asColor(data.accentColor) ||
    asColor(data.colors?.accent) ||
    null;
  return {
    brandName: asColor(data.brandName),
    primaryColor: primary,
    secondaryColor: secondary,
  };
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Proxy to DTC Dashboard brand-colors (format=fc). Keeps API key server-side. */
export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!isBrandColorsConfigured()) {
      return Response.json(
        { error: "DTC_DASHBOARD_KEY is not configured" },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      format?: string;
    };
    const url = (body.url || "").trim();
    if (!isValidHttpUrl(url)) {
      return Response.json({ error: "Enter a valid brand website URL" }, { status: 400 });
    }

    const apiKey = getDtcDashboardKey();
    const upstream = await fetch(`${getDtcDashboardUrl()}/api/brand-colors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        url,
        format: body.format === "standard" ? "standard" : "fc",
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const text = await upstream.text();
    let data: BrandColorsFcPayload & { error?: string; message?: string } = {};
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = {};
    }

    if (!upstream.ok) {
      return Response.json(
        {
          error: data.message || data.error || `Brand color extraction failed (${upstream.status})`,
        },
        { status: upstream.status === 401 ? 502 : upstream.status },
      );
    }

    const colors = normalizeFcColors(data);
    if (!colors.primaryColor && !colors.secondaryColor) {
      return Response.json(
        { error: "No primary/secondary colors found for this website", colors },
        { status: 422 },
      );
    }

    return Response.json({ ok: true, ...colors, raw: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[brand-colors] POST failed", { message, error });
    return Response.json({ error: message }, { status: 500 });
  }
}
