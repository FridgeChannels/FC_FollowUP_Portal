import type { PortalRole } from "./owner-role";

/** Follow-up ClientDB checkbox — Portal hides these clients and their tasks. */
export const FOLLOWUP_CLIENT_IS_TEST_PROPERTY = "Is Test";

export function andFilters(
  ...parts: Array<Record<string, unknown> | undefined | null>
): Record<string, unknown> | undefined {
  const filters = parts.filter((part): part is Record<string, unknown> => !!part);
  if (!filters.length) return undefined;
  if (filters.length === 1) return filters[0];
  return { and: filters };
}

/** Exclude Follow-up Clients marked as test data. */
export function nonTestClientFilter() {
  return {
    property: FOLLOWUP_CLIENT_IS_TEST_PROPERTY,
    checkbox: { equals: false },
  };
}

/** Only Follow-up Clients marked as test data. */
export function testClientFilter() {
  return {
    property: FOLLOWUP_CLIENT_IS_TEST_PROPERTY,
    checkbox: { equals: true },
  };
}

/** `undefined` = all owners, `null` = Owner is empty, string = specific Owner page. */
export function ownerRelationFilter(ownerPageId?: string | null) {
  if (ownerPageId === undefined) return undefined;
  if (!ownerPageId) {
    return { property: "Owner", relation: { is_empty: true } };
  }
  return { property: "Owner", relation: { contains: ownerPageId } };
}

/** Default Brands table page size. */
export const DEFAULT_BRAND_PAGE_SIZE = 10;

export function followupClientListFilter(options: {
  ownerPageId?: string | null;
  includeTest?: boolean;
  /** When true, only Follow-up Clients with `Is Test` checked (overrides includeTest). */
  onlyTest?: boolean;
  /** Exact Follow-up Status name, or omit / "all" for any. */
  status?: string | null;
  /** Extra statuses to exclude (e.g. Paused/Completed for non-Admin). */
  excludeStatuses?: string[];
  /** Follow-up Client title contains (approx. brand search). */
  titleContains?: string | null;
  /** Current CP relation page id. */
  currentCpPageId?: string | null;
} = {}) {
  const testScope = options.onlyTest
    ? testClientFilter()
    : options.includeTest
      ? undefined
      : nonTestClientFilter();
  const filters: Array<Record<string, unknown> | undefined | null> = [
    ownerRelationFilter(options.ownerPageId),
    testScope,
  ];
  const status = options.status?.trim();
  if (status && status !== "all") {
    filters.push({ property: "Follow-up Status", status: { equals: status } });
  }
  for (const excluded of options.excludeStatuses || []) {
    const name = excluded.trim();
    if (!name) continue;
    filters.push({ property: "Follow-up Status", status: { does_not_equal: name } });
  }
  const title = options.titleContains?.trim();
  if (title) {
    filters.push({
      property: "Follow-up Client",
      title: { contains: title },
    });
  }
  if (options.currentCpPageId) {
    filters.push({
      property: "Current CP",
      relation: { contains: options.currentCpPageId },
    });
  }
  return andFilters(...filters);
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

/** Default list page size for `/api/tasks` and ReplyTask UI. */
export const DEFAULT_TASK_PAGE_SIZE = 25;

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
  /** Single channel (e.g. Phone). Ignored when `channels` is set. */
  channel?: string;
  /** OR of multiple Channel selects (e.g. reply channels). */
  channels?: string[];
  /** Defaults to open when omitted. */
  statusScope?: TaskStatusScope;
};

export function taskListFilter(query: TaskListQuery = {}) {
  const filters: Record<string, unknown>[] = [];
  const owner = ownerRelationFilter(query.ownerPageId);
  if (owner) filters.push(owner);
  if (query.channels?.length) {
    if (query.channels.length === 1) {
      filters.push({ property: "Channel", select: { equals: query.channels[0] } });
    } else {
      filters.push({
        or: query.channels.map((channel) => ({
          property: "Channel",
          select: { equals: channel },
        })),
      });
    }
  } else if (query.channel) {
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
    return {
      channel: "Phone",
      statusScope,
    };
  }
  return {
    ownerPageId: ownerPageIdFromQueryParam(viewer.isAdmin, viewer.ownerId, ownerParam),
    statusScope,
  };
}
