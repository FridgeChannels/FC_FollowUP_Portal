/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  MoreHorizontal,
  PhoneCall,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "./workspace-store";
import { cacheBrandItem, cacheBrandList } from "@/lib/brand-list-cache";
import {
  FOLLOW_UP_STATUSES,
  listCurrentCps,
  type BrandListItem,
  type CurrentCpOption,
} from "@/lib/brand-list";
import { Contact, dateOnly } from "@/lib/outreach-domain";
import { brandListMetadata } from "@/lib/page-metadata";
import { usePageMetadata } from "./use-page-metadata";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
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
import { BrandContactsEditor, emptyContactDraft, validContactDrafts } from "./brand-contacts-editor";

const cx = (...v: (string | false | undefined | null)[]) =>
  v.filter(Boolean).join(" ");
const show = (r: { ok: boolean; message: string }) =>
  r.ok ? toast.success(r.message) : toast.error(r.message);
export function CP({ value }: { value: string }) {
  const tone =
    { NONE: "bg-slate-50 text-slate-600", CP1: "ui-cp-1", CP2: "ui-cp-2", CP3: "ui-cp-3" }[value] ||
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
};

function brandListFiltersFromSearch(search: URLSearchParams): BrandListFilters {
  return {
    q: search.get("q") ?? "",
    status: search.get("status") ?? "all",
    cp: search.get("cp") ?? "all",
    owner: search.get("owner") ?? "all",
  };
}

function brandListPath(filters: BrandListFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q);
  if (filters.cp !== "all") params.set("cp", filters.cp);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.owner !== "all") params.set("owner", filters.owner);
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export function BrandsPage() {
  const { state } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = state.currentRole === "Admin";
  const manager = isAdmin || state.currentRole === "FC_Owner";
  const [filters, setFilters] = useState<BrandListFilters>(() =>
    brandListFiltersFromSearch(searchParams),
  );
  const { q: query, status, cp, owner } = filters;
  const [brands, setBrands] = useState<BrandListItem[]>([]);
  const [remoteCps, setRemoteCps] = useState<CurrentCpOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<Array<{ id: string; name: string }>>([]);
  const cps = remoteCps.length ? remoteCps : listCurrentCps();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const ownerQuery =
    isAdmin && owner !== "all" ? `?owner=${encodeURIComponent(owner)}` : "";
  const brandsPath = `/api/brands${ownerQuery}`;
  const setListParam = (key: keyof BrandListFilters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      window.history.replaceState(window.history.state, "", brandListPath(next));
      return next;
    });
  };
  useEffect(() => {
    const onPopState = () => {
      setFilters(brandListFiltersFromSearch(new URLSearchParams(window.location.search)));
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
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(brandsPath)
      .then(async (response) => {
        const payload = (await response.json()) as {
          brands?: BrandListItem[];
          cps?: CurrentCpOption[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load brands");
        return { brands: payload.brands || [], cps: payload.cps || [] };
      })
      .then((payload) => {
        if (cancelled) return;
        if (ownerQuery) payload.brands.forEach(cacheBrandItem);
        else cacheBrandList(payload.brands);
        setBrands(payload.brands);
        setRemoteCps(payload.cps);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load brands");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandsPath, state.currentRole]);
  const filtered = useMemo(
    () =>
      brands
        .filter(
          (c) =>
            (status === "all" || c.status === status) &&
            (cp === "all" || c.currentCp === cp) &&
            (isAdmin
              ? owner === "all" ||
                (owner === "unassigned" ? !c.ownerId : c.ownerId === owner)
              : true) &&
            c.name.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          const aTime = a.lastInteractionAt || "";
          const bTime = b.lastInteractionAt || "";
          return bTime.localeCompare(aTime) || a.name.localeCompare(b.name);
        }),
    [brands, status, cp, owner, query, isAdmin],
  );
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
  usePageMetadata(
    brandListMetadata({
      q: query || undefined,
      cp,
      status,
      owner,
      ownerName:
        owner !== "all" && owner !== "unassigned"
          ? owners.find((item) => item.id === owner)?.name
          : undefined,
      empty: !loading && filtered.length === 0,
    }),
  );
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow={`${loading ? "Loading" : `${brands.length} records`}`}
        title="Brands"
      />
      <div className="overflow-hidden rounded-2xl bg-white">
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setListParam("q", e.target.value)}
              placeholder="Search brand…"
              className="pl-9"
            />
          </div>
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
          {isAdmin && (
            <Select value={owner} onValueChange={(value) => setListParam("owner", value)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All FC-Owners</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {owners.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
        ) : loading ? (
          <div className="px-5 py-16 text-sm text-slate-500">Loading brands…</div>
        ) : filtered.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="min-w-56 pl-5">Brand</TableHead>
                  <TableHead>CP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Handling Mode</TableHead>
                  <TableHead>Last interaction</TableHead>
                  {isAdmin && <TableHead>FC-Owner</TableHead>}
                  {manager && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-violet-50/30"
                      onClick={() => router.push(`/customers/${c.id}`)}
                    >
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-9">
                            <AvatarFallback className="bg-violet-100 text-xs font-bold text-violet-700">
                              {c.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{c.name}</div>
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
                      <TableCell className="max-w-52 truncate text-xs text-slate-500">
                        {c.lastInteractionAt ? dateOnly(c.lastInteractionAt) : "No interaction"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="whitespace-nowrap text-xs">
                          {c.ownerName || "Unassigned"}
                        </TableCell>
                      )}
                      {manager && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(`/customers/${c.id}`)
                                }
                              >
                                Open Brand
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
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
        <div className="flex items-center justify-between px-5 py-4 text-xs text-slate-500">
          <span>
            Showing {filtered.length} of {brands.length}
          </span>
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

function AddBrandDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { state, createBrand } = useWorkspace();
  const humans = state.users.filter(
    (u) => u.role === "FC_Owner" || u.role === "Admin",
  );
  const [name, setName] = useState("");
  const [source, setSource] = useState("Manual");
  const [ownerId, setOwnerId] = useState("unassigned");
  const [contacts, setContacts] = useState([emptyContactDraft()]);
  const reset = () => {
    setName("");
    setSource("Manual");
    setOwnerId("unassigned");
    setContacts([emptyContactDraft()]);
  };
  const ready = name.trim() && validContactDrafts(contacts).length > 0;
  const submit = () => {
    const result = createBrand({
      name,
      source,
      ownerId,
      contacts: validContactDrafts(contacts),
    });
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
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a Brand</DialogTitle>
          <DialogDescription>
            Enter the brand, then add one or more contacts. The brand starts at
            CP1 · Ready.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
          <label className="grid gap-2 text-sm font-medium">
            Brand
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Brand name"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Source
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Manual"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              FC-Owner
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {humans.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <BrandContactsEditor contacts={contacts} onChange={setContacts} />
        </div>
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
          <Button disabled={!ready} onClick={submit}>
            Add Brand
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
            remain unassigned until an Admin selects an FC-Owner.
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
