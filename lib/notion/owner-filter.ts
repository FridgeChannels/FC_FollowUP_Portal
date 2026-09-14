import type { PortalRole } from "./owner-role";

/** `undefined` = all owners, `null` = Owner is empty, string = specific Owner page. */
export function ownerRelationFilter(ownerPageId?: string | null) {
  if (ownerPageId === undefined) return undefined;
  if (!ownerPageId) {
    return { property: "Owner", relation: { is_empty: true } };
  }
  return { property: "Owner", relation: { contains: ownerPageId } };
}

export function ownerPageIdFromQueryParam(
  isAdmin: boolean,
  viewerOwnerId: string | null | undefined,
  ownerParam?: string | null,
) {
  if (!isAdmin) return viewerOwnerId || undefined;
  const value = ownerParam?.trim();
  if (!value || value === "all") return undefined;
  if (value === "unassigned") return null;
  return value;
}

export type TaskListQuery = {
  ownerPageId?: string | null;
  channel?: string;
};

export function taskListFilter(query: TaskListQuery = {}) {
  const filters: Record<string, unknown>[] = [];
  const owner = ownerRelationFilter(query.ownerPageId);
  if (owner) filters.push(owner);
  if (query.channel) {
    filters.push({ property: "Channel", select: { equals: query.channel } });
  }
  if (!filters.length) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export function taskQueryForViewer(
  viewer: { isAdmin: boolean; role: PortalRole; ownerId: string | null },
  ownerParam?: string | null,
): TaskListQuery {
  if (viewer.role === "Caller") return { channel: "Phone" };
  return {
    ownerPageId: ownerPageIdFromQueryParam(viewer.isAdmin, viewer.ownerId, ownerParam),
  };
}
