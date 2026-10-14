"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePageMetadata } from "@/app/use-page-metadata";
import type { BrandListItem } from "@/lib/brand-list";

type CP = 0 | 1 | 2 | 3;
type Exhibition = { id: string; name: string };
type ExhibitionData = Exhibition & { brands: BrandListItem[] };
type PerformanceData = { brands: BrandListItem[]; exhibitions: ExhibitionData[] };
type LoadState = { status: "loading" } | { status: "ready"; data: PerformanceData } | { status: "error"; message: string };

const CP_STAGES: CP[] = [0, 1, 2, 3];
const CP_MEANINGS = ["No current checkpoint", "Current CP1", "Current CP2", "Current CP3"];
const cpBackground = ["bg-slate-300", "bg-violet-400", "bg-blue-400", "bg-emerald-400"];
const number = (value: number) => value.toLocaleString("en-US");
const shortDate = (date: string | null) => date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(date)) : "—";
const currentCP = (value: string): CP | null => value === "NONE" ? 0 : /^CP[1-3]$/.test(value) ? Number(value.slice(2)) as CP : null;
const cpCounts = (brands: BrandListItem[]) => CP_STAGES.map((stage) => brands.filter((brand) => currentCP(brand.currentCp) === stage).length);

async function readBrandPage(params: URLSearchParams, signal: AbortSignal) {
  const response = await fetch(`/api/brands?${params.toString()}`, { signal, cache: "no-store" });
  const payload = await response.json() as { brands?: BrandListItem[]; nextCursor?: string | null; hasMore?: boolean; error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to load brands");
  return payload;
}

async function readAllBrands(filters: Record<string, string>, signal: AbortSignal) {
  const brands: BrandListItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams(filters);
    if (cursor) params.set("cursor", cursor);
    const page = await readBrandPage(params, signal);
    brands.push(...(page.brands || []));
    cursor = page.hasMore && page.nextCursor ? page.nextCursor : null;
  } while (cursor && !signal.aborted);
  return brands;
}

async function loadPerformanceData(signal: AbortSignal): Promise<PerformanceData> {
  const brands = await readAllBrands({}, signal);
  const exhibitionResponse = await fetch("/api/exhibitions/options", { signal, cache: "no-store" });
  if (!exhibitionResponse.ok) return { brands, exhibitions: [] };
  const payload = await exhibitionResponse.json() as { exhibitions?: Exhibition[] };
  const results = await Promise.allSettled((payload.exhibitions || []).map(async (exhibition) => ({
    ...exhibition,
    brands: await readAllBrands({ exhibitionId: exhibition.id }, signal),
  })));
  const exhibitions = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  return { brands, exhibitions };
}

function usePerformanceData() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void loadPerformanceData(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ status: "ready", data }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load performance data" });
      });
    return () => controller.abort();
  }, []);
  return state;
}

function Hint({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" aria-label={text} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-primary"><Info className="size-3.5 text-slate-400" /></button></TooltipTrigger><TooltipContent className="max-w-72 text-sm" sideOffset={6}>{text}</TooltipContent></Tooltip>;
}

function Metrics({ items }: { items: { label: string; value: ReactNode; hint?: string; available?: boolean }[] }) {
  return <div className="overflow-x-auto pb-2"><div className="grid min-w-[580px] grid-cols-4 gap-4 lg:gap-6">{items.map((item) => <div key={item.label} className="rounded-xl bg-white/45 px-4 py-5 sm:px-5"><div className="flex items-center gap-1 text-sm text-slate-500">{item.label}{item.hint && <Hint text={item.hint} />}</div><div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-950">{item.value}</div><div className="mt-2 text-xs text-slate-500">{item.available ? "Current database value" : "Not available in current data"}</div></div>)}</div></div>;
}

type Column<T> = { key: string; label: string; value: (row: T) => number | string | null; render?: (row: T) => ReactNode; hint?: string; numeric?: boolean };
function ComparisonTable<T extends { id: string }>({ rows, columns, href, label }: { rows: T[]; columns: Column<T>[]; href: (row: T) => string; label: string }) {
  const router = useRouter();
  const [sort, setSort] = useState({ key: columns[0].key, desc: false });
  const column = columns.find((item) => item.key === sort.key) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const av = column.value(a); const bv = column.value(b);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return (sort.desc ? -result : result) || a.id.localeCompare(b.id);
  });
  return <div className="overflow-x-auto"><Table className="min-w-[600px]" aria-label={label}><TableHeader className="[&_tr]:border-0"><TableRow className="border-0 hover:bg-transparent">{columns.map((item, index) => <TableHead key={item.key} aria-sort={sort.key === item.key ? sort.desc ? "descending" : "ascending" : "none"} className={index ? "text-right" : "pl-4"}><div className={`flex items-center ${index ? "justify-end" : ""}`}><button className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-slate-500 focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setSort({ key: item.key, desc: sort.key === item.key ? !sort.desc : Boolean(item.numeric) })}>{item.label}{sort.key === item.key ? sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}</button>{item.hint && <Hint text={item.hint} />}</div></TableHead>)}</TableRow></TableHeader><TableBody>{sorted.map((row) => <TableRow key={row.id} className="cursor-pointer border-0 hover:bg-white/60" onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button")) router.push(href(row)); }}>{columns.map((item, index) => <TableCell key={item.key} className={`h-16 px-4 tabular-nums ${index ? "text-right" : "font-medium"}`}>{index === 0 ? <Link className="flex min-h-11 items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary" href={href(row)}>{item.render ? item.render(row) : item.value(row)}<ChevronRight className="size-3.5 text-slate-400" /></Link> : item.render ? item.render(row) : item.value(row) ?? "—"}</TableCell>)}</TableRow>)}</TableBody></Table></div>;
}

function Section({ title, children, hint, id }: { title: string; children: ReactNode; hint?: string; id?: string }) {
  return <section id={id} className="space-y-4"><div className="flex items-center gap-1"><h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>{hint && <Hint text={hint} />}</div>{children}</section>;
}

function CPCount({ cp, count, href }: { cp: CP; count: number; href: string }) {
  return <Link href={href} aria-label={`View ${count} CP${cp} brands`} className={`ui-cp-${cp} inline-flex min-h-9 min-w-11 items-center justify-center rounded-lg px-2 font-medium hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary`}>{number(count)}</Link>;
}

function CPDistribution({ brands, href, cards = false }: { brands: BrandListItem[]; href: (cp: CP) => string; cards?: boolean }) {
  const counts = cpCounts(brands); const total = brands.length;
  return <div className="space-y-5"><div className="grid grid-cols-4 gap-3">{CP_STAGES.map((cp) => <Link key={cp} href={href(cp)} title={CP_MEANINGS[cp]} className={`rounded-lg px-3 py-4 transition-colors hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-primary ${cards ? `ui-cp-${cp}` : "bg-white/35"}`}><span className="text-sm text-slate-500">CP{cp}</span><div className="mt-2 text-2xl font-semibold tabular-nums">{number(counts[cp])}</div><span className="mt-1 block text-xs text-slate-500">{total ? `${(counts[cp] / total * 100).toFixed(1)}%` : "—"}</span></Link>)}</div><div className="flex h-3 overflow-hidden rounded-full bg-slate-200/60" aria-label="Current CP distribution">{CP_STAGES.map((cp) => counts[cp] > 0 && <Link key={cp} href={href(cp)} aria-label={`CP${cp}: ${counts[cp]}`} className={`${cpBackground[cp]} transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-primary`} style={{ width: `${counts[cp] / total * 100}%` }} />)}</div></div>;
}

function NoBrands({ description = "No brands are available for this view." }: { description?: string }) {
  return <Empty><EmptyHeader><EmptyTitle>No brands to show</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>;
}

type Href = (path: string, updates?: Record<string, string | null>) => string;
const cpColumns = <T extends { cp: number[] }>(link: (row: T, cp: CP) => string): Column<T>[] => ([1, 2, 3] as CP[]).map((cp) => ({ key: `cp${cp}`, label: `CP${cp}`, numeric: true, value: (row) => row.cp[cp], render: (row) => <CPCount cp={cp} count={row.cp[cp]} href={link(row, cp)} />, hint: `Current database count for ${CP_MEANINGS[cp]}.` }));

function PerformanceOverview({ data, href }: { data: PerformanceData; href: Href }) {
  const exhibitions = data.exhibitions.map((exhibition) => ({ ...exhibition, cp: cpCounts(exhibition.brands) }));
  const ams = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; brands: BrandListItem[] }>();
    data.brands.forEach((brand) => {
      if (!brand.ownerId || !brand.ownerName) return;
      const current = groups.get(brand.ownerId) || { id: brand.ownerId, name: brand.ownerName, brands: [] };
      current.brands.push(brand); groups.set(brand.ownerId, current);
    });
    return [...groups.values()].map((am) => ({ ...am, cp: cpCounts(am.brands) }));
  }, [data.brands]);
  return <>
    <Metrics items={[
      { label: "Total Brands", value: number(data.brands.length), available: true, hint: "All visible Follow-up Client records returned by the existing Brands data source." },
      { label: "New CP3", value: "—", hint: "CP advancement history is not available through the existing list data." },
      { label: "Total Investment", value: "—", hint: "Exhibition and follow-up cost records are not available through the existing data source." },
      { label: "Cost / CP3", value: "—", hint: "Requires both cost records and CP3 advancement history." },
    ]} />
    <Section title="Exhibition Performance" hint="Current brand and CP values are grouped from existing Exhibition and Brand records. Cost and historical advancement metrics remain blank until a direct source exists.">{exhibitions.length ? <ComparisonTable label="Exhibition performance" rows={exhibitions} href={(exhibition) => href(`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`)} columns={[
      { key: "name", label: "Exhibition", value: (exhibition) => exhibition.name },
      { key: "brands", label: "Brands", numeric: true, value: (exhibition) => exhibition.brands.length },
      ...cpColumns<typeof exhibitions[number]>((exhibition, cp) => href(`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`, { cp: String(cp) })),
      { key: "cost", label: "Cost / CP3", numeric: true, value: () => null, render: () => "—" },
    ]} /> : <NoBrands description="No exhibitions are linked to the current brand records." />}</Section>
    <Section title="AM Performance" hint="Assigned brand and current CP values come from current Owner assignments. Historical advancement is unavailable in the existing data source.">{ams.length ? <ComparisonTable label="AM performance" rows={ams} href={(am) => href(`/performance/ams/${encodeURIComponent(am.id)}`)} columns={[
      { key: "name", label: "AM", value: (am) => am.name },
      { key: "brands", label: "Brands", numeric: true, value: (am) => am.brands.length },
      ...cpColumns<typeof ams[number]>((am, cp) => href(`/performance/ams/${encodeURIComponent(am.id)}`, { cp: String(cp) })),
      { key: "advanced", label: "Advanced", numeric: true, value: () => null, render: () => "—" },
    ]} /> : <NoBrands description="No brands currently have an assigned Account Manager." />}</Section>
  </>;
}

function ExhibitionDetail({ exhibition, href, cp }: { exhibition: ExhibitionData; href: Href; cp: CP | null }) {
  const contributions = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; brands: BrandListItem[] }>();
    exhibition.brands.forEach((brand) => {
      if (!brand.ownerId || !brand.ownerName) return;
      const current = groups.get(brand.ownerId) || { id: brand.ownerId, name: brand.ownerName, brands: [] };
      current.brands.push(brand); groups.set(brand.ownerId, current);
    });
    return [...groups.values()];
  }, [exhibition.brands]);
  const currentCP3 = cpCounts(exhibition.brands)[3];
  return <>
    <Metrics items={[
      { label: "Brands", value: number(exhibition.brands.length), available: true },
      { label: "Samples Delivered", value: "—" },
      { label: "New CP3", value: "—" },
      { label: "Cost / CP3", value: "—" },
    ]} />
    <div className="grid gap-10 xl:grid-cols-2">
      <Section title="Conversion Progress" hint="Only current Brands and Current CP3 can be read directly from the existing records."><div className="space-y-5">{[{ label: "Brands", value: number(exhibition.brands.length) }, { label: "Samples Delivered", value: "—" }, { label: "Replied Brands", value: "—" }, { label: "Engaged Brands", value: "—" }, { label: "Current CP3", value: number(currentCP3) }].map((item) => <div key={item.label} className="grid grid-cols-[145px_1fr_40px] items-center gap-3 text-sm"><span className="text-slate-600">{item.label}</span><div className="h-2 rounded-full bg-slate-200/60">{typeof item.value === "number" && <div className="h-2 rounded-full bg-primary/65" style={{ width: `${exhibition.brands.length ? item.value / exhibition.brands.length * 100 : 0}%` }} />}</div>{item.label === "Current CP3" ? <Link href={href(`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`, { cp: "3" })} className="text-right font-medium tabular-nums hover:text-primary">{item.value}</Link> : <span className="text-right font-medium tabular-nums">{item.value}</span>}</div>)}</div></Section>
      <Section title="CP Distribution" hint="Current CP is read from each linked Brand record."><CPDistribution brands={exhibition.brands} href={(stage) => href(`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`, { cp: String(stage) })} /></Section>
    </div>
    <Section title="AM Contribution" hint="Current assigned brands are available. Historical CP achievement events are not available in the existing data source.">{contributions.length ? <ComparisonTable label="AM contribution" rows={contributions} href={(am) => href(`/performance/ams/${encodeURIComponent(am.id)}`, { exhibition: exhibition.id, cp: null })} columns={[
      { key: "name", label: "AM", value: (am) => am.name }, { key: "brands", label: "Brands", numeric: true, value: (am) => am.brands.length },
      ...([1, 2, 3] as const).map((stage) => ({ key: `new${stage}`, label: `New CP${stage}`, numeric: true, value: () => null, render: () => "—" })),
    ]} /> : <NoBrands description="No brands from this exhibition currently have an assigned Account Manager." />}</Section>
    {cp !== null && <BrandList brands={exhibition.brands} cp={cp} href={href} filterPath={`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`} />}
  </>;
}

function BrandList({ brands, cp, href, filterPath }: { brands: BrandListItem[]; cp: CP | null; href: Href; filterPath: string }) {
  const pathname = usePathname(); const filtered = brands.filter((brand) => cp === null || currentCP(brand.currentCp) === cp);
  return <Section title="Brand List" id="brands"><div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filter brands by CP">{[null, ...CP_STAGES].map((stage) => <Button key={stage ?? "all"} asChild variant={stage === cp ? "secondary" : "ghost"} className={`h-11 min-w-14 ${stage === cp ? "ring-1 ring-primary/30" : ""}`}><Link aria-pressed={stage === cp} href={`${href(filterPath, { cp: stage === null ? null : String(stage) })}#brands`}>{stage === null ? "All" : `CP${stage}`}</Link></Button>)}</div>{filtered.length ? <ComparisonTable label="Assigned brands" rows={filtered} href={(brand) => `/customers/${encodeURIComponent(brand.id)}?returnTo=${encodeURIComponent(href(pathname))}`} columns={[
    { key: "brand", label: "Brand", value: (brand) => brand.name },
    { key: "exhibition", label: "Exhibition", value: () => null, render: () => "—" },
    { key: "cp", label: "Current CP", value: (brand) => brand.currentCp, render: (brand) => <span className={`ui-cp-${currentCP(brand.currentCp) ?? 0} rounded-md px-2 py-1 text-xs font-medium`}>{brand.currentCp === "NONE" ? "CP0" : brand.currentCp}</span> },
    { key: "advancement", label: "Last Advancement", value: () => null, render: () => "—" },
    { key: "interaction", label: "Last Interaction", value: (brand) => brand.lastInteractionAt, render: (brand) => shortDate(brand.lastInteractionAt) },
  ]} /> : <NoBrands description="No brands match this CP filter." />}</Section>;
}

function AMDetail({ am, exhibition, href, cp }: { am: { id: string; name: string; brands: BrandListItem[] }; exhibition?: ExhibitionData; href: Href; cp: CP | null }) {
  const brands = exhibition ? exhibition.brands.filter((brand) => brand.ownerId === am.id) : am.brands;
  const activity = ["OmniReach Sends", "Emails Sent", "WhatsApp Sent", "SMS Sent", "LinkedIn Sent", "Caller Calls"];
  return <>
    <Metrics items={[
      { label: "Assigned Brands", value: number(brands.length), available: true },
      { label: "Replied Brands", value: "—" },
      { label: "Engaged Brands", value: "—" },
      { label: "Advanced Brands", value: "—" },
    ]} />
    <Section title="Current CP Distribution" hint="Each current CP is read directly from the brand's Current CP field."><CPDistribution brands={brands} cards href={(stage) => `${href(`/performance/ams/${encodeURIComponent(am.id)}`, { exhibition: exhibition?.id || null, cp: String(stage) })}#brands`} /></Section>
    <Section title="CP Advancement"><div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((stage) => <div key={stage} className="py-2"><div className="text-sm text-slate-500">Reached CP{stage}</div><div className="mt-2 text-2xl font-semibold tabular-nums">—</div></div>)}</div></Section>
    <Section title="Activity & Effort"><div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">{activity.map((label) => <div key={label}><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">—</div></div>)}</div></Section>
    <BrandList brands={brands} cp={cp} href={href} filterPath={`/performance/ams/${encodeURIComponent(am.id)}`} />
  </>;
}

function findAM(brands: BrandListItem[], id: string) {
  const owned = brands.filter((brand) => brand.ownerId === id);
  return owned.length ? { id, name: owned[0].ownerName || "Account Manager", brands: owned } : null;
}

export function PerformancePages() {
  const pathname = usePathname(); const search = useSearchParams(); const dataState = usePerformanceData();
  const [, , section, rawId] = pathname.split("/"); const id = rawId ? decodeURIComponent(rawId) : "";
  const cpParam = search.get("cp"); const cp = cpParam !== null && /^[0-3]$/.test(cpParam) ? Number(cpParam) as CP : null;
  const href: Href = (path, updates = {}) => {
    const params = new URLSearchParams(search.toString());
    ["range", "start", "end"].forEach((key) => params.delete(key));
    Object.entries(updates).forEach(([key, value]) => value === null ? params.delete(key) : params.set(key, value));
    const query = params.toString(); return query ? `${path}?${query}` : path;
  };
  const data = dataState.status === "ready" ? dataState.data : null;
  const exhibition = data?.exhibitions.find((item) => item.id === (section === "exhibitions" ? id : search.get("exhibition"))) ?? undefined;
  const am = data && section === "ams" ? findAM(data.brands, id) : null;
  const validRoute = pathname === "/performance" || (section === "exhibitions" && Boolean(exhibition)) || (section === "ams" && Boolean(am));
  const title = !validRoute ? "Exhibition Performance not found" : section === "exhibitions" ? exhibition!.name : section === "ams" ? `${am!.name} — Exhibition Performance` : "Exhibition Performance";
  usePageMetadata({ title, description: "Current exhibition and AM data from the existing SFU records." });
  const back = section === "ams" && exhibition ? href(`/performance/exhibitions/${encodeURIComponent(exhibition.id)}`, { exhibition: null, cp: null }) : href("/performance", { exhibition: null, cp: null });
  return <TooltipProvider delayDuration={150}><div className="mx-auto max-w-6xl space-y-10 pb-12"><header className="space-y-4">{section && <Link href={back} className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-500 hover:text-primary"><ArrowLeft className="size-4" />{section === "ams" && exhibition ? `Back to ${exhibition.name}` : "Back to Exhibition Performance"}</Link>}<div className="flex items-center gap-2"><SidebarTrigger className="md:hidden" /><h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950">{title}</h1></div><p className="text-sm text-slate-500">Current database data. Metrics without a direct source are shown as —.</p></header>{dataState.status === "loading" ? <Empty><EmptyHeader><EmptyTitle>Loading performance data</EmptyTitle><EmptyDescription>Reading current Brand and Exhibition records.</EmptyDescription></EmptyHeader></Empty> : dataState.status === "error" ? <Empty><EmptyHeader><EmptyTitle>Performance data is unavailable</EmptyTitle><EmptyDescription>{dataState.message}</EmptyDescription></EmptyHeader><Button asChild variant="secondary"><Link href="/performance">Try again</Link></Button></Empty> : !validRoute ? <Empty><EmptyHeader><EmptyTitle>Exhibition Performance not found</EmptyTitle><EmptyDescription>Select an exhibition or Account Manager from Exhibition Performance.</EmptyDescription></EmptyHeader><Button asChild variant="secondary"><Link href="/performance">Back to Exhibition Performance</Link></Button></Empty> : section === "exhibitions" ? <ExhibitionDetail exhibition={exhibition!} href={href} cp={cp} /> : section === "ams" ? <AMDetail am={am!} exhibition={exhibition} href={href} cp={cp} /> : <PerformanceOverview data={data!} href={href} />}</div></TooltipProvider>;
}
