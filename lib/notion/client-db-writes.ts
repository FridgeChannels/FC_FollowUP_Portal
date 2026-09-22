import {
  createPage,
  firstRelationId,
  notionFetch,
  propertyText,
  retrievePage,
  richText,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getClientDbId } from "./config";

/** Dual relation on ClientDB → Follow-up ClientDB (synced with Follow-up Client.Client). */
export const CLIENT_FOLLOWUP_RELATION = "Follow up Client";

export type ClientCompanySummary = {
  id: string;
  name: string;
  website: string | null;
  productDescription: string | null;
};

export type CreateClientCompanyInput = {
  name: string;
  website?: string | null;
  productDescription?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
};

function mapClientCompany(page: NotionPage): ClientCompanySummary {
  const properties = page.properties || {};
  return {
    id: page.id,
    name:
      propertyText(properties["Company Name"]) ||
      titleFromProperties(properties) ||
      "",
    website: propertyText(properties.Website) || null,
    productDescription: propertyText(properties["Product Description"]) || null,
  };
}

/** True when ClientDB.`Follow up Client` already points at a Follow-up Client row. */
export async function isClientInFollowupClientDb(clientPageId: string) {
  const id = clientPageId.trim();
  if (!id) return false;
  try {
    const page = await retrievePage(id);
    return Boolean(firstRelationId(page.properties?.[CLIENT_FOLLOWUP_RELATION]));
  } catch {
    return false;
  }
}

export async function searchClientCompanies(
  query: string,
  limit = 10,
  options?: { excludeFollowupLinked?: boolean },
) {
  const q = query.trim();
  if (!q) return [] as ClientCompanySummary[];

  const excludeFollowupLinked = Boolean(options?.excludeFollowupLinked);
  const nameFilter = {
    property: "Company Name",
    title: { contains: q },
  };
  const filter = excludeFollowupLinked
    ? {
        and: [
          nameFilter,
          {
            property: CLIENT_FOLLOWUP_RELATION,
            relation: { is_empty: true },
          },
        ],
      }
    : nameFilter;

  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getClientDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: Math.min(Math.max(limit, 1), 25),
        filter,
        sorts: [{ property: "Company Name", direction: "ascending" }],
      }),
    },
  );

  return data.results.map(mapClientCompany).filter((item) => item.name);
}

export async function createClientCompany(input: CreateClientCompanyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Company name is required");
  const website = normalizeWebsiteUrl(input.website);
  if (!website) throw new Error("Website is required");

  const properties: Record<string, unknown> = {
    "Company Name": { title: richText(name) },
    Website: { url: website },
    "Source Type": { select: { name: input.sourceType?.trim() || "Referral / Manual" } },
    "Source Name": {
      rich_text: richText(input.sourceName?.trim() || "Portal Manual"),
    },
  };
  if (input.productDescription?.trim()) {
    properties["Product Description"] = {
      rich_text: richText(input.productDescription.trim()),
    };
  }

  const page = await createPage(getClientDbId(), properties);
  return mapClientCompany(page);
}

/** Ensure Notion url property accepts the value. */
export function normalizeWebsiteUrl(value?: string | null) {
  const raw = value?.trim() || "";
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
