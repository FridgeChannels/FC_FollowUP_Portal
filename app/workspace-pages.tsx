/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownLeft,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import {
  cacheBrandItem,
  cacheBrandListPage,
  clearBrandListPageCache,
  consumeBrandListPageRefreshRequest,
  getCachedBrandListPage,
} from "@/lib/brand-list-cache";
import {
  FOLLOW_UP_STATUSES,
  listApplicableCps,
  type BrandListItem,
} from "@/lib/brand-list";
import { Contact, dateOnly } from "@/lib/outreach-domain";
import { brandListMetadata } from "@/lib/page-metadata";
import { DEFAULT_BRAND_PAGE_SIZE } from "@/lib/notion/owner-filter";
import { compareBrandListItems } from "@/lib/notion/brand-list-order";
import { usePageMetadata } from "./use-page-metadata";
import { formatEasternDateTime } from "./bomb-plan";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  GlassPagination,
  GlassPaginationContent,
  GlassPaginationEllipsis,
  GlassPaginationItem,
  GlassPaginationLink,
  GlassPaginationNext,
  GlassPaginationPrevious,
} from "@/components/ui/glass-pagination";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandContactsEditor, emptyContactDraft, validContactDrafts, type ContactDraft } from "./brand-contacts-editor";
import { BrandNote } from "./brand-note";
import { WORK_REPLY_CHANNELS, type BrandWorkPayload } from "@/lib/brand-work";
import { ChannelIcon } from "./channel-icon";

const cx = (...v: (string | false | undefined | null)[]) =>
  v.filter(Boolean).join(" ");
const show = (r: { ok: boolean; message: string }) =>
  r.ok ? toast.success(r.message) : toast.error(r.message);
export function CP({ value }: { value: string }) {
  const tone =
    { NONE: "bg-slate-50 text-slate-600", Nurture: "bg-slate-100 text-slate-700", CP1: "ui-cp-1", CP2: "ui-cp-2", CP3: "ui-cp-3", CP4: "bg-amber-50 text-amber-700", CP5: "bg-sky-50 text-sky-700", CP6: "bg-rose-50 text-rose-700" }[value] ||
    "ui-cp-1";
  return (
    <Badge
      variant="outline"
      className={cx("rounded-md px-2 font-mono text-[11px] font-bold", tone)}
    >
      {value}
    </Badge>
  );
}
export function Status({ value }: { value: string }) {
  const style =
    value === "Bomb Running" ||
    value === "Active" ||
    value === "Running" ||
    value === "Scheduled"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : value === "Human Handling" || value === "Needs Reply"
        ? "bg-violet-50 text-violet-700 ring-violet-200"
        : value.includes("Due") ||
            value === "Urgent" ||
            value === "Failed" ||
            value === "Needs Attention"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : value === "In Progress"
            ? "bg-blue-50 text-blue-700 ring-blue-200"
            : value === "Terminated"
              ? "bg-rose-50 text-rose-700 ring-rose-200"
          : value === "Ready" ||
              value === "Connected" ||
              value === "Completed" ||
              value === "Delivered"
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : value === "Paused" ||
                value === "Unassigned" ||
                value === "Inactive" ||
                value === "Cancelled" ||
                value === "Closed" ||
                value === "Disconnected"
              ? "bg-slate-100 text-slate-600 ring-slate-200"
              : value === "Draft"
                ? "bg-orange-50 text-orange-700 ring-orange-200"
                : "bg-cyan-50 text-cyan-700 ring-cyan-200";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        style,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {value === "Bomb Running" ? "OmniReach Running" : value}
    </span>
  );
}

function lastInteractionLabel(item: BrandListItem) {
  const channel = item.lastInteractionChannel || "Interaction";
  const outcome =
    item.lastInteractionCallResult ||
    (item.lastInteractionDirection === "Inbound"
      ? "Reply"
      : item.lastInteractionStatus || "");
  return [channel, outcome].filter(Boolean).join(" · ");
}
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="ui-eyebrow mb-1 text-xs font-semibold uppercase tracking-[.14em]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-[-.035em] text-slate-950 sm:text-[28px]">
          {title}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
function Metric({
  label,
  value,
  sub,
  color = "bg-violet-500",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="mb-4 flex items-center justify-between text-sm font-medium text-slate-500">
        <span>{label}</span>
        <span className={cx("size-2 rounded-full", color)} />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold tracking-[-.05em] text-slate-950">
          {value}
        </span>
        {sub && (
          <span className="text-xs font-semibold text-slate-500">{sub}</span>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { state } = useWorkspace();
  const router = useRouter();
  const active = state.bombInstances.filter(
    (b) => b.status === "Running",
  ).length;
  const needs = state.inbox.filter((i) => i.status === "Needs Reply");
  const due = state.followUps.filter((f) => f.status === "Due");
  const calls = state.callTasks.filter(
    (t) =>
      dateOnly(t.scheduledDate) === dateOnly(state.simulatedDate) &&
      t.status === "Scheduled",
  );
  const failed = state.actions.filter((a) => a.status === "Failed");
  const queue = [
    ...needs.map((i) => ({
      id: i.id,
      path: `/inbox/${i.id}`,
      title: `Reply to ${state.customers.find((c) => c.id === i.customerId)?.name}`,
      meta: i.preview,
      icon: MessageCircle,
      tone: "bg-violet-100 text-violet-700",
    })),
    ...due.map((f) => ({
      id: f.id,
      path: `/inbox/${f.inboxItemId}`,
      title: `Follow up with ${state.customers.find((c) => c.id === f.customerId)?.name}`,
      meta: `Due ${dateOnly(f.dueAt)}`,
      icon: CalendarClock,
      tone: "bg-amber-100 text-amber-700",
    })),
    ...calls.slice(0, 2).map((t) => ({
      id: t.id,
      path: `/call-tasks/${t.id}`,
      title: `Call ${state.customers.find((c) => c.id === t.customerId)?.name}`,
      meta: t.goal,
      icon: PhoneCall,
      tone: "bg-blue-100 text-blue-700",
    })),
    ...failed.map((a) => ({
      id: a.id,
      path: `/customers/${a.customerId}`,
      title: `${a.channel} action failed`,
      meta: a.note || "Provider failure",
      icon: CircleAlert,
      tone: "bg-rose-100 text-rose-700",
    })),
  ].slice(0, 6);
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow={dateOnly(state.simulatedDate)}
        title="Operations dashboard"
      >
        <Button
          variant="outline"
          className="bg-white"
          onClick={() => router.push("/analytics")}
        >
          <BarChart3 className="mr-2 size-4" />
          View analytics
        </Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Needs human reply"
          value={String(needs.length)}
          sub="Human owned"
        />
        <Metric
          label="Calls remaining"
          value={String(calls.length)}
          sub="Today"
          color="bg-amber-500"
        />
        <Metric
          label="Active OmniReach"
          value={String(active)}
          sub="Running now"
          color="bg-blue-500"
        />
        <Metric
          label="Follow-ups due"
          value={String(due.length)}
          sub="Manual action"
          color="bg-rose-500"
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <section className="overflow-hidden rounded-2xl bg-white">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <h2 className="font-bold">Priority queue</h2>
              <p className="text-xs text-slate-500">
                Sorted by required human action
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/inbox")}
            >
              Open inbox
              <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
          {queue.length ? (
            <div className="divide-y divide-slate-100">
              {queue.map((item) => (
                <button
                  key={item.id}
                  onClick={() => router.push(item.path)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <span
                    className={cx(
                      "grid size-10 place-items-center rounded-xl",
                      item.tone,
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {item.meta}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-slate-300" />
                </button>
              ))}
            </div>
          ) : (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 />
                </EmptyMedia>
                <EmptyTitle>All caught up</EmptyTitle>
                <EmptyDescription>No human action is due.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>
        <section className="rounded-2xl bg-slate-950 p-5 text-white">
          <div className="flex justify-between">
            <div>
              <div className="text-xs uppercase tracking-[.14em] text-violet-300">
                Workflow pulse
              </div>
              <h2 className="mt-1 text-lg font-bold">Current state</h2>
            </div>
            <Activity className="size-5 text-emerald-300" />
          </div>
          <div className="mt-8 space-y-5">
            {[
              {
                l: "Scheduled actions",
                v: state.actions.filter((a) => a.status === "Scheduled").length,
                c: "bg-violet-500",
              },
              {
                l: "Completed calls",
                v: state.callTasks.filter((t) => t.status === "Completed")
                  .length,
                c: "bg-emerald-400",
              },
              { l: "Failed actions", v: failed.length, c: "bg-rose-400" },
            ].map((x) => (
              <div key={x.l}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{x.l}</span>
                  <b>{x.v}</b>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div
                    className={cx("h-full rounded-full", x.c)}
                    style={{ width: `${Math.min(100, 15 + x.v * 10)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl bg-white p-5">
        <div className="mb-5 flex justify-between">
          <div>
            <h2 className="font-bold">CP distribution</h2>
            <p className="text-xs text-slate-500">Brand-owned progression</p>
          </div>
          <button
            className="text-xs font-semibold text-violet-700"
            onClick={() => router.push("/workflow")}
          >
            View workflow
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {state.cps.map((cp, i) => {
            const count = state.customers.filter(
              (c) => c.cp === cp.code && c.status !== "Closed",
            ).length;
            return (
              <button
                key={cp.code}
                onClick={() => router.push(`/customers?cp=${cp.code}`)}
                className="rounded-xl bg-slate-50/80 p-4 text-left hover:bg-violet-50"
              >
                <div className="flex items-center justify-between">
                  <CP value={cp.code} />
                  <span className="text-xl font-bold">{count}</span>
                </div>
                <div className="mt-3 text-sm font-semibold">{cp.name}</div>
                <div className="mt-1 text-xs text-slate-500">{cp.goal}</div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-200">
                  <div
                    className={cx(
                      "h-full rounded-full",
                      [
                        "bg-slate-400",
                        "bg-violet-500",
                        "bg-blue-500",
                        "bg-emerald-500",
                      ][i],
                    )}
                    style={{
                      width: `${Math.max(12, (count / state.customers.length) * 100)}%`,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function HandlingMode({ value }: { value: BrandListItem["handlingMode"] }) {
  if (!value) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        value === "Human"
          ? "bg-orange-50 text-orange-700 ring-orange-200"
          : "bg-blue-50 text-blue-700 ring-blue-200",
      )}
    >
      {value}
    </span>
  );
}

type BrandListFilters = {
  view: "myWork" | "all";
  workQ: string;
  action: "all" | "assignments" | "replies" | "callReview";
  q: string;
  status: string;
  cp: string;
  owner: string;
  replyState: string;
  handlingMode: string;
  /** Follow-up Exhibition Notion page id (`all` = no filter). */
  exhibitionId: string;
  sort: string;
  replyFrom: string;
  replyTo: string;
};

type ExhibitionOption = { id: string; name: string };

const BRAND_SEARCH_DEBOUNCE_MS = 800;
const BRAND_LIST_PAGINATION_STORAGE_KEY = "followup.brand-list-pagination.v1";
const BRAND_LIST_PAGE_CACHE_TTL_MS = 30_000;
const BRAND_LIST_VISIBLE_SORTS = new Set([
  "ownerAssignedNewest",
  "lastInboundNewest",
  "lastOutboundNewest",
  "nameAsc",
  "nameDesc",
]);

type BrandListPagination = {
  cursor: string | null;
  cursorStack: Array<string | null>;
  page: number;
};

function brandListFiltersFromSearch(
  search: URLSearchParams,
  defaultView: BrandListFilters["view"] = "myWork",
): BrandListFilters {
  const requestedView = search.get("view");
  const legacyReplyState = search.get("replyState");
  const requestedAction = search.get("action");
  return {
    view: requestedView === "all" || requestedView === "myWork"
      ? requestedView
      : defaultView,
    workQ: search.get("workQ") ?? "",
    action: requestedAction === "assignments" || requestedAction === "replies" || requestedAction === "callReview" ? requestedAction : requestedView === "replies" || requestedView === "callReview" ? requestedView : legacyReplyState === "needsReply" ? "replies" : legacyReplyState === "qualification" ? "callReview" : "all",
    q: search.get("q") ?? "",
    status: search.get("status") ?? "all",
    cp: search.get("cp") ?? "all",
    owner: search.get("owner") ?? "all",
    replyState: search.get("replyState") ?? "all",
    handlingMode: search.get("handlingMode") ?? "all",
    exhibitionId: search.get("exhibitionId") ?? "all",
    sort: BRAND_LIST_VISIBLE_SORTS.has(search.get("sort") ?? "") ? search.get("sort")! : "ownerAssignedNewest",
    replyFrom: search.get("replyFrom") ?? "",
    replyTo: search.get("replyTo") ?? "",
  };
}

function brandListPath(
  filters: BrandListFilters,
  pagination?: Pick<BrandListPagination, "cursor" | "page">,
) {
  const params = new URLSearchParams();
  params.set("view", filters.view);
  if (filters.workQ.trim()) params.set("workQ", filters.workQ);
  if (filters.action !== "all") params.set("action", filters.action);
  if (filters.q.trim()) params.set("q", filters.q);
  if (filters.cp !== "all") params.set("cp", filters.cp);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  if (filters.replyState !== "all") params.set("replyState", filters.replyState);
  if (filters.handlingMode !== "all") params.set("handlingMode", filters.handlingMode);
  if (filters.exhibitionId !== "all") params.set("exhibitionId", filters.exhibitionId);
  // Keep the default explicit so the API does not fall back to its legacy priority order.
  params.set("sort", filters.sort);
  if (filters.replyFrom) params.set("replyFrom", filters.replyFrom);
  if (filters.replyTo) params.set("replyTo", filters.replyTo);
  if (pagination?.cursor) params.set("cursor", pagination.cursor);
  if (pagination && pagination.page > 1) params.set("page", String(pagination.page));
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

function brandListPaginationStorageKey(filters: BrandListFilters, viewerId: string) {
  return `${BRAND_LIST_PAGINATION_STORAGE_KEY}:${viewerId}:${brandListPath(filters)}`;
}

function pageFromSearch(search: URLSearchParams) {
  const page = Number.parseInt(search.get("page") || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function patchBrandListItem(id: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/brands/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    brand?: BrandListItem;
    error?: string;
  };
  if (!response.ok || !payload.brand) throw new Error(payload.error || "Update failed");
  return payload.brand;
}

function mergeBrandListItem(current: BrandListItem, next: BrandListItem): BrandListItem {
  return {
    ...current,
    ownerId: next.ownerId,
    ownerName: next.ownerName,
    ownerEmail: next.ownerEmail,
    ownerAssignedAt: next.ownerAssignedAt,
    ownerAssignmentHandledAt: next.ownerAssignmentHandledAt,
    followupExhibition: next.followupExhibition ?? current.followupExhibition,
    humanNotes: next.humanNotes ?? current.humanNotes,
    status: next.status,
    handlingMode: next.handlingMode,
    currentCp: next.currentCp,
    currentCpId: next.currentCpId,
    lastInteractionAt: next.lastInteractionAt,
    lastInteractionChannel: next.lastInteractionChannel,
    lastInteractionDirection: next.lastInteractionDirection,
    lastInteractionStatus: next.lastInteractionStatus,
    lastInteractionCallResult: next.lastInteractionCallResult,
    lastReplyAt: next.lastReplyAt,
    needsReply: next.needsReply ?? current.needsReply,
    needsQualification: next.needsQualification ?? current.needsQualification,
    qualificationTaskCount: next.qualificationTaskCount ?? current.qualificationTaskCount,
    replyPreview: next.replyPreview ?? current.replyPreview,
    replyDueAt: next.replyDueAt ?? current.replyDueAt,
    replyUpdatedAt: next.replyDueAt ?? next.replyUpdatedAt ?? current.replyDueAt ?? current.replyUpdatedAt,
  };
}

/** Calendar days between the event's local date and today (not rolling 24h windows). */
function daysSince(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfEventDay = new Date(date);
  startOfEventDay.setHours(0, 0, 0, 0);
  return String(
    Math.max(0, Math.round((startOfToday.getTime() - startOfEventDay.getTime()) / 86_400_000)),
  );
}

export function BrandsPage({ active = true }: { active?: boolean }) {
  const { state, can } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = state.currentRole === "Admin";
  const showStatusColumn = state.currentRole !== "AccountManager";
  const canReviewQualification = state.currentRole !== "Caller";
  const [filters, setFilters] = useState<BrandListFilters>(() =>
    brandListFiltersFromSearch(searchParams, isAdmin ? "all" : "myWork"),
  );
  const workView = state.currentRole === "Caller" ? "all" : filters.view;
  const { q: query, status, cp, owner, replyState, handlingMode, exhibitionId, sort, replyFrom, replyTo } = filters;
  const [exhibitionOptions, setExhibitionOptions] = useState<ExhibitionOption[]>([]);
  const [exhibitionOptionsLoading, setExhibitionOptionsLoading] = useState(false);
  const [listReloadToken, setListReloadToken] = useState(0);
  const effectiveStatus = isAdmin ? status : "all";
  const [brands, setBrands] = useState<BrandListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(() => searchParams.get("cursor"));
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [pageNumber, setPageNumber] = useState(() => pageFromSearch(searchParams));
  const [paginationRestored, setPaginationRestored] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const pageCursorMap = useRef<Record<number, string | null>>({ 1: null });
  const [ownerOptions, setOwnerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cps = listApplicableCps();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [searchComposing, setSearchComposing] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [listEpoch, setListEpoch] = useState(0);
  const [workReloadToken, setWorkReloadToken] = useState(0);
  const [work, setWork] = useState<BrandWorkPayload | null>(null);
  const [workLoading, setWorkLoading] = useState(true);
  const [workError, setWorkError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || state.currentRole === "Caller") return;
    const controller = new AbortController();
    setWorkLoading(true);
    setWorkError(null);
    setWork(null);
    fetch("/api/brands/work", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as BrandWorkPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load work");
        return payload;
      })
      .then((payload) => { if (!controller.signal.aborted) setWork(payload); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setWorkError(error instanceof Error ? error.message : "Unable to load work"); })
      .finally(() => { if (!controller.signal.aborted) setWorkLoading(false); });
    return () => controller.abort();
  }, [active, state.currentUserId, state.currentRole, listEpoch, listReloadToken, workReloadToken]);
  const paginationStorageKey = brandListPaginationStorageKey(filters, state.currentUserId);
  const initialPaginationStorageKey = useRef(paginationStorageKey);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(initialPaginationStorageKey.current);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BrandListPagination>;
        const savedCursor = typeof parsed.cursor === "string" ? parsed.cursor : null;
        if (
          savedCursor === cursor &&
          parsed.page === pageNumber &&
          Array.isArray(parsed.cursorStack)
        ) {
          setCursorStack(
            parsed.cursorStack.map((item) => (typeof item === "string" ? item : null)),
          );
        }
      }
    } catch {
      // A missing or invalid session cache should not block the list.
    } finally {
      setPaginationRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!paginationRestored) return;
    try {
      window.sessionStorage.setItem(
        paginationStorageKey,
        JSON.stringify({ cursor, cursorStack, page: pageNumber } satisfies BrandListPagination),
      );
    } catch {
      // Pagination still works through the URL if session storage is unavailable.
    }
  }, [cursor, cursorStack, pageNumber, paginationRestored, paginationStorageKey]);

  useEffect(() => {
    if (searchComposing) return;
    const timer = window.setTimeout(
      () => setDebouncedQuery(query),
      BRAND_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query, searchComposing]);

  const applyBrandUpdate = (brand: BrandListItem) => {
    cacheBrandItem(brand);
    setBrands((prev) =>
      prev.map((item) => (item.id === brand.id ? mergeBrandListItem(item, brand) : item)),
    );
    setWork((prev) => prev ? {
      ...prev,
      brands: prev.brands.map((row) => row.brand.id === brand.id
        ? { ...row, brand: mergeBrandListItem(row.brand, brand) }
        : row),
    } : prev);
  };
  const setListParam = (key: keyof BrandListFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      window.history.replaceState(window.history.state, "", brandListPath(next));
      return next;
    });
    setCursor(null);
    setCursorStack([]);
    setPageNumber(1);
    setNextCursor(null);
    setHasMore(false);
    pageCursorMap.current = { 1: null };
  };
  const resetListFilters = (nextReplyState = "all", nextSort = "ownerAssignedNewest") => {
    const next: BrandListFilters = {
      view: filters.view,
      workQ: filters.workQ,
      action: filters.action,
      q: "",
      status: "all",
      cp: "all",
      owner: "all",
      replyState: nextReplyState,
      handlingMode: "all",
      exhibitionId: "all",
      sort: nextSort,
      replyFrom: "",
      replyTo: "",
    };
    setFilters(next);
    window.history.replaceState(window.history.state, "", brandListPath(next));
    setDebouncedQuery("");
    setCursor(null);
    setCursorStack([]);
    setPageNumber(1);
    setNextCursor(null);
    setHasMore(false);
    pageCursorMap.current = { 1: null };
  };
  const clearAllListFilters = () => resetListFilters();
  const setWorkView = (view: BrandListFilters["view"]) => {
    setFilters((previous) => {
      const next = { ...previous, view };
      window.history.replaceState(window.history.state, "", brandListPath(next, view === "all" ? { cursor, page: pageNumber } : undefined));
      return next;
    });
  };
  const setWorkFilter = (patch: Partial<BrandListFilters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      window.history.replaceState(window.history.state, "", brandListPath(next));
      return next;
    });
  };
  useEffect(() => {
    const onPopState = () => {
      setFilters(brandListFiltersFromSearch(
        new URLSearchParams(window.location.search),
        isAdmin ? "all" : "myWork",
      ));
      setCursor(new URLSearchParams(window.location.search).get("cursor"));
      setCursorStack([]);
      setPageNumber(pageFromSearch(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin) {
      setOwnerOptions([]);
      return;
    }
    let cancelled = false;
    fetch("/api/owners")
      .then(async (response) => {
        const payload = (await response.json()) as {
          owners?: Array<{ id: string; name: string }>;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load owners");
        return payload.owners || [];
      })
      .then((items) => {
        if (!cancelled) setOwnerOptions(items);
      })
      .catch(() => {
        if (!cancelled) setOwnerOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const loadExhibitionOptions = () => {
    let cancelled = false;
    setExhibitionOptionsLoading(true);
    fetch("/api/exhibitions/options")
      .then(async (response) => {
        const payload = (await response.json()) as {
          exhibitions?: ExhibitionOption[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load exhibitions");
        return payload.exhibitions || [];
      })
      .then((items) => {
        if (!cancelled) setExhibitionOptions(items);
      })
      .catch(() => {
        if (!cancelled) setExhibitionOptions([]);
      })
      .finally(() => {
        if (!cancelled) setExhibitionOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    if (!active) return;
    return loadExhibitionOptions();
  }, [active, state.currentUserId, state.currentRole]);

  useEffect(() => {
    const onCachesCleared = () => {
      clearBrandListPageCache();
      loadExhibitionOptions();
      setCursor(null);
      setCursorStack([]);
      setPageNumber(1);
      setNextCursor(null);
      setHasMore(false);
      pageCursorMap.current = { 1: null };
      setListReloadToken((value) => value + 1);
    };
    const onBrandListRefresh = () => {
      setListEpoch((value) => value + 1);
    };
    window.addEventListener("fc-portal-caches-cleared", onCachesCleared);
    window.addEventListener("fc-brand-list-refresh", onBrandListRefresh);
    return () => {
      window.removeEventListener("fc-portal-caches-cleared", onCachesCleared);
      window.removeEventListener("fc-brand-list-refresh", onBrandListRefresh);
    };
  }, []);

  const brandsFilterKey = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (cp !== "all") params.set("cp", cp);
    if (isAdmin && effectiveStatus !== "all") params.set("status", effectiveStatus);
    if (isAdmin && owner !== "all") params.set("owner", owner);
    if (replyState !== "all") params.set("replyState", replyState);
    if (handlingMode !== "all") params.set("handlingMode", handlingMode);
    if (exhibitionId !== "all") params.set("exhibitionId", exhibitionId);
    if (sort !== "nameAsc") params.set("sort", sort);
    if (replyFrom) params.set("replyFrom", replyFrom);
    if (replyTo) params.set("replyTo", replyTo);
    return params.toString();
  }, [debouncedQuery, cp, effectiveStatus, owner, replyState, handlingMode, exhibitionId, sort, replyFrom, replyTo, isAdmin]);
  const brandListPageCacheKey = `${state.currentUserId}:${state.currentRole}:${brandsFilterKey}:${cursor || ""}:${listReloadToken}`;

  useEffect(() => {
    if (workView !== "all") return;
    let cancelled = false;
    const controller = new AbortController();
    const forceRefresh = consumeBrandListPageRefreshRequest();
    const cachedPage = getCachedBrandListPage(brandListPageCacheKey);
    const cacheIsFresh =
      Boolean(cachedPage) &&
      !forceRefresh &&
      Date.now() - (cachedPage?.cachedAt || 0) < BRAND_LIST_PAGE_CACHE_TTL_MS;
    if (cachedPage) {
      setBrands(cachedPage.brands);
      setNextCursor(cachedPage.nextCursor);
      setHasMore(cachedPage.hasMore);
      setLoading(false);
      setRefreshing(!cacheIsFresh);
    } else {
      setLoading(true);
      setRefreshing(false);
    }
    setError(undefined);
    if (cacheIsFresh) {
      return () => controller.abort();
    }
    const params = new URLSearchParams(brandsFilterKey);
    params.set("limit", String(DEFAULT_BRAND_PAGE_SIZE));
    if (cursor) params.set("cursor", cursor);
    fetch(`/api/brands?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          brands?: BrandListItem[];
          nextCursor?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load brands");
        return payload;
      })
      .then((payload) => {
        if (cancelled) return;
        const items = payload.brands || [];
        const resolvedNextCursor = payload.nextCursor || null;
        const resolvedHasMore = Boolean(payload.hasMore && payload.nextCursor);
        const cachedAt = Date.now();
        items.forEach(cacheBrandItem);
        setBrands(items);
        setNextCursor(resolvedNextCursor);
        setHasMore(resolvedHasMore);
        if (resolvedNextCursor) pageCursorMap.current[pageNumber + 1] = resolvedNextCursor;
        cacheBrandListPage({
          key: brandListPageCacheKey,
          brands: items,
          nextCursor: resolvedNextCursor,
          hasMore: resolvedHasMore,
          cachedAt,
        });
        setError(undefined);
        if (items.length) {
          const signalParams = new URLSearchParams({
            ids: items.map((item) => item.id).join(","),
          });
          void fetch(`/api/brands/signals?${signalParams.toString()}`, {
            signal: controller.signal,
          })
            .then(async (response) => {
              const signalPayload = (await response.json()) as {
                signals?: Array<
                  Pick<
                    BrandListItem,
                    | "id"
                    | "lastInteractionAt"
                    | "lastInteractionChannel"
                    | "lastInteractionDirection"
                    | "lastInteractionStatus"
                    | "lastInteractionCallResult"
                    | "lastReplyAt"
                    | "needsQualification"
                    | "qualificationTaskCount"
                  >
                >;
              };
              if (!response.ok) return [];
              return signalPayload.signals || [];
            })
            .then((signals) => {
              if (cancelled || !signals.length) return;
              const byId = new Map(signals.map((signal) => [signal.id, signal]));
              setBrands((current) => {
                const mergedItems = current.map((item) => {
                  const signal = byId.get(item.id);
                  if (!signal) return item;
                  const merged = { ...item, ...signal };
                  cacheBrandItem(merged);
                  return merged;
                });
                cacheBrandListPage({
                  key: brandListPageCacheKey,
                  brands: mergedItems,
                  nextCursor: resolvedNextCursor,
                  hasMore: resolvedHasMore,
                  cachedAt,
                });
                return mergedItems;
              });
            })
            .catch(() => undefined);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to load brands");
        if (!cachedPage) {
          setBrands([]);
          setNextCursor(null);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [brandListPageCacheKey, brandsFilterKey, cursor, listEpoch, workView]);

  useEffect(() => {
    if (!active || workView !== "all") return;
    const controller = new AbortController();
    setTotalCount(null);
    const params = new URLSearchParams(brandsFilterKey);
    params.set("count", "1");
    fetch(`/api/brands?${params.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { totalCount?: number };
        const count = payload.totalCount;
        if (!response.ok || typeof count !== "number" || !Number.isInteger(count) || count < 0) {
          throw new Error("Unable to load total brand count");
        }
        return count;
      })
      .then((count) => {
        if (!controller.signal.aborted) setTotalCount(count);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTotalCount(null);
      });
    return () => controller.abort();
  }, [active, brandsFilterKey, listEpoch, state.currentRole, state.currentUserId, workView]);

  const goNextPage = () => {
    if (!nextCursor || !hasMore || loading) return;
    const nextStack = [...cursorStack, cursor];
    const nextPage = pageNumber + 1;
    setCursorStack(nextStack);
    setCursor(nextCursor);
    setPageNumber(nextPage);
    pageCursorMap.current[nextPage] = nextCursor;
    window.history.replaceState(
      window.history.state,
      "",
      brandListPath(filters, { cursor: nextCursor, page: nextPage }),
    );
  };
  const goPrevPage = () => {
    if (!cursorStack.length || loading) return;
    const stack = [...cursorStack];
    const prev = stack.pop() ?? null;
    const prevPage = Math.max(1, pageNumber - 1);
    setCursorStack(stack);
    setCursor(prev);
    setPageNumber(prevPage);
    window.history.replaceState(
      window.history.state,
      "",
      brandListPath(filters, { cursor: prev, page: prevPage }),
    );
  };

  const goToPage = async (requestedPage: number) => {
    const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / DEFAULT_BRAND_PAGE_SIZE)) : null;
    if (!totalPages || !Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > totalPages || requestedPage === pageNumber || loading) return;
    let targetCursor = pageCursorMap.current[requestedPage];
    if (targetCursor === undefined) {
      let knownPage = pageNumber;
      let knownCursor = cursor;
      while (knownPage < requestedPage) {
        const params = new URLSearchParams(brandsFilterKey);
        params.set("limit", String(DEFAULT_BRAND_PAGE_SIZE));
        if (knownCursor) params.set("cursor", knownCursor);
        const response = await fetch(`/api/brands?${params.toString()}`);
        const payload = (await response.json()) as { nextCursor?: string | null; hasMore?: boolean };
        if (!response.ok || !payload.nextCursor || !payload.hasMore) return;
        knownPage += 1;
        knownCursor = payload.nextCursor;
        pageCursorMap.current[knownPage] = knownCursor;
      }
      targetCursor = knownCursor;
    }
    const nextStack = Array.from({ length: Math.max(0, requestedPage - 1) }, (_, index) => pageCursorMap.current[index + 1] ?? null);
    setCursorStack(nextStack);
    setCursor(targetCursor ?? null);
    setPageNumber(requestedPage);
    window.history.replaceState(window.history.state, "", brandListPath(filters, { cursor: targetCursor ?? null, page: requestedPage }));
  };
  const totalPages = totalCount ? Math.max(1, Math.ceil(totalCount / DEFAULT_BRAND_PAGE_SIZE)) : null;
  const paginationItems = totalPages
    ? (() => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1) as Array<number | "ellipsis">;
        const pages = [...new Set([1, pageNumber - 1, pageNumber, pageNumber + 1, totalPages])]
          .filter((page) => page >= 1 && page <= totalPages)
          .sort((a, b) => a - b);
        return pages.flatMap((page, index) => index && page - pages[index - 1] > 1 ? ["ellipsis" as const, page] : [page]);
      })()
    : [pageNumber];

  // The work view uses the same row data and table as All Brands.
  const selectedExhibitionName = exhibitionId === "all"
    ? null
    : exhibitionOptions.find((item) => item.id === exhibitionId)?.name ?? null;
  const workSearch = (query || filters.workQ).trim().toLowerCase();
  const workRows = (work?.brands || [])
    .filter((row) => filters.action === "all"
      || filters.action === "assignments" && !!row.newAssignment
      || filters.action === "replies" && WORK_REPLY_CHANNELS.some((channel) => !!row.channels[channel])
      || filters.action === "callReview" && !!row.callReview)
    .filter((row) => !workSearch || row.brand.name.toLowerCase().includes(workSearch))
    .filter((row) => cp === "all" || row.brand.currentCp === cp)
    .filter((row) => handlingMode === "all" || row.brand.handlingMode === handlingMode)
    .filter((row) => !selectedExhibitionName || row.brand.followupExhibition === selectedExhibitionName)
    .filter((row) => !isAdmin || status === "all" || row.brand.status === status)
    .filter((row) => !isAdmin || owner === "all" || owner === "unassigned" && !row.brand.ownerId || row.brand.ownerId === owner)
    .sort((a, b) => compareBrandListItems(a.brand, b.brand, sort as Parameters<typeof compareBrandListItems>[2]));
  const workByBrandId = new Map((work?.brands || []).map((row) => [row.brand.id, row]));
  const filtered = workView === "all" ? brands : workRows.map((row) => row.brand);
  const currentListPath = brandListPath(filters, { cursor, page: pageNumber });
  const brandDetailPath = (brandId: string, target?: { replyId?: string; taskId?: string; assignment?: boolean }) => {
    const params = new URLSearchParams({ returnTo: currentListPath });
    if (target?.replyId) params.set("workReply", target.replyId);
    if (target?.taskId) params.set("workTask", target.taskId);
    if (target?.assignment) params.set("newAssignment", "1");
    return `/customers/${encodeURIComponent(brandId)}?${params}`;
  };
  const listScrollKey = `brands-list-scroll:${state.currentUserId}:${workView}`;
  const openBrand = (brandId: string, target?: { replyId?: string; taskId?: string; assignment?: boolean }) => {
    try { window.sessionStorage.setItem(listScrollKey, String(window.scrollY)); } catch { /* Navigation still works. */ }
    router.push(brandDetailPath(brandId, target));
  };
  useEffect(() => {
    if (workView === "all" ? loading : workLoading || !work) return;
    let y = 0;
    try {
      y = Number(window.sessionStorage.getItem(listScrollKey) || 0);
      window.sessionStorage.removeItem(listScrollKey);
    } catch { return; }
    if (!y) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, y));
    return () => cancelAnimationFrame(frame);
  }, [workView, workLoading, work, loading, listScrollKey]);
  const owners = useMemo(() => {
    if (ownerOptions.length) return ownerOptions;
    const seen = new Map<string, string>();
    brands.forEach((brand) => {
      if (brand.ownerId && brand.ownerName && !seen.has(brand.ownerId)) {
        seen.set(brand.ownerId, brand.ownerName);
      }
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [brands, ownerOptions]);
  useEffect(() => {
    const visible = new Set(filtered.map((item) => item.id));
    setSelected((ids) => {
      const next = ids.filter((id) => visible.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [filtered]);
  const runBulkUpdate = async (
    ids: string[],
    bodyFor: (brand: BrandListItem) => Record<string, unknown>,
    successMessage: string,
  ) => {
    if (!ids.length || busy) return;
    setBusy(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        const brand = brands.find((item) => item.id === id);
        if (!brand) continue;
        try {
          applyBrandUpdate(await patchBrandListItem(id, bodyFor(brand)));
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      if (ok && !failed) toast.success(successMessage);
      else if (ok) toast.success(`${ok} updated, ${failed} failed`);
      else toast.error("Update failed");
      if (ok) {
        setSelected([]);
        setWorkReloadToken((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  };
  const assignSelected = (ownerId: string) => {
    const nextOwnerId = ownerId === "unassigned" ? null : ownerId;
    void runBulkUpdate(
      selected,
      (brand) => ({
        ownerId: nextOwnerId,
        ...(nextOwnerId && (!brand.status || brand.status === "Unassigned")
          ? { status: "Ready" }
          : {}),
      }),
      "AccountManager assigned",
    );
  };
  const pauseSelected = () => {
    void runBulkUpdate(selected, () => ({ status: "Paused" }), "Outreach paused");
  };
  usePageMetadata(
    brandListMetadata({
      q: query || undefined,
      cp,
      status: effectiveStatus,
      owner,
      ownerName:
        owner !== "all" && owner !== "unassigned"
          ? owners.find((item) => item.id === owner)?.name
          : undefined,
      empty: !loading && !refreshing && filtered.length === 0,
    }),
    active,
  );
  const brandsBusy = workView === "all" ? loading || refreshing : workLoading;
  const visibleError = workView === "all" ? error : workError;
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader title="Brands">
        {state.currentRole !== "Caller" && <nav aria-label="Brand views" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {([
            { view: "myWork", label: "Needs Action", count: work?.counts.myWork },
            { view: "all", label: "All Brands", count: undefined },
          ] as const).map((tab) => <button key={tab.view} type="button" aria-pressed={workView === tab.view} onClick={() => setWorkView(tab.view)} className={cx("shrink-0 rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500", workView === tab.view ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>{tab.label}{tab.count !== undefined ? ` (${tab.count})` : tab.view !== "all" && workLoading ? " (…)" : ""}</button>)}
        </nav>}
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          {can("importBrands") && (
            <Button className="shrink-0 bg-slate-950 text-white hover:bg-slate-800" onClick={() => setAddBrandOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add Brand
            </Button>
          )}
        </div>
      </PageHeader>
      <AddBrandDialog
        open={addBrandOpen}
        onOpenChange={setAddBrandOpen}
        owners={owners}
        cps={cps}
        onCreated={(brandId) => {
          clearBrandListPageCache();
          setListEpoch((n) => n + 1);
          router.push(brandDetailPath(brandId));
        }}
      />
      {isAdmin && selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 px-4 py-3">
          <b className="text-sm text-violet-900">{selected.length} selected</b>
          {can("assignOwner") && (
            <Select disabled={busy} onValueChange={assignSelected}>
              <SelectTrigger size="sm" className="bg-white">
                <SelectValue placeholder="Assign AccountManager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {owners.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {can("editBrand") && (
            <Button variant="outline" size="sm" disabled={busy} onClick={pauseSelected}>
              Pause outreach
            </Button>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-white">
        {workView === "all" ? <>
        <div className="flex flex-wrap gap-3 p-4">
          <div className="relative w-full sm:w-40">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setListParam("q", e.target.value)}
              onCompositionStart={() => setSearchComposing(true)}
              onCompositionEnd={() => setSearchComposing(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !searchComposing) {
                  setDebouncedQuery(query);
                }
              }}
              placeholder="Search brand…"
              aria-label="Search brands"
              className="h-10 pl-9"
            />
          </div>
          <Select value={cp} onValueChange={(value) => setListParam("cp", value)}>
            <SelectTrigger className="w-full sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All CPs</SelectItem>
              {cps.map((item) => (
                <SelectItem key={item.id} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={status} onValueChange={(value) => setListParam("status", value)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {FOLLOW_UP_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Select value={owner} onValueChange={(value) => setListParam("owner", value)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All AccountManagers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {owners.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={handlingMode} onValueChange={(value) => setListParam("handlingMode", value)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All handling modes</SelectItem>
              <SelectItem value="Automated">Automated</SelectItem>
              <SelectItem value="Human">Human</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={exhibitionId}
            onValueChange={(value) => setListParam("exhibitionId", value)}
            disabled={exhibitionOptionsLoading}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={exhibitionOptionsLoading ? "Loading exhibitions…" : "All exhibitions"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exhibitions</SelectItem>
              {exhibitionOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setListParam("sort", value)}>
            <SelectTrigger
              aria-label="Sort brands"
              title="Sort brands"
              className="w-full sm:w-56"
            >
              <ArrowDownUp className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-52">
              <SelectItem value="ownerAssignedNewest">Assigned: newest first</SelectItem>
              <SelectItem value="lastInboundNewest">Last inbound: newest first</SelectItem>
              <SelectItem value="lastOutboundNewest">Last outbound: newest first</SelectItem>
              <SelectItem value="nameAsc">Brand name A–Z</SelectItem>
              <SelectItem value="nameDesc">Brand name Z–A</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear all filters"
              title="Clear all"
              className="group h-9 w-9 overflow-hidden px-0 text-slate-500 transition-[width,color] duration-200 hover:w-24 hover:text-slate-900"
              onClick={clearAllListFilters}
            >
              <RotateCcw className="size-3.5 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover:ml-1.5 group-hover:max-w-16 group-hover:opacity-100">Clear all</span>
            </Button>
          </div>
        </div>
        </> : <>
        <div className="flex flex-wrap gap-3 p-4">
          <div className="relative w-full sm:w-40">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query || filters.workQ}
              onChange={(event) => setWorkFilter({ q: event.target.value, workQ: "" })}
              placeholder="Search brand…"
              aria-label="Search brands needing action"
              className="h-10 pl-9"
            />
          </div>
          <Select value={filters.action} onValueChange={(value) => setWorkFilter({ action: value as BrandListFilters["action"] })}>
            <SelectTrigger aria-label="Action type" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="assignments">New Assignments</SelectItem>
              <SelectItem value="replies">Replies</SelectItem>
              <SelectItem value="callReview">Call Review</SelectItem>
            </SelectContent>
          </Select>
          <Select value={cp} onValueChange={(value) => setWorkFilter({ cp: value })}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All CPs</SelectItem>
              {cps.map((item) => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={handlingMode} onValueChange={(value) => setWorkFilter({ handlingMode: value })}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All handling modes</SelectItem>
              <SelectItem value="Automated">Automated</SelectItem>
              <SelectItem value="Human">Human</SelectItem>
            </SelectContent>
          </Select>
          <Select value={exhibitionId} onValueChange={(value) => setWorkFilter({ exhibitionId: value })} disabled={exhibitionOptionsLoading}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={exhibitionOptionsLoading ? "Loading exhibitions…" : "All exhibitions"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exhibitions</SelectItem>
              {exhibitionOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setWorkFilter({ sort: value })}>
            <SelectTrigger aria-label="Sort brands needing action" title="Sort brands" className="w-full sm:w-56">
              <ArrowDownUp className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-52">
              <SelectItem value="ownerAssignedNewest">Assigned: newest first</SelectItem>
              <SelectItem value="lastInboundNewest">Last inbound: newest first</SelectItem>
              <SelectItem value="lastOutboundNewest">Last outbound: newest first</SelectItem>
              <SelectItem value="nameAsc">Brand name A–Z</SelectItem>
              <SelectItem value="nameDesc">Brand name Z–A</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Clear action filters"
              title="Clear all"
              className="group h-9 w-9 overflow-hidden px-0 text-slate-500 transition-[width,color] duration-200 hover:w-24 hover:text-slate-900"
              onClick={() => setWorkFilter({ action: "all", workQ: "", q: "", cp: "all", handlingMode: "all", exhibitionId: "all", sort: "ownerAssignedNewest" })}
            >
              <RotateCcw className="size-3.5 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover:ml-1.5 group-hover:max-w-16 group-hover:opacity-100">Clear all</span>
            </Button>
          </div>
        </div>
        </>}
        {workView === "all" && workError && <div role="alert" className="flex flex-wrap items-center gap-2 px-5 pb-3 text-sm text-rose-700">
          <span>Action Required unavailable: {workError}</span>
          <Button variant="ghost" size="sm" onClick={() => setWorkReloadToken((value) => value + 1)}>Retry</Button>
        </div>}
        {visibleError ? (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>Unable to load {workView === "all" ? "brands" : "actions"}</EmptyTitle>
              <EmptyDescription>{visibleError}</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={() => workView === "all" ? setListReloadToken((value) => value + 1) : setWorkReloadToken((value) => value + 1)}>Retry</Button>
          </Empty>
        ) : brandsBusy && !filtered.length ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500">
            <Spinner className="size-4" />
            Loading {workView === "all" ? "brands" : "actions"}…
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            {brandsBusy ? (
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-xs font-medium text-slate-500">
                <Spinner className="size-3.5" />
                {workView !== "all" ? "Updating actions…" : loading ? "Loading brands…" : "Updating brands…"}
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  {isAdmin && (
                    <TableHead className="w-10 pl-5">
                      <Checkbox
                        checked={
                          selected.length === filtered.length && filtered.length > 0
                            ? true
                            : selected.length > 0
                              ? "indeterminate"
                              : false
                        }
                        disabled={busy}
                        onCheckedChange={(value) =>
                          setSelected(value ? filtered.map((item) => item.id) : [])
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead className={isAdmin ? "min-w-56" : "min-w-56 pl-5"}>Brand</TableHead>
                  <TableHead className="min-w-56">Action Required</TableHead>
                  <TableHead>CP</TableHead>
                  {showStatusColumn && <TableHead>Status</TableHead>}
                  <TableHead>Handling Mode</TableHead>
                  <TableHead className="min-w-40">Human Note</TableHead>
                  {workView === "all" && <TableHead>Last interaction</TableHead>}
                  <TableHead className="w-32 whitespace-nowrap" title="Days since last interaction">Last touch (days)</TableHead>
                  <TableHead className="w-32 whitespace-nowrap pr-5" title="Days since last reply">Last reply (days)</TableHead>
                  {isAdmin && <TableHead>AccountManager</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const pendingWork = workByBrandId.get(c.id);
                  const needsQualification = canReviewQualification && Boolean(c.needsQualification);
                  const hasNewAssignment = Boolean(pendingWork?.newAssignment);
                  const needsAttention = Boolean(c.needsReply) || needsQualification || hasNewAssignment;
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-violet-50/30 ${needsAttention ? "bg-rose-50/40" : ""}`}
                      onClick={() => openBrand(c.id)}
                    >
                      {isAdmin && (
                        <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.includes(c.id)}
                            disabled={busy}
                            onCheckedChange={(value) =>
                              setSelected((ids) => {
                                if (value) return ids.includes(c.id) ? ids : [...ids, c.id];
                                return ids.filter((id) => id !== c.id);
                              })
                            }
                          />
                        </TableCell>
                      )}
                      <TableCell className={isAdmin ? undefined : "pl-5"}>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-violet-100 text-xs font-bold text-violet-700">
                              {c.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              {needsAttention ? (
                                <span
                                  className="size-2 shrink-0 rounded-full bg-rose-500"
                              aria-label={hasNewAssignment ? "New assignment" : needsQualification ? "Call needs qualification" : "Reply needed"}
                                />
                              ) : null}
                              <span className="truncate">{c.name}</span>
                            </div>
                            {hasNewAssignment ? (
                              <div className="mt-0.5 truncate text-xs font-medium text-blue-700">
                                New assignment
                              </div>
                            ) : needsQualification ? (
                              <div className="mt-0.5 truncate text-xs font-medium text-rose-700">
                                Call needs qualification{c.qualificationTaskCount && c.qualificationTaskCount > 1 ? ` · ${c.qualificationTaskCount} tasks` : ""}
                              </div>
                            ) : c.needsReply ? (
                              <div className="mt-0.5 truncate text-xs font-medium text-rose-700">
                                Reply needed
                                {(c.replyDueAt || c.replyUpdatedAt)
                                  ? ` · ${formatEasternDateTime(c.replyDueAt || c.replyUpdatedAt || "")}`
                                  : ""}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        {state.currentRole !== "Caller" && workLoading ? <span className="text-xs text-slate-500">Loading…</span> : workError ? <span className="text-xs text-rose-700">Unavailable</span> : pendingWork ? <div className="flex flex-wrap items-center gap-1.5">
                          {pendingWork.newAssignment && <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-md bg-blue-50 px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => openBrand(c.id, { assignment: true })}>
                            <UserPlus className="size-3.5 shrink-0" />New Assignment
                          </button>}
                          {WORK_REPLY_CHANNELS.map((channel) => {
                            const pending = pendingWork.channels[channel];
                            return pending ? <button key={channel} type="button" className="inline-flex min-h-9 items-center gap-1 rounded-md bg-violet-50 px-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onClick={() => openBrand(c.id, { replyId: pending.target.id })}>
                              <ChannelIcon channel={channel} className="size-3.5 shrink-0" alt="" />{channel} {pending.count}
                            </button> : null;
                          })}
                          {pendingWork.callReview && <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-md bg-amber-50 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500" onClick={() => openBrand(c.id, { taskId: pendingWork.callReview!.target.id })}>
                            <PhoneCall className="size-3.5 shrink-0" />Call Review {pendingWork.callReview.count}
                          </button>}
                        </div> : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <CP value={c.currentCp} />
                      </TableCell>
                      {showStatusColumn && <TableCell>
                        {c.status ? <Status value={c.status} /> : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>}
                      <TableCell>
                        <HandlingMode value={c.handlingMode} />
                      </TableCell>
                      <TableCell
                        className="max-w-56 align-top"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <BrandNote
                          key={c.id}
                          customerId={c.id}
                          variant="inline"
                          value={c.humanNotes ?? ""}
                          onSave={
                            can("editBrand")
                              ? async (next) => {
                                  applyBrandUpdate(
                                    await patchBrandListItem(c.id, { humanNotes: next }),
                                  );
                                }
                              : undefined
                          }
                        />
                      </TableCell>
                      {workView === "all" && <TableCell className="max-w-60 text-xs text-slate-500">
                        {c.lastInteractionAt ? (
                          <div className="min-w-44">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-semibold text-slate-700" title={lastInteractionLabel(c)}>
                                {lastInteractionLabel(c)}
                              </span>
                              <span className={cx(
                                "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                c.lastInteractionDirection === "Inbound"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : c.lastInteractionDirection === "Outbound"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-slate-100 text-slate-600",
                              )}>
                                {c.lastInteractionDirection === "Inbound" ? <ArrowDownLeft className="size-3" aria-hidden="true" /> : c.lastInteractionDirection === "Outbound" ? <ArrowUpRight className="size-3" aria-hidden="true" /> : null}
                                {c.lastInteractionDirection || "Unknown"}
                              </span>
                            </div>
                            <time dateTime={c.lastInteractionAt} className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                              {formatEasternDateTime(c.lastInteractionAt)}
                            </time>
                          </div>
                        ) : (
                          "No interaction"
                        )}
                      </TableCell>}
                      <TableCell className="text-xs tabular-nums text-slate-600">
                        {daysSince(c.lastInteractionAt)}
                      </TableCell>
                      <TableCell className="pr-5 text-xs tabular-nums text-slate-600">
                        {daysSince(c.lastReplyAt)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="whitespace-nowrap text-xs">
                          {c.ownerName || "Unassigned"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{workView !== "all" && !work?.brands.length ? "All caught up" : "No brands match"}</EmptyTitle>
              {(workView === "all" || work?.brands.length) && <EmptyDescription>Try changing your search or filters.</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        )}
        {workView === "all" && <div id="brand-pagination" className="relative flex min-h-14 items-center justify-center px-5 py-3 text-xs text-slate-500">
          <span className="absolute left-5 hidden sm:block">
            {brands.length === 0
              ? "No records"
              : `Showing ${brands.length} of ${totalCount ?? "…"} brands`}
          </span>
          <GlassPagination className="w-auto">
            <GlassPaginationContent>
              <GlassPaginationItem>
                <GlassPaginationPrevious href="#brand-pagination" aria-disabled={brandsBusy || cursorStack.length === 0} onClick={(event) => { event.preventDefault(); if (!brandsBusy && cursorStack.length) goPrevPage(); }} />
              </GlassPaginationItem>
              {paginationItems.map((item, index) => item === "ellipsis" ? <GlassPaginationItem key={`ellipsis-${index}`}><GlassPaginationEllipsis /></GlassPaginationItem> : <GlassPaginationItem key={item}>
                <GlassPaginationLink href="#brand-pagination" isActive={item === pageNumber} onClick={(event) => { event.preventDefault(); if (item !== pageNumber) void goToPage(item); }}>{item}</GlassPaginationLink>
              </GlassPaginationItem>)}
              <GlassPaginationItem>
                <GlassPaginationNext href="#brand-pagination" aria-disabled={brandsBusy || !hasMore} onClick={(event) => { event.preventDefault(); if (!brandsBusy && hasMore) goNextPage(); }} />
              </GlassPaginationItem>
            </GlassPaginationContent>
          </GlassPagination>
        </div>}
      </div>
    </div>
  );
}

type ImportField =
  | "brand"
  | "contact"
  | "role"
  | "email"
  | "phone"
  | "whatsapp"
  | "linkedin"
  | "source"
  | "skip";
type ImportDraft = {
  name: string;
  contactName: string;
  role: Contact["role"];
  email: string;
  phone: string;
  whatsapp: string;
  linkedin: string;
  source: string;
  keep: boolean;
};
const IMPORT_FIELDS: { id: ImportField; label: string }[] = [
  { id: "skip", label: "Ignore" },
  { id: "brand", label: "Brand" },
  { id: "contact", label: "Contact name" },
  { id: "role", label: "Role" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "source", label: "Source" },
];
const FIELD_ALIASES: Record<string, ImportField> = {
  brand: "brand",
  company: "brand",
  "brand name": "brand",
  "company name": "brand",
  name: "brand",
  contact: "contact",
  "contact name": "contact",
  keyperson: "contact",
  "key person": "contact",
  person: "contact",
  role: "role",
  "contact role": "role",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  mobile: "phone",
  tel: "phone",
  telephone: "phone",
  whatsapp: "whatsapp",
  linkedin: "linkedin",
  source: "source",
};
const guessField = (header: string): ImportField =>
  FIELD_ALIASES[header.trim().toLowerCase().replace(/[_-]+/g, " ")] || "skip";
const normalizeRole = (value: string): Contact["role"] => {
  const key = value.trim().toLowerCase();
  if (key === "owner") return "Owner";
  if (key === "other") return "Other";
  return "Connector";
};
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}
function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ImportField[],
): ImportDraft[] {
  const index = (field: ImportField) =>
    mapping.findIndex((item) => item === field);
  return rows.map((row) => {
    const value = (field: ImportField) => {
      const at = index(field);
      return at >= 0 ? (row[at] || "").trim() : "";
    };
    return {
      name: value("brand"),
      contactName: value("contact"),
      role: normalizeRole(value("role")),
      email: value("email"),
      phone: value("phone"),
      whatsapp: value("whatsapp"),
      linkedin: value("linkedin"),
      source: value("source"),
      keep: true,
    };
  });
}

type ClientSearchHit = {
  id: string;
  name: string;
  website: string | null;
  productDescription: string | null;
};

type ExhibitionSearchHit = {
  id: string;
  name: string;
  startDate: string | null;
};

function AddBrandDialog({
  open,
  onOpenChange,
  owners,
  cps,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  owners: Array<{ id: string; name: string }>;
  cps: Array<{ id?: string; name: string }>;
  onCreated?: (brandId: string) => void;
}) {
  /** Prefer linking an existing ClientDB over creating a new company. */
  const [mode, setMode] = useState<"link" | "create">("link");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientHits, setClientHits] = useState<ClientSearchHit[]>([]);
  const [clientSearching, setClientSearching] = useState(false);
  const [linkedClient, setLinkedClient] = useState<ClientSearchHit | null>(null);
  const [loadingKeyPersons, setLoadingKeyPersons] = useState(false);
  const [exhibitionQuery, setExhibitionQuery] = useState("");
  const [exhibitionHits, setExhibitionHits] = useState<ExhibitionSearchHit[]>([]);
  const [exhibitionSearching, setExhibitionSearching] = useState(false);
  const [selectedExhibition, setSelectedExhibition] = useState<ExhibitionSearchHit | null>(null);
  const [ownerId, setOwnerId] = useState("unassigned");
  const [currentCp, setCurrentCp] = useState("none");
  const [contacts, setContacts] = useState([emptyContactDraft()]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setMode("link");
    setName("");
    setWebsite("");
    setProductDescription("");
    setClientQuery("");
    setClientHits([]);
    setLinkedClient(null);
    setLoadingKeyPersons(false);
    setExhibitionQuery("");
    setExhibitionHits([]);
    setSelectedExhibition(null);
    setOwnerId("unassigned");
    setCurrentCp("none");
    setContacts([emptyContactDraft()]);
    setSaving(false);
  };

  useEffect(() => {
    if (!open || mode !== "link" || linkedClient) return;
    const q = clientQuery.trim();
    if (q.length < 2) {
      setClientHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setClientSearching(true);
      fetch(`/api/clients?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          const payload = (await response.json()) as {
            clients?: ClientSearchHit[];
            error?: string;
          };
          if (!response.ok) throw new Error(payload.error || "Search failed");
          return payload.clients || [];
        })
        .then((items) => {
          if (!cancelled) setClientHits(items);
        })
        .catch(() => {
          if (!cancelled) setClientHits([]);
        })
        .finally(() => {
          if (!cancelled) setClientSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientQuery, linkedClient, mode, open]);

  useEffect(() => {
    if (!open || selectedExhibition) return;
    const q = exhibitionQuery.trim();
    if (q.length < 2) {
      setExhibitionHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setExhibitionSearching(true);
      fetch(`/api/exhibitions?q=${encodeURIComponent(q)}`)
        .then(async (response) => {
          const payload = (await response.json()) as {
            exhibitions?: ExhibitionSearchHit[];
            error?: string;
          };
          if (!response.ok) throw new Error(payload.error || "Search failed");
          return payload.exhibitions || [];
        })
        .then((items) => {
          if (!cancelled) setExhibitionHits(items);
        })
        .catch(() => {
          if (!cancelled) setExhibitionHits([]);
        })
        .finally(() => {
          if (!cancelled) setExhibitionSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [exhibitionQuery, open, selectedExhibition]);

  const loadKeyPersonsForClient = async (clientId: string) => {
    setLoadingKeyPersons(true);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/key-persons`);
      const payload = (await response.json()) as {
        keyPersons?: Array<{
          id: string;
          name: string;
          title: string | null;
          ownerOrConnector: "Owner" | "Connector" | null;
          email: string | null;
          phone: string | null;
          directPhone: string | null;
          officePhone: string | null;
          whatsapp: string | null;
          linkedin: string | null;
        }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load KeyPersons");
      const people = payload.keyPersons || [];
      if (!people.length) {
        setContacts([emptyContactDraft()]);
        toast.message("No KeyPersons on this Client — add contacts below");
        return;
      }
      const drafts: ContactDraft[] = people.map((person) => {
        const base = emptyContactDraft(
          person.ownerOrConnector === "Owner" || person.ownerOrConnector === "Connector"
            ? person.ownerOrConnector
            : "Other",
        );
        return {
          ...base,
          keyPersonId: person.id,
          name: person.name,
          title: person.title || "",
          email: person.email || "",
          phone: person.phone || "",
          directPhone: person.directPhone || "",
          officePhone: person.officePhone || "",
          whatsapp: person.whatsapp || "",
          linkedin: person.linkedin || "",
        };
      });
      setContacts(drafts);
      toast.success(`Loaded ${drafts.length} KeyPerson${drafts.length === 1 ? "" : "s"}`);
    } catch (error) {
      setContacts([emptyContactDraft()]);
      toast.error(error instanceof Error ? error.message : "Failed to load KeyPersons");
    } finally {
      setLoadingKeyPersons(false);
    }
  };

  const companyName = mode === "link" ? linkedClient?.name || "" : name.trim();
  const ready =
    Boolean(companyName) &&
    (mode === "link" ? Boolean(linkedClient?.id) : Boolean(website.trim())) &&
    validContactDrafts(contacts).length > 0 &&
    !saving &&
    !loadingKeyPersons;

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const response = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientPageId: mode === "link" ? linkedClient?.id : null,
          company: {
            name: companyName,
            website: mode === "create" ? website.trim() || null : linkedClient?.website || null,
            productDescription:
              mode === "create"
                ? productDescription.trim() || null
                : linkedClient?.productDescription || null,
          },
          ownerId: ownerId === "unassigned" ? null : ownerId,
          handlingMode: "Human",
          priority: null,
          currentCpId: currentCp === "none" ? null : currentCp,
          exhibitionId: selectedExhibition?.id || null,
          contacts: validContactDrafts(contacts).map((item) => ({
            name: item.name.trim(),
            keyPersonId: item.keyPersonId || null,
            title: item.title.trim() || null,
            role: item.role,
            email: item.email.trim() || null,
            phone: item.phone.trim() || null,
            directPhone: item.directPhone.trim() || null,
            officePhone: item.officePhone.trim() || null,
            whatsapp: item.whatsapp.trim() || null,
            linkedin: item.linkedin.trim() || null,
          })),
        }),
      });
      const payload = (await response.json()) as {
        brandId?: string;
        companyName?: string;
        contactErrors?: Array<{ name: string; error?: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to create brand");

      const failed = payload.contactErrors?.length || 0;
      if (failed) {
        toast.warning(
          `Brand created; ${failed} contact${failed === 1 ? "" : "s"} failed`,
        );
      } else {
        toast.success(`Brand created: ${payload.companyName || companyName}`);
      }
      const brandId = payload.brandId;
      reset();
      onOpenChange(false);
      if (brandId) onCreated?.(brandId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a Brand</DialogTitle>
          <DialogDescription>
            Prefer linking an existing ClientDB company, then create Follow-up Client and KeyPersons.
            Handling mode defaults to Human. Fields marked with{" "}
            <span className="font-semibold text-rose-600">*</span> are required.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "link" ? "default" : "outline"}
              onClick={() => {
                setMode("link");
                setName("");
                setWebsite("");
                setProductDescription("");
              }}
            >
              Link existing ClientDB
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "create" ? "default" : "outline"}
              onClick={() => {
                setMode("create");
                setLinkedClient(null);
                setClientQuery("");
                setClientHits([]);
                setContacts([emptyContactDraft()]);
              }}
            >
              Create company
            </Button>
          </div>

          {mode === "link" ? (
            <div className="space-y-3">
              <label className="grid gap-2 text-sm font-medium">
                <span>
                  Search ClientDB
                  <span className="ml-0.5 text-rose-600" aria-hidden>*</span>
                </span>
                <Input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder="Type at least 2 characters…"
                  aria-required
                />
              </label>
              {!linkedClient && (
                <p className="text-xs text-slate-500">Select an existing company to continue.</p>
              )}
              {linkedClient ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-emerald-900">{linkedClient.name}</div>
                      {linkedClient.website && (
                        <div className="text-xs text-emerald-700">{linkedClient.website}</div>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setLinkedClient(null);
                        setContacts([emptyContactDraft()]);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                  {loadingKeyPersons && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Spinner className="size-4" /> Loading KeyPersons…
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">
                  {clientSearching ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                      <Spinner className="size-4" /> Searching…
                    </div>
                  ) : clientHits.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      {clientQuery.trim().length < 2
                        ? "Enter a company name to search."
                        : "No available companies (already in Follow-up are hidden)."}
                    </div>
                  ) : (
                    clientHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                        onClick={() => {
                          setLinkedClient(hit);
                          setName(hit.name);
                          setWebsite(hit.website || "");
                          setProductDescription(hit.productDescription || "");
                          void loadKeyPersonsForClient(hit.id);
                        }}
                      >
                        <span className="text-sm font-medium text-slate-900">{hit.name}</span>
                        {hit.website && (
                          <span className="text-xs text-slate-500">{hit.website}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="grid gap-2 text-sm font-medium">
                <span>
                  Company name
                  <span className="ml-0.5 text-rose-600" aria-hidden>*</span>
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Brand / company name"
                  required
                  aria-required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>
                  Website
                  <span className="ml-0.5 text-rose-600" aria-hidden>*</span>
                </span>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  required
                  aria-required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Product description
                <Textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Short product / category intro"
                  rows={3}
                />
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              AccountManager
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {owners.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Current CP
              <Select value={currentCp} onValueChange={setCurrentCp}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Empty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Empty (NONE)</SelectItem>
                  {cps
                    .filter((item) => item.name && item.name !== "NONE")
                    .map((item) => (
                      <SelectItem key={item.id || item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-2 text-sm font-medium sm:col-span-2">
              <span>Follow-up Exhibition</span>
              {selectedExhibition ? (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <div>
                    <div className="font-medium text-slate-900">{selectedExhibition.name}</div>
                    {selectedExhibition.startDate && (
                      <div className="text-xs text-slate-500">{selectedExhibition.startDate}</div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedExhibition(null);
                      setExhibitionQuery("");
                      setExhibitionHits([]);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={exhibitionQuery}
                    onChange={(e) => setExhibitionQuery(e.target.value)}
                    placeholder="Search exhibition (optional)…"
                  />
                  {(exhibitionSearching || exhibitionHits.length > 0 || exhibitionQuery.trim().length >= 2) && (
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200">
                      {exhibitionSearching ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                          <Spinner className="size-4" /> Searching…
                        </div>
                      ) : exhibitionHits.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-slate-500">No matching exhibitions.</div>
                      ) : (
                        exhibitionHits.map((hit) => (
                          <button
                            key={hit.id}
                            type="button"
                            className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                            onClick={() => setSelectedExhibition(hit)}
                          >
                            <span className="text-sm font-medium text-slate-900">{hit.name}</span>
                            {hit.startDate && (
                              <span className="text-xs text-slate-500">{hit.startDate}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <BrandContactsEditor contacts={contacts} onChange={setContacts} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={!ready} onClick={() => void submit()}>
            {saving ? "Creating…" : "Add Brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { importBrands } = useWorkspace();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [fileName, setFileName] = useState("");
  const reset = () => {
    setHeaders([]);
    setRawRows([]);
    setMapping([]);
    setDrafts([]);
    setFileName("");
  };
  const remap = (next: ImportField[], rows = rawRows) => {
    const used = new Set<ImportField>();
    const unique = next.map((field) => {
      if (field === "skip") return field;
      if (used.has(field)) return "skip" as ImportField;
      used.add(field);
      return field;
    });
    setMapping(unique);
    setDrafts(applyMapping(headers, rows, unique));
  };
  const onFile = (file?: File) => {
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
        if (parsed.length < 2) {
          toast.error("CSV needs a header row and at least one data row");
          return;
        }
        const nextHeaders = parsed[0];
        const nextRows = parsed.slice(1);
        const guessed = nextHeaders.map(guessField);
        setFileName(file.name);
        setHeaders(nextHeaders);
        setRawRows(nextRows);
        remap(guessed, nextRows);
      })
      .catch(() => toast.error("Could not read this file"));
  };
  const ready = drafts.filter(
    (row) => row.keep && row.name.trim() && row.contactName.trim(),
  );
  const submit = () => {
    const result = importBrands(ready);
    show(result);
    if (result.ok) {
      reset();
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import brands from CSV</DialogTitle>
          <DialogDescription>
            Use one row per contact. Rows with the same Brand are grouped into
            one brand with multiple contacts. Imported brands start at CP1 and
            remain unassigned until an Admin selects an AccountManager.
          </DialogDescription>
        </DialogHeader>
        {!headers.length ? (
          <label className="grid min-h-48 cursor-pointer place-items-center rounded-xl border border-dashed bg-slate-50 text-sm text-slate-500 hover:bg-slate-100">
            <span className="text-center">
              <Upload className="mx-auto mb-2 size-5" />
              <span className="block font-medium text-slate-700">
                Choose a CSV file
              </span>
              <span className="mt-1 block text-xs">
                Expected columns: Brand, Contact name, Role, Email, Phone/SMS,
                WhatsApp, LinkedIn, Source
              </span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => onFile(event.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {fileName} · {rawRows.length} rows
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Choose another file
              </Button>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Column mapping</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {headers.map((header, index) => (
                  <label
                    key={`${header}-${index}`}
                    className="rounded-lg bg-slate-50 p-3 text-xs"
                  >
                    <span className="font-semibold text-slate-700">
                      {header || `Column ${index + 1}`}
                    </span>
                    <Select
                      value={mapping[index] || "skip"}
                      onValueChange={(value) =>
                        remap(
                          mapping.map((field, at) =>
                            at === index ? (value as ImportField) : field,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="mt-2 w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORT_FIELDS.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Confirm rows</div>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Contact name</TableHead>
                      <TableHead>Contact role</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone / SMS</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((row, index) => (
                      <TableRow
                        key={index}
                        className={row.keep ? "" : "opacity-50"}
                      >
                        <TableCell>
                          <Checkbox
                            checked={row.keep}
                            onCheckedChange={(value) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, keep: !!value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.name}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.contactName}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? {
                                        ...item,
                                        contactName: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.role}
                            onValueChange={(value) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? {
                                        ...item,
                                        role: value as Contact["role"],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Connector">
                                Connector
                              </SelectItem>
                              <SelectItem value="Owner">Owner</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.email}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, email: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.phone}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, phone: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.whatsapp}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, whatsapp: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.linkedin}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, linkedin: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.source}
                            onChange={(event) =>
                              setDrafts(
                                drafts.map((item, at) =>
                                  at === index
                                    ? { ...item, source: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {ready.length} of {drafts.length} rows are ready. Same-brand
                rows become multiple contacts on one brand. Brand and Contact
                name are required.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button disabled={!ready.length} onClick={submit}>
            Import {ready.length || ""} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
