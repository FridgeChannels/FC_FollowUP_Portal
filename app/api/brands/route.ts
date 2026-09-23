import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { createBrandWithContacts } from "@/lib/notion/create-brand";
import { listCheckpoints } from "@/lib/notion/cps";
import { listFollowupClientsForViewerPage } from "@/lib/notion/followup-clients";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";
import {
  DEFAULT_BRAND_PAGE_SIZE,
  ownerPageIdFromQueryParam,
} from "@/lib/notion/owner-filter";

async function getBrands(request: Request) {
  const traceId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  try {
    const viewerStartedAt = Date.now();
    const viewer = await viewerFromRequest(request);
    console.info("[brands] phase", {
      traceId,
      phase: "viewer",
      durationMs: Date.now() - viewerStartedAt,
    });
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && !viewer.ownerId) {
      const cps = await listCheckpoints();
      return Response.json({
        brands: [],
        cps,
        pageSize: DEFAULT_BRAND_PAGE_SIZE,
        nextCursor: null,
        hasMore: false,
        viewer: { isAdmin: false, ownerName: viewer.name },
      });
    }

    const url = new URL(request.url);
    const ownerParam = url.searchParams.get("owner");
    const statusParam = url.searchParams.get("status");
    const cpParam = url.searchParams.get("cp");
    const qParam = url.searchParams.get("q");
    const replyFrom = url.searchParams.get("replyFrom");
    const replyTo = url.searchParams.get("replyTo");
    const cursor = url.searchParams.get("cursor");

    const ownerPageId = ownerPageIdFromQueryParam(
      viewer.isAdmin,
      viewer.ownerId,
      ownerParam,
    );

    const status = viewer.isAdmin ? statusParam : "all";
    const excludeStatuses = viewer.isAdmin ? undefined : ["Paused", "Completed"];

    const checkpointsStartedAt = Date.now();
    const [cps, listed] = await Promise.all([
      listCheckpoints().then((items) => {
        console.info("[brands] phase", {
          traceId,
          phase: "checkpoints",
          durationMs: Date.now() - checkpointsStartedAt,
          count: items.length,
        });
        return items;
      }),
      listFollowupClientsForViewerPage({
        traceId,
        ownerPageId,
        includeTest: canAccessTestBrands(viewer),
        onlyTest: isTestOnlyViewer(viewer),
        status,
        excludeStatuses,
        q: qParam,
        cp: cpParam,
        replyFrom,
        replyTo,
        cursor,
        pageSize: DEFAULT_BRAND_PAGE_SIZE,
      }),
    ]);
    console.info("[brands] request complete", {
      traceId,
      durationMs: Date.now() - requestStartedAt,
      brandCount: listed.brands.length,
      hasMore: listed.hasMore,
    });

    return Response.json({
      brands: listed.brands,
      cps,
      pageSize: listed.pageSize,
      nextCursor: listed.nextCursor,
      hasMore: listed.hasMore,
      viewer: { isAdmin: viewer.isAdmin, ownerName: viewer.name },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export function GET(request: Request) {
  return runWithNotionLimit(() => getBrands(request));
}

type CreateBrandBody = {
  clientPageId?: string | null;
  company?: {
    name?: string;
    website?: string | null;
    productDescription?: string | null;
  } | null;
  ownerId?: string | null;
  handlingMode?: string | null;
  priority?: string | null;
  currentCpId?: string | null;
  exhibitionId?: string | null;
  isTest?: boolean;
  notes?: string | null;
  contacts?: Array<{
    name?: string;
    keyPersonId?: string | null;
    title?: string | null;
    ownerOrConnector?: "Owner" | "Connector" | null;
    role?: "Owner" | "Connector" | "Other" | null;
    email?: string | null;
    phone?: string | null;
    directPhone?: string | null;
    officePhone?: string | null;
    whatsapp?: string | null;
    linkedin?: string | null;
  }>;
};

export async function POST(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin) {
      return Response.json({ error: "Only Admin can create brands" }, { status: 403 });
    }

    const body = (await request.json()) as CreateBrandBody;
    const contacts = (body.contacts || [])
      .map((item) => {
        const name = item.name?.trim() || "";
        if (!name) return null;
        const role = item.ownerOrConnector || item.role || null;
        return {
          name,
          keyPersonId: item.keyPersonId?.trim() || null,
          title: item.title?.trim() || null,
          ownerOrConnector:
            role === "Owner" || role === "Connector" ? role : null,
          email: item.email?.trim() || null,
          phone: item.phone?.trim() || null,
          directPhone: item.directPhone?.trim() || null,
          officePhone: item.officePhone?.trim() || null,
          whatsapp: item.whatsapp?.trim() || null,
          linkedin: item.linkedin?.trim() || null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => !!item);

    if (!contacts.length) {
      return Response.json(
        { error: "At least one contact with a name is required" },
        { status: 400 },
      );
    }

    const clientPageId = body.clientPageId?.trim() || null;
    const companyName = body.company?.name?.trim() || "";
    const website = body.company?.website?.trim() || "";
    if (!clientPageId && !companyName) {
      return Response.json(
        { error: "Company name is required when not linking an existing Client" },
        { status: 400 },
      );
    }
    if (!clientPageId && !website) {
      return Response.json({ error: "Website is required" }, { status: 400 });
    }

    const currentCpRaw = body.currentCpId?.trim() || "";
    const currentCpId =
      !currentCpRaw || currentCpRaw === "NONE" || currentCpRaw === "none"
        ? null
        : currentCpRaw;

    const result = await createBrandWithContacts({
      clientPageId,
      company: {
        name: companyName || "Brand",
        website: body.company?.website,
        productDescription: body.company?.productDescription,
      },
      ownerId: body.ownerId?.trim() || null,
      handlingMode: body.handlingMode || "Human",
      priority: body.priority || null,
      currentCpId,
      exhibitionId: body.exhibitionId?.trim() || null,
      isTest: Boolean(body.isTest),
      notes: body.notes,
      contacts,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
