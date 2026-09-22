import {
  createPage,
  notionFetch,
  propertyText,
  richText,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getClientDbId } from "./config";

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

export async function searchClientCompanies(query: string, limit = 10) {
  const q = query.trim();
  if (!q) return [] as ClientCompanySummary[];

  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getClientDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: Math.min(Math.max(limit, 1), 25),
        filter: {
          property: "Company Name",
          title: { contains: q },
        },
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

