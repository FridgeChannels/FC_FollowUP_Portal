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

export type NeedsReplyBrandScope = {
  ownerPageId?: string | null;
  includeTest?: boolean;
  onlyTest?: boolean;
  excludeStatuses?: string[];
};

/** Shared visibility rules for Needs Reply brand badge / reply-due list. */
export function matchesNeedsReplyBrandScope(
  brand: {
    ownerId?: string | null;
    isTest?: boolean;
    status: string;
  },
  input: NeedsReplyBrandScope = {},
) {
  if (input.onlyTest && !brand.isTest) return false;
  if (!input.onlyTest && input.includeTest === false && brand.isTest) return false;
  if (input.ownerPageId === null && brand.ownerId) return false;
  if (input.ownerPageId && brand.ownerId !== input.ownerPageId) return false;
  if (input.excludeStatuses?.includes(brand.status)) return false;
  return true;
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnlyParam(value?: string | null): string | undefined {
  const trimmed = value?.trim() || "";
  if (!DATE_ONLY.test(trimmed)) return undefined;
  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return trimmed;
}

function nextDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

/** Inclusive YYYY-MM-DD range on Task `Scheduled At` (datetime-safe via next-day exclusive end). */
export function scheduledAtRangeFilters(from?: string | null, to?: string | null) {
  const startRaw = parseDateOnlyParam(from);
  const endRaw = parseDateOnlyParam(to);
  if (!startRaw && !endRaw) return [];
  const start = startRaw && endRaw && startRaw > endRaw ? endRaw : startRaw;
  const end = startRaw && endRaw && startRaw > endRaw ? startRaw : endRaw;
  const filters: Record<string, unknown>[] = [];
  if (start) filters.push({ property: "Scheduled At", date: { on_or_after: start } });
  if (end) filters.push({ property: "Scheduled At", date: { before: nextDateOnly(end) } });
  return filters;
}

export type TaskListQuery = {
  ownerPageId?: string | null;
  /** Single channel (e.g. Phone). Ignored when `channels` is set. */
  channel?: string;
  /** OR of multiple Channel selects (e.g. reply channels). */
  channels?: string[];
  /** Defaults to open when omitted. */
  statusScope?: TaskStatusScope;
  /** Inclusive due-date start (YYYY-MM-DD), filters `Scheduled At`. */
  dueFrom?: string | null;
  /** Inclusive due-date end (YYYY-MM-DD), filters `Scheduled At`. */
  dueTo?: string | null;
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
  filters.push(...scheduledAtRangeFilters(query.dueFrom, query.dueTo));
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
