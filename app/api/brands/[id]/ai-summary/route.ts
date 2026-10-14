import {
  brandAiSummaryConfiguration,
  brandAiSummaryContext,
  generateBrandAiSummary,
  validAmScopes,
} from "@/lib/brand-ai-generation";
import {
  putBrandAiSummary,
  stringifyBrandAiSummaryStore,
  type BrandAiSummaryScope,
} from "@/lib/brand-ai-summary";
import { canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail } from "@/lib/notion/followup-clients";
import { saveBrandAiSummary } from "@/lib/notion/followup-writes";
import { loadSignalEvents } from "@/lib/signals/data";
import { classifySignalEvents } from "@/lib/signals/model";

type Params = { params: Promise<{ id: string }> };

function parseScope(value: unknown): BrandAiSummaryScope | null {
  return value === "overall" || value === "am" ? value : null;
}

async function loadBrand(request: Request, id: string) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) return { error: Response.json({ error: "Sign in required" }, { status: 401 }) };
  const page = await retrievePage(id);
  const brand = await mapFollowupClientDetail(page, { includeActivities: true });
  return { viewer, brand };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const loaded = await loadBrand(request, id);
    if ("error" in loaded) return loaded.error;
    const { viewer, brand } = loaded;
    if (!canViewBrand(viewer, brand, brand.tasks)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    return Response.json({
      summaries: brand.aiSummaries || {},
      ams: validAmScopes(brand).map(({ id: amId, name, startAt, endAt }) => ({ id: amId, name, startAt, endAt })),
      configuration: brandAiSummaryConfiguration(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json() as { scope?: unknown; scopes?: unknown; amId?: unknown };
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes : [body.scope];
    const scopes = [...new Set(requestedScopes.map(parseScope))];
    const amId = typeof body.amId === "string" ? body.amId : null;
    if (!scopes.length || scopes.some((scope) => !scope) || (scopes.includes("am") && !amId)) {
      return Response.json({ error: "Choose an AI summary view" }, { status: 400 });
    }
    const loaded = await loadBrand(request, id);
    if ("error" in loaded) return loaded.error;
    const { viewer, brand } = loaded;
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have permission to generate this summary" }, { status: 403 });
    }
    if (scopes.includes("am") && (!validAmScopes(brand).some((item) => item.id === amId) || (!viewer.isAdmin && amId !== viewer.ownerId))) {
      return Response.json({ error: "You do not have permission to generate this AM summary" }, { status: 403 });
    }
    const configuration = brandAiSummaryConfiguration();
    if (!configuration.configured) {
      return Response.json({
        error: "OPENAI_API_KEY is not configured",
        code: "AI_SUMMARY_NOT_CONFIGURED",
      }, { status: 422 });
    }

    const signals = scopes.includes("am")
      ? classifySignalEvents((await loadSignalEvents(id)).events)
      : [];
    const am = amId ? validAmScopes(brand).find((item) => item.id === amId) : null;
    const generated = await Promise.all(scopes.map(async (scope) => {
      const source = brandAiSummaryContext({ brand, scope: scope!, amId, signals });
      return {
        scope: scope!,
        summary: {
          content: await generateBrandAiSummary(source.text),
          generatedAt: new Date().toISOString(),
          generatedBy: viewer.name || viewer.email,
          dataAsOf: source.dataAsOf,
          ...(scope === "am" ? { amId, amName: am?.name || null } : {}),
        },
      };
    }));
    const store = generated.reduce((current, { scope, summary }) => putBrandAiSummary(current, scope, summary), brand.aiSummaries || {});
    await saveBrandAiSummary(id, stringifyBrandAiSummaryStore(store));
    return Response.json({ summary: generated.length === 1 ? generated[0]?.summary : undefined, summaries: store });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
