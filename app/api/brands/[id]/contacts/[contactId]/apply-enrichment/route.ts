import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import type { EnrichFieldKey } from "@/lib/icypeas";
import { retrievePage } from "@/lib/notion/client";
import { applyEnrichmentConflicts } from "@/lib/notion/contact-enrichment";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";

type Params = { params: Promise<{ id: string; contactId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id, contactId } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    const body = (await request.json()) as {
      fields?: Partial<Record<EnrichFieldKey, string>>;
    };
    const fields = body.fields || {};
    const result = await applyEnrichmentConflicts({
      followupClientId: id,
      contactId,
      fields,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message.includes("404")
        ? 404
        : message.includes("does not belong") || message.includes("No fields")
          ? 400
          : 500;
    return Response.json({ error: message }, { status });
  }
}
