import { firstRelationId, queryFollowupClientPages, retrievePage, titleFromProperties } from "./client";
import {
  getCachedExhibitionOptions,
  type ExhibitionOption,
} from "./exhibition-options-cache";

export type { ExhibitionOption };

export type LinkedExhibitionOptionsScope = {
  ownerPageId?: string | null;
  includeTest?: boolean;
  onlyTest?: boolean;
};

async function resolveExhibitionNames(ids: string[]) {
  const names = new Map<string, string>();
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex];
      nextIndex += 1;
      try {
        const page = await retrievePage(id);
        const name = titleFromProperties(page.properties) || "";
        if (name) names.set(id, name);
      } catch {
        /* skip missing / inaccessible exhibition pages */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()));
  return names;
}

async function loadLinkedExhibitionOptions(
  scope: LinkedExhibitionOptionsScope,
): Promise<ExhibitionOption[]> {
  const pages = await queryFollowupClientPages(scope.ownerPageId, {
    includeTest: scope.includeTest,
    onlyTest: scope.onlyTest,
  });
  const exhibitionIds = [
    ...new Set(
      pages
        .map((page) => firstRelationId(page.properties?.["Follow-up Exhibition"]))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!exhibitionIds.length) return [];
  const names = await resolveExhibitionNames(exhibitionIds);
  return exhibitionIds
    .map((id) => ({ id, name: names.get(id) || "" }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * ExhibitionDB pages that are already linked from Follow-up ClientDB
 * (viewer-scoped). Cached for hours; flush via portal cache clear.
 */
export async function listLinkedExhibitionOptions(
  scope: LinkedExhibitionOptionsScope = {},
) {
  const key = JSON.stringify({
    ownerPageId: scope.ownerPageId ?? null,
    includeTest: Boolean(scope.includeTest),
    onlyTest: Boolean(scope.onlyTest),
  });
  return getCachedExhibitionOptions(key, () => loadLinkedExhibitionOptions(scope));
}
