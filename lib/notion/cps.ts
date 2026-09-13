import type { CurrentCpOption } from "../brand-list";
import {
  firstRelationId,
  notionFetch,
  queryFollowupClientPages,
  retrievePage,
  titleFromProperties,
  type NotionPage,
} from "./client";
import { getFollowupCpDbId } from "./config";

function cpSortValue(name: string) {
  if (name.toUpperCase() === "NONE") return [0, 0, name] as const;
  const match = name.match(/^CP(\d+)$/i);
  if (match) return [1, Number(match[1]), name] as const;
  return [2, 0, name] as const;
}

export function sortCurrentCps(items: CurrentCpOption[]) {
  return [...items].sort((a, b) => {
    const left = cpSortValue(a.name);
    const right = cpSortValue(b.name);
    return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2]);
  });
}

function isMissingObject(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("object_not_found") || error.message.includes("Could not find database"))
  );
}

function mapCpPage(page: NotionPage): CurrentCpOption | null {
  const name = titleFromProperties(page.properties);
  return name ? { id: page.id, name } : null;
}

async function queryCpDictionary() {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/databases/${getFollowupCpDbId()}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
      }),
    });
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return sortCurrentCps(
    pages.map(mapCpPage).filter((item): item is CurrentCpOption => !!item),
  );
}

async function listCurrentCpsFromClients() {
  const pages = await queryFollowupClientPages();
  const ids = [...new Set(
    pages
      .map((page) => firstRelationId(page.properties?.["Current CP"]))
      .filter((id): id is string => !!id),
  )];
  const cps = await Promise.all(
    ids.map(async (id) => {
      try {
        return mapCpPage(await retrievePage(id));
      } catch {
        return null;
      }
    }),
  );
  return sortCurrentCps(cps.filter((item): item is CurrentCpOption => !!item));
}

export async function listCurrentCps(): Promise<CurrentCpOption[]> {
  try {
    const cps = await queryCpDictionary();
    if (cps.length) return cps;
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }
  return listCurrentCpsFromClients();
}
