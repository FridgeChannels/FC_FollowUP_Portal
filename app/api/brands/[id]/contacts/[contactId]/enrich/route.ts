import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { mapFullenrichError } from "@/lib/fullenrich";
import { mapIcypeasError } from "@/lib/icypeas";
import { retrievePage } from "@/lib/notion/client";
import { enrichFollowupContact } from "@/lib/notion/contact-enrichment";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";

type Params = { params: Promise<{ id: string; contactId: string }> };

function mapEnrichError(error: unknown) {
  const icy = mapIcypeasError(error);
  if (icy.creditsExhausted || icy.code !== "icypeas_error") {
    // Prefer specific Icypeas mapping when it recognizes the error.
    if (error && typeof error === "object" && "name" in error) {
      const name = String((error as { name?: string }).name || "");
      if (name === "IcypeasError" || icy.creditsExhausted) return icy;
    }
  }
  const fe = mapFullenrichError(error);
  if (fe.creditsExhausted || (error && typeof error === "object" && "name" in error &&
    String((error as { name?: string }).name) === "FullenrichError")) {
    return fe;
  }
  if ((error as { creditsExhausted?: boolean })?.creditsExhausted) {
    return {
      message: icy.message,
      code: icy.code,
      creditsExhausted: true,
    };
  }
  return {
    message: error instanceof Error ? error.message : icy.message,
    code: icy.code,
    creditsExhausted: false,
  };
}

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

    const result = await enrichFollowupContact({
      followupClientId: id,
      contactId,
    });

    return Response.json(result);
  } catch (error) {
    const mapped = mapEnrichError(error);
    const status = mapped.creditsExhausted
      ? 402
      : mapped.message.includes("404")
        ? 404
        : mapped.message.includes("does not belong")
          ? 400
          : 500;
    return Response.json(
      {
        error: mapped.message,
        code: mapped.code,
        creditsExhausted: mapped.creditsExhausted,
      },
      { status },
    );
  }
}
