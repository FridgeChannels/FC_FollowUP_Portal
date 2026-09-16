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

/** Default list scope matches ReplyTask UI "Open". */
export type TaskStatusScope = "open" | "completed" | "all";

export function parseTaskStatusScope(value?: string | null): TaskStatusScope {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "completed" || normalized === "closed") return "completed";
  if (normalized === "all") return "all";
  return "open";
}

export function taskStatusFilter(scope: TaskStatusScope = "open") {
  if (scope === "all") return undefined;
  if (scope === "open") {
    return {
      or: [
        { property: "Task Status", status: { equals: "Pending" } },
        { property: "Task Status", status: { equals: "In Progress" } },
      ],
    };
  }
  return {
    or: [
      { property: "Task Status", status: { equals: "Completed" } },
      { property: "Task Status", status: { equals: "Failed" } },
      { property: "Task Status", status: { equals: "Cancelled" } },
    ],
  };
}

export type TaskListQuery = {
  ownerPageId?: string | null;
  channel?: string;
  /** Defaults to open when omitted. */
  statusScope?: TaskStatusScope;
};

export function taskListFilter(query: TaskListQuery = {}) {
  const filters: Record<string, unknown>[] = [];
  const owner = ownerRelationFilter(query.ownerPageId);
  if (owner) filters.push(owner);
  if (query.channel) {
    filters.push({ property: "Channel", select: { equals: query.channel } });
  }
  const status = taskStatusFilter(query.statusScope ?? "open");
  if (status) filters.push(status);
  if (!filters.length) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

export function taskQueryForViewer(
  viewer: { isAdmin: boolean; role: PortalRole; ownerId: string | null },
  ownerParam?: string | null,
  statusParam?: string | null,
): TaskListQuery {
  const statusScope = parseTaskStatusScope(statusParam);
  if (viewer.role === "Caller") {
    return { channel: "Phone", statusScope };
  }
  return {
    ownerPageId: ownerPageIdFromQueryParam(viewer.isAdmin, viewer.ownerId, ownerParam),
    statusScope,
  };
}
