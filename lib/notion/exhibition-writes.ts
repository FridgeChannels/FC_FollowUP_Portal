import {
  notionFetch,
  propertyText,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getExhibitionDbId } from "./config";

export type ExhibitionSummary = {
  id: string;
  name: string;
  startDate: string | null;
};

function mapExhibition(page: NotionPage): ExhibitionSummary {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: propertyText(properties.Name) || titleFromProperties(properties) || "",
    startDate: properties["Start Date"]?.date?.start || null,
  };
}

export async function searchExhibitions(query: string, limit = 12) {
  const q = query.trim();
  if (!q) return [] as ExhibitionSummary[];

  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getExhibitionDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: Math.min(Math.max(limit, 1), 25),
        filter: {
          property: "Name",
          title: { contains: q },
        },
        sorts: [{ property: "Start Date", direction: "descending" }],
      }),
    },
  );

  return data.results.map(mapExhibition).filter((item) => item.name);
}

export async function retrieveExhibition(pageId: string) {
  const page = await retrievePage(pageId);
  const mapped = mapExhibition(page);
  if (!mapped.name) throw new Error("Unknown Exhibition");
  return mapped;
}
