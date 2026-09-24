/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import {
  cacheBrandItem,
  cacheBrandListPage,
  clearBrandListPageCache,
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
  q: string;
  status: string;
  cp: string;
  owner: string;
  replyState: string;
  handlingMode: string;
  exhibition: string;
  sort: string;
  replyFrom: string;
  replyTo: string;
};

const BRAND_SEARCH_DEBOUNCE_MS = 800;
const BRAND_LIST_PAGINATION_STORAGE_KEY = "followup.brand-list-pagination.v1";
const BRAND_LIST_PAGE_CACHE_TTL_MS = 30_000;

type BrandListPagination = {
  cursor: string | null;
  cursorStack: Array<string | null>;
  page: number;
};

function brandListFiltersFromSearch(search: URLSearchParams): BrandListFilters {
  return {
    q: search.get("q") ?? "",
    status: search.get("status") ?? "all",
    cp: search.get("cp") ?? "all",
    owner: search.get("owner") ?? "all",
    replyState: search.get("replyState") ?? "all",
    handlingMode: search.get("handlingMode") ?? "all",
    exhibition: search.get("exhibition") ?? "all",
    sort: search.get("sort") ?? "priority",
    replyFrom: search.get("replyFrom") ?? "",
    replyTo: search.get("replyTo") ?? "",
  };
}

function brandListPath(
  filters: BrandListFilters,
  pagination?: Pick<BrandListPagination, "cursor" | "page">,
) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q);
  if (filters.cp !== "all") params.set("cp", filters.cp);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  if (filters.replyState !== "all") params.set("replyState", filters.replyState);
  if (filters.handlingMode !== "all") params.set("handlingMode", filters.handlingMode);
  if (filters.exhibition !== "all") params.set("exhibition", filters.exhibition);
  if (filters.sort !== "priority") params.set("sort", filters.sort);
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
    followupExhibition: next.followupExhibition ?? current.followupExhibition,
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
  const canReviewQualification = state.currentRole !== "Caller";
  const [filters, setFilters] = useState<BrandListFilters>(() =>
    brandListFiltersFromSearch(searchParams),
  );
  const { q: query, status, cp, owner, replyState, handlingMode, exhibition, sort, replyFrom, replyTo } = filters;
  const effectiveStatus = isAdmin ? status : "all";
  const [brands, setBrands] = useState<BrandListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(() => searchParams.get("cursor"));
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const [pageNumber, setPageNumber] = useState(() => pageFromSearch(searchParams));
  const [paginationRestored, setPaginationRestored] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
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
  };
  const clearAllListFilters = () => {
    const next: BrandListFilters = {
      q: "",
      status: "all",
      cp: "all",
      owner: "all",
      replyState: "all",
      handlingMode: "all",
      exhibition: "all",
      sort: "priority",
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
  };
  useEffect(() => {
    const onPopState = () => {
      setFilters(brandListFiltersFromSearch(new URLSearchParams(window.location.search)));
      setCursor(new URLSearchParams(window.location.search).get("cursor"));
      setCursorStack([]);
      setPageNumber(pageFromSearch(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
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

  const brandsFilterKey = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (cp !== "all") params.set("cp", cp);
    if (isAdmin && effectiveStatus !== "all") params.set("status", effectiveStatus);
    if (isAdmin && owner !== "all") params.set("owner", owner);
    if (replyFrom) params.set("replyFrom", replyFrom);
    if (replyTo) params.set("replyTo", replyTo);
    return params.toString();
  }, [debouncedQuery, cp, effectiveStatus, owner, replyFrom, replyTo, isAdmin]);
  const brandListPageCacheKey = `${state.currentUserId}:${state.currentRole}:${brandsFilterKey}:${cursor || ""}`;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const cachedPage = getCachedBrandListPage(brandListPageCacheKey);
    const cacheIsFresh =
      Boolean(cachedPage) &&
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
  }, [brandListPageCacheKey, brandsFilterKey, cursor, listEpoch]);

  const goNextPage = () => {
    if (!nextCursor || !hasMore || loading) return;
    const nextStack = [...cursorStack, cursor];
    const nextPage = pageNumber + 1;
    setCursorStack(nextStack);
    setCursor(nextCursor);
    setPageNumber(nextPage);
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

  const exhibitionOptions = useMemo(
    () => [...new Set(brands.map((item) => item.followupExhibition).filter((item): item is string => Boolean(item)))].sort((a, b) => a.localeCompare(b)),
    [brands],
  );
  const filtered = useMemo(() => {
    const now = Date.parse(state.simulatedDate);
    const visible = brands.filter((item) => {
      if (replyState === "needsReply" && !item.needsReply) return false;
      if (replyState === "qualification" && !item.needsQualification) return false;
      if (replyState === "replied" && (item.needsReply || !item.lastReplyAt)) return false;
      if (replyState === "never" && item.lastReplyAt) return false;
      if (replyState === "overdue" && (!item.needsReply || !item.replyDueAt || Date.parse(item.replyDueAt) >= now)) return false;
      if (handlingMode !== "all" && item.handlingMode !== handlingMode) return false;
      if (exhibition !== "all" && item.followupExhibition !== exhibition) return false;
      return true;
    });
    const timeValue = (value?: string | null) => (value ? Date.parse(value) || 0 : 0);
    const replyDueValue = (item: BrandListItem) => timeValue(item.replyDueAt || item.replyUpdatedAt);
    return visible.sort((a, b) => {
      if (sort === "nameAsc") return a.name.localeCompare(b.name);
      if (sort === "nameDesc") return b.name.localeCompare(a.name);
      if (sort === "lastNewest") return timeValue(b.lastInteractionAt) - timeValue(a.lastInteractionAt) || a.name.localeCompare(b.name);
      if (sort === "lastOldest") return timeValue(a.lastInteractionAt) - timeValue(b.lastInteractionAt) || a.name.localeCompare(b.name);
      if (sort === "replyDue") return replyDueValue(a) - replyDueValue(b) || a.name.localeCompare(b.name);
      return 0;
    });
  }, [brands, exhibition, handlingMode, replyState, sort, state.simulatedDate]);
  const currentListPath = brandListPath(filters, { cursor, page: pageNumber });
  const brandDetailPath = (brandId: string) =>
    `/customers/${encodeURIComponent(brandId)}?returnTo=${encodeURIComponent(currentListPath)}`;
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
      if (ok) setSelected([]);
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
  const brandsBusy = loading || refreshing;
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow={`${loading ? "Loading" : refreshing ? "Updating" : `${brands.length} on this page`}`}
        title="Brands"
      >
        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          <div className="relative w-full sm:w-[26rem]">
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
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <Select value={cp} onValueChange={(value) => setListParam("cp", value)}>
            <SelectTrigger className="w-full sm:w-32">
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
          <Select value={replyState} onValueChange={(value) => setListParam("replyState", value)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reply states</SelectItem>
              <SelectItem value="needsReply">Needs reply</SelectItem>
              <SelectItem value="overdue">Overdue reply</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="never">Never replied</SelectItem>
              <SelectItem value="qualification">Needs qualification</SelectItem>
            </SelectContent>
          </Select>
          <Select value={handlingMode} onValueChange={(value) => setListParam("handlingMode", value)}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All handling modes</SelectItem>
              <SelectItem value="Automated">Automated</SelectItem>
              <SelectItem value="Human">Human</SelectItem>
            </SelectContent>
          </Select>
          <Select value={exhibition} onValueChange={(value) => setListParam("exhibition", value)}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All exhibitions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exhibitions</SelectItem>
              {exhibitionOptions.map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setListParam("sort", value)}>
            <SelectTrigger
              aria-label="Sort brands"
              title="Sort brands"
              className="size-9 justify-center px-0 sm:size-9 [&>svg:last-child]:hidden"
            >
              <ArrowDownUp className="size-4" />
              <SelectValue className="sr-only" />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-52">
              <SelectItem value="priority">Needs attention first</SelectItem>
              <SelectItem value="nameAsc">Brand name A–Z</SelectItem>
              <SelectItem value="nameDesc">Brand name Z–A</SelectItem>
              <SelectItem value="lastNewest">Recent interaction</SelectItem>
              <SelectItem value="lastOldest">Oldest interaction</SelectItem>
              <SelectItem value="replyDue">Reply due soonest</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-slate-500 hover:text-slate-900"
              onClick={clearAllListFilters}
            >
              <RotateCcw className="mr-1.5 size-3.5" />
              Clear all
            </Button>
          </div>
        </div>
        {error ? (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>Unable to load brands</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : brandsBusy && !filtered.length ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-slate-500">
            <Spinner className="size-4" />
            Loading brands…
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            {brandsBusy ? (
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-xs font-medium text-slate-500">
                <Spinner className="size-3.5" />
                {loading ? "Loading brands…" : "Updating brands…"}
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
                  <TableHead>CP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Handling Mode</TableHead>
                  <TableHead>Last interaction</TableHead>
                  <TableHead className="whitespace-nowrap">Days since last interaction</TableHead>
                  <TableHead className="whitespace-nowrap pr-5">Days since last reply</TableHead>
                  {isAdmin && <TableHead>AccountManager</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const needsQualification = canReviewQualification && Boolean(c.needsQualification);
                  const needsAttention = Boolean(c.needsReply) || needsQualification;
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-violet-50/30 ${needsAttention ? "bg-rose-50/40" : ""}`}
                      onClick={() => router.push(brandDetailPath(c.id))}
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
                                  aria-label={needsQualification ? "Call needs qualification" : "Reply needed"}
                                />
                              ) : null}
                              <span className="truncate">{c.name}</span>
                            </div>
                            {needsQualification ? (
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
                      <TableCell>
                        <CP value={c.currentCp} />
                      </TableCell>
                      <TableCell>
                        {c.status ? <Status value={c.status} /> : <span className="text-xs text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <HandlingMode value={c.handlingMode} />
                      </TableCell>
                      <TableCell className="max-w-60 text-xs text-slate-500">
                        {c.lastInteractionAt ? (
                          <div className="min-w-44">
                            <div className="truncate font-semibold text-slate-700" title={lastInteractionLabel(c)}>
                              {lastInteractionLabel(c)}
                            </div>
                            <time dateTime={c.lastInteractionAt} className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                              {formatEasternDateTime(c.lastInteractionAt)}
                            </time>
                          </div>
                        ) : (
                          "No interaction"
                        )}
                      </TableCell>
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
              <EmptyTitle>No brands match</EmptyTitle>
              <EmptyDescription>
                Try changing your search or filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-slate-500">
          <span>
            {brands.length === 0
              ? "No records"
              : `Showing ${brands.length} brand${brands.length === 1 ? "" : "s"} (page size ${DEFAULT_BRAND_PAGE_SIZE})`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={brandsBusy || cursorStack.length === 0}
              onClick={goPrevPage}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="min-w-20 text-center font-medium text-slate-600">
              Page {pageNumber}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={brandsBusy || !hasMore}
              onClick={goNextPage}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
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
