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
  try {
    const viewer = await viewerFromRequest(request);
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

    const pages = (
      await Promise.all(ids.map((id) => retrievePage(id).catch(() => null)))
    ).filter(
      (page): page is NotionPage =>
        Boolean(page && canViewListPage(viewer, page)),
    );
    const signals = await listBrandInteractionSignals(pages);

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
