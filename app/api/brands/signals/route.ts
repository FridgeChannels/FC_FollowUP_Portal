import {
  canAccessTestBrands,
  isTestOnlyViewer,
  type BrandViewer,
} from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  firstRelationId,
  isTestFollowupClientPage,
  retrievePage,
  type NotionPage,
} from "@/lib/notion/client";
import { listBrandInteractionSignals } from "@/lib/notion/brand-reply-signals";
import { getCachedBrandPage } from "@/lib/notion/brand-page-cache";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";

const MAX_BRANDS = 10;

function canViewListPage(viewer: BrandViewer, page: NotionPage) {
  const isTest = isTestFollowupClientPage(page);
  if (isTestOnlyViewer(viewer)) return isTest;
  if (isTest && !canAccessTestBrands(viewer)) return false;
  if (viewer.isAdmin) return true;
  return Boolean(
    viewer.ownerId &&
      firstRelationId(page.properties?.Owner) === viewer.ownerId,
  );
}

async function getBrandSignals(request: Request) {
  const traceId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  try {
    const viewerStartedAt = Date.now();
    const viewer = await viewerFromRequest(request);
    console.info("[brands/signals] phase", {
      traceId,
      phase: "viewer",
      durationMs: Date.now() - viewerStartedAt,
    });
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }

    const ids = [
      ...new Set(
        (new URL(request.url).searchParams.get("ids") || "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].slice(0, MAX_BRANDS);
    if (!ids.length) return Response.json({ signals: [] });

    const accessStartedAt = Date.now();
    let cacheHitCount = 0;
    const pages = (
      await Promise.all(ids.map((id) => {
        const cached = getCachedBrandPage(id);
        if (cached) {
          cacheHitCount += 1;
          return cached;
        }
        return retrievePage(id).catch(() => null);
      }))
    ).filter(
      (page): page is NotionPage =>
        Boolean(page && canViewListPage(viewer, page)),
    );
    console.info("[brands/signals] phase", {
      traceId,
      phase: "brand-access",
      durationMs: Date.now() - accessStartedAt,
      requestedCount: ids.length,
      allowedCount: pages.length,
      cacheHitCount,
    });
    const signals = await listBrandInteractionSignals(pages, traceId);
    console.info("[brands/signals] request complete", {
      traceId,
      durationMs: Date.now() - requestStartedAt,
      signalCount: signals.size,
    });

    return Response.json({
      signals: pages.flatMap((page) => {
        const signal = signals.get(page.id);
        return signal ? [{ id: page.id, ...signal }] : [];
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export function GET(request: Request) {
  return runWithNotionLimit(() => getBrandSignals(request));
}
