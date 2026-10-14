"use client";

import { isCpVisible, cpDisplayText } from "@/lib/cp-visibility";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ChevronRight, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePageMetadata } from "@/app/use-page-metadata";
import { identity, metrics, snapshot, queryRange, presetRange, validDate, VISIBLE_STAGES, type Stage, type SourceData, type Snapshot, type Range, type Preset, type Opportunity } from "@/lib/performance/data";

type LoadState = { status: "loading"; data?: SourceData } | { status: "ready"; data: SourceData } | { status: "error"; message: string };
type Href = (path: string, updates?: Record<string, string | null>) => string;
const value = (n: number | null) => n === null ? "—" : n.toLocaleString("en-US");
const shortDate = (date: string | null) => date && Number.isFinite(Date.parse(date)) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(date)) : "—";
const missingCost = "The existing records do not contain exhibition or follow-up investment amounts.";
const currentHint = "Counts brands once at their latest current Round. On an AM page, only active opportunities assigned to that AM are included; if a brand has multiple Rounds, its latest active Round determines its current CP.";
const communicationHint = "Actual Interaction At records. Saved Round markers use the AM responsible at event time; legacy records without a Round marker use the brand's Owner at the selected cutoff. Historical cutoffs without ownership evidence remain unavailable.";
const color: Partial<Record<Stage, string>> = { CP1: "bg-violet-400", CP2: "bg-blue-400", CP3: "bg-emerald-400", Nurture: "bg-amber-400" };

function Hint({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" aria-label={text} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-primary"><Info className="size-3.5 text-slate-400" /></button></TooltipTrigger><TooltipContent className="max-w-80 text-sm" sideOffset={6}>{text}</TooltipContent></Tooltip>;
}
function Section({ title, children, hint, id }: { title: string; children: ReactNode; hint?: string; id?: string }) {
  return <section id={id} className="space-y-4"><div className="flex items-center gap-1"><h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>{hint && <Hint text={hint} />}</div>{children}</section>;
}
function NoData({ text }: { text: string }) {
  return <Empty><EmptyHeader><EmptyTitle>No records to show</EmptyTitle><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>;
}
function Metrics({ items }: { items: { label: string; count: number | null; hint?: string; period?: boolean }[] }) {
  return <div className="overflow-x-auto pb-2"><div className={`grid min-w-[580px] ${items.length === 3 ? "grid-cols-3" : "grid-cols-4"} gap-4`}>{items.map(item => <div key={item.label} className="px-2 py-3"><div className="flex items-center gap-1 text-sm text-slate-500">{item.label}{item.hint && <Hint text={item.hint} />}</div><div className="mt-2 text-3xl font-semibold tabular-nums">{value(item.count)}</div><div className="mt-2 text-xs text-slate-500">{item.period ? "In selected period" : "As of end date"}</div></div>)}</div></div>;
}
function LoadingPerformance({ section }: { section?: string }) {
  const sectionTitles = section === "exhibitions"
    ? ["Follow-up Progress", "Current CP Distribution", "AM Contribution", "Brand List"]
    : section === "ams" ? ["Current CP Distribution", "Activity & Effort", "Brand List"]
      : ["Exhibition Performance", "AM Performance"];
  return <div className="space-y-10" aria-busy="true" aria-label="Loading performance data">
    <div className="overflow-x-auto pb-2"><div className="grid min-w-[580px] grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 px-2 py-3"><div className="h-4 w-28 animate-pulse rounded bg-slate-200/80" /><div className="h-9 w-20 animate-pulse rounded bg-slate-200/80" /><div className="h-3 w-24 animate-pulse rounded bg-slate-200/60" /></div>)}</div></div>
    {sectionTitles.map(title => <Section key={title} title={title}><div className="space-y-3 overflow-hidden rounded-xl border border-slate-200/70 bg-white/35 p-4"><div className="h-8 w-full animate-pulse rounded bg-slate-200/50" /><div className="h-14 w-full animate-pulse rounded bg-slate-200/40" /><div className="h-14 w-4/5 animate-pulse rounded bg-slate-200/40" /></div></Section>)}
    <p role="status" className="text-sm text-slate-500">Loading performance data…</p>
  </div>;
}
function DateFilter({ range, preset, change }: { range: Range; preset: Preset; change: (updates: Record<string, string | null>) => void }) {
  const [custom, setCustom] = useState(preset === "custom");
  const [error, setError] = useState("");
  return <div className="flex flex-col gap-2 sm:items-end"><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-slate-500">{shortDate(range.start)} – {shortDate(range.end)}, {range.end.slice(0, 4)}</span><select aria-label="Performance date range" className="h-11 rounded-lg bg-white/60 px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" value={custom ? "custom" : preset} onChange={event => { const selected = event.target.value; setCustom(selected === "custom"); setError(""); if (selected !== "custom") { const next = presetRange(Number(selected)); change({ range: selected, start: next.start, end: next.end }); } }}><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="custom">Custom Range</option></select></div>{custom && <form key={range.start + range.end} className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const start = String(data.get("start")); const end = String(data.get("end")); if (!validDate(start) || !validDate(end) || start > end) { setError("Choose a valid date range."); return; } change({ range: "custom", start, end }); setError(""); }}><label className="text-xs text-slate-500">From<Input className="mt-1 h-11 w-36" type="date" name="start" aria-label="Start date" defaultValue={range.start} required /></label><label className="text-xs text-slate-500">To<Input className="mt-1 h-11 w-36" type="date" name="end" aria-label="End date" defaultValue={range.end} required /></label><Button variant="secondary" className="h-11" type="submit">Apply</Button>{error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}</form>}</div>;
}
type Column<T> = { key: string; label: string; value: (row: T) => number | string | null; render?: (row: T) => ReactNode; hint?: string; numeric?: boolean };
function ComparisonTable<T extends { id: string }>({ rows, columns, href, label }: { rows: T[]; columns: Column<T>[]; href: (row: T) => string; label: string }) {
  const router = useRouter();
  const [sort, setSort] = useState({ key: columns.find(item => item.key === "brands" || item.key === "assigned")?.key || columns[0].key, desc: columns.some(item => item.key === "brands" || item.key === "assigned") });
  const [page, setPage] = useState(1);
  const column = columns.find((item) => item.key === sort.key) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const av = column.value(a); const bv = column.value(b);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return (sort.desc ? -result : result) || a.id.localeCompare(b.id);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / 20));
  const currentPage = Math.min(page, pageCount);
  const displayed = sorted.slice((currentPage - 1) * 20, currentPage * 20);
  return <div><div className="overflow-x-auto"><Table className="min-w-[600px]" aria-label={label}><TableHeader className="[&_tr]:border-0"><TableRow className="border-0 hover:bg-transparent">{columns.map((item, index) => <TableHead key={item.key} aria-sort={sort.key === item.key ? sort.desc ? "descending" : "ascending" : "none"} className={index ? "text-right" : "pl-4"}><div className={`flex items-center ${index ? "justify-end" : ""}`}><button className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-slate-500 focus-visible:ring-2 focus-visible:ring-primary" onClick={() => { setPage(1); setSort({ key: item.key, desc: sort.key === item.key ? !sort.desc : Boolean(item.numeric) }); }}>{item.label}{sort.key === item.key ? sort.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}</button>{item.hint && <Hint text={item.hint} />}</div></TableHead>)}</TableRow></TableHeader><TableBody>{displayed.map((row) => <TableRow key={row.id} className="cursor-pointer border-0 hover:bg-white/60" onClick={(event) => { if (!(event.target as HTMLElement).closest("a,button")) router.push(href(row)); }}>{columns.map((item, index) => <TableCell key={item.key} className={`h-16 px-4 tabular-nums ${index ? "text-right" : "font-medium"}`}>{index === 0 ? <Link className="flex min-h-11 items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary" href={href(row)}>{item.render ? item.render(row) : item.value(row)}<ChevronRight className="size-3.5 text-slate-400" /></Link> : item.render ? item.render(row) : item.value(row) ?? "—"}</TableCell>)}</TableRow>)}</TableBody></Table></div>{pageCount > 1 && <div className="flex items-center justify-between gap-3 pt-3 text-xs text-slate-500"><span>{(currentPage - 1) * 20 + 1}–{Math.min(currentPage * 20, sorted.length)} of {sorted.length}</span><div className="flex items-center gap-2"><Button className="h-11" variant="ghost" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label={"Previous page of " + label}>Previous</Button><span>{currentPage} / {pageCount}</span><Button className="h-11" variant="ghost" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} aria-label={"Next page of " + label}>Next</Button></div></div>}</div>;
}


type PerformanceMetric = ReturnType<typeof metrics>;
type Entity = { id: string; name: string };
type MetricRow = Entity & PerformanceMetric;
function CPCount({ count, href, stage }: { count: number | null; href: string; stage: Stage }) {
  return count === null ? <span>—</span> : <Link href={href} aria-label={"View brands in " + stage} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-medium hover:bg-white/60 focus-visible:ring-2 focus-visible:ring-primary">{value(count)}</Link>;
}
function cpColumns(link: (row: MetricRow, stage: Stage) => string): Column<MetricRow>[] {
  return VISIBLE_STAGES.map(stage => ({ key: stage, label: stage, numeric: true, value: row => row.cp[stage], render: row => <CPCount count={row.cp[stage]} stage={stage} href={link(row, stage)} /> }));
}
function CPDistribution({ metric, link }: { metric: PerformanceMetric; link: (stage: Stage | "unknown") => string }) {
  const total = VISIBLE_STAGES.reduce((sum, stage) => sum + (metric.cp[stage] || 0), 0);
  return <div className="space-y-5"><div className="grid grid-cols-4 gap-3 lg:grid-cols-5">{VISIBLE_STAGES.map(stage => <Link key={stage} href={link(stage)} className="min-h-24 px-2 py-3 hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-primary"><span className="text-sm text-slate-500">{stage}</span><div className="mt-2 text-2xl font-semibold tabular-nums">{value(metric.cp[stage])}</div><span className="mt-1 block text-xs text-slate-500">{total && metric.cp[stage] !== null ? (metric.cp[stage]! / total * 100).toFixed(1) + "%" : "—"}</span></Link>)}</div>{metric.unknownCP > 0 && <Link href={link("unknown")} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-500">Unknown CP · {metric.unknownCP}<Hint text="The saved current stage cannot establish the state at this historical cutoff, or the checkpoint is unrecognized." /></Link>}<div className="flex h-3 overflow-hidden rounded-full bg-slate-200/60" aria-label="Current CP distribution">{VISIBLE_STAGES.map(stage => metric.cp[stage] !== null && metric.cp[stage]! > 0 && <Link key={stage} aria-label={stage + ": " + metric.cp[stage]} href={link(stage)} className={color[stage]} style={{ width: metric.cp[stage]! / total * 100 + "%" }} />)}</div></div>;
}
function amEntities(view: Snapshot) {
  const groups = new Map<string, Entity>(view.data.owners.map(o => [identity(o.id), o]));
  (view.data.rounds || []).forEach(r => { if (r.assigned_am_id && r.assigned_am_name) groups.set(identity(r.assigned_am_id), { id: r.assigned_am_id, name: r.assigned_am_name }); });
  (view.data.assignments || []).forEach(a => {
    if (a.previous_am_id && a.previous_am_name) groups.set(identity(a.previous_am_id), { id: a.previous_am_id, name: a.previous_am_name });
    if (a.new_am_id && a.new_am_name) groups.set(identity(a.new_am_id), { id: a.new_am_id, name: a.new_am_name });
  });
  return [...groups.values()];
}
function ExhibitionTable({ view, href }: { view: Snapshot; href: Href }) {
  const rows: MetricRow[] = view.data.exhibitions.filter(e => view.exhibitBrands.has(identity(e.id)) || view.opportunities.some(r => r.sourceId && identity(r.sourceId) === identity(e.id))).map(e => ({ ...e, ...metrics(view, undefined, e.id) }));
  return <Section title="Exhibition Performance" hint="Brands are deduplicated ClientDB profiles linked to the exhibition. CP1/2/3 counts are distinct brands, using the latest Round for that brand within the exhibition. Historical source changes are not stored, so past exhibition totals are unavailable.">{rows.length ? <ComparisonTable label="Exhibition performance" rows={rows} href={e => href("/performance/exhibitions/" + e.id, { exhibition: null, cp: null })} columns={[
    { key: "name", label: "Exhibition", value: e => e.name },
    { key: "brands", label: "Brands", numeric: true, value: e => e.brands },
    { key: "rounds", label: "Opportunities", numeric: true, value: e => e.assigned },
    ...cpColumns((e, stage) => href("/performance/exhibitions/" + e.id, { cp: stage, exhibition: null }) + "#brands"),
    { key: "cost", label: "Cost / CP3", numeric: true, value: () => null, hint: missingCost },
  ]} /> : <NoData text="No brands or recorded opportunities are linked to an exhibition by this end date." />}</Section>;
}
function AMTable({ view, href, exhibition }: { view: Snapshot; href: Href; exhibition?: Entity }) {
  const rows: MetricRow[] = amEntities(view).map(am => ({ ...am, ...metrics(view, am.id, exhibition?.id) })).filter(am => !exhibition || am.rounds.length || view.events.some(e => e.ownerId && identity(e.ownerId) === identity(am.id) && e.sourceId && identity(e.sourceId) === identity(exhibition.id)));
  return <Section title={exhibition ? "AM Contribution" : "AM Performance"} hint={currentHint}>{rows.length ? <ComparisonTable label={exhibition ? "AM contribution" : "AM performance"} rows={rows} href={am => href("/performance/ams/" + am.id, { exhibition: exhibition?.id || null, cp: null })} columns={[
    { key: "name", label: "AM", value: am => am.name },
    { key: "assigned", label: "Assigned opportunities", numeric: true, value: am => am.assigned, hint: "Saved unfinished Rounds and current Follow-up records assigned to this AM. Completed records are excluded. Historical responsibility without evidence is unavailable." },
    ...(exhibition ? [1, 2, 3].map(stage => ({ key: "CP" + stage, label: "CP" + stage, numeric: true, value: (am: MetricRow) => am.cp[("CP" + stage) as Stage] })) : cpColumns((am, stage) => href("/performance/ams/" + am.id, { exhibition: null, cp: stage }) + "#brands")),
  ]} /> : <NoData text="No Account Manager opportunities have a primary source in this exhibition." />}</Section>;
}
function Overview({ view, href }: { view: Snapshot; href: Href }) {
  const metric = metrics(view);
  return <><Metrics items={[
    { label: "Total Brands", count: view.totalBrands, hint: "Non-test Follow-up brands acquired by the cutoff, deduplicated by Parent / Master Record and shared Client ID. Uses the same non-test brand scope as the Brands list." },
    { label: "Current CP3", count: metric.cp.CP3, hint: "Number of distinct brands whose latest current Round is at CP3." },
    { label: "Total Investment", count: null, hint: missingCost },
    { label: "Cost / CP3", count: null, hint: missingCost },
  ]} /><ExhibitionTable view={view} href={href} /><AMTable view={view} href={href} /></>;
}
function BrandList({ view, rounds, href, cp }: { view: Snapshot; rounds: Opportunity[]; href: Href; cp: string | null }) {
  const pathname = usePathname();
  const filtered = rounds.filter(r => !cp || (cp === "unknown" ? r.cp === null : r.cp === cp));
  const name = (r: Opportunity) => view.data.exhibitions.find(e => r.sourceId && identity(e.id) === identity(r.sourceId))?.name || null;
  return <Section title="Brand List" id="brands" hint="One row per saved Round or an existing current Follow-up record without a saved Round. The row label distinguishes these sources. Links open the existing Brand Detail."><div role="group" aria-label="Filter brands by CP" className="flex gap-1 overflow-x-auto pb-1">{[null, ...VISIBLE_STAGES, ...(rounds.some(r => r.cp === null) ? ["unknown"] : [])].map(stage => <Button key={stage || "all"} asChild variant={cp === stage ? "secondary" : "ghost"} className="h-11 shrink-0"><Link aria-current={cp === stage ? "true" : undefined} href={href(pathname, { cp: stage }) + "#brands"}>{stage === null ? "All" : stage === "unknown" ? "Unknown" : stage}</Link></Button>)}</div>{filtered.length ? <ComparisonTable key={cp || "all"} label="Brand opportunities" rows={filtered} href={r => "/customers/" + encodeURIComponent(r.followupId) + "?returnTo=" + encodeURIComponent(href(pathname))} columns={[
    { key: "name", label: "Brand", value: r => r.name, render: r => <div>{r.name}<span className="ml-2 text-xs font-normal text-slate-400">{r.roundNumber ? "Round " + r.roundNumber : "Current record"}</span></div> },
    { key: "exhibition", label: "Primary exhibition", value: name },
    { key: "cp", label: "Current CP", value: r => r.cp, render: r => r.cp ? cpDisplayText(r.cp) : "Unknown" },
    { key: "interaction", label: "Last Interaction", value: r => r.lastInteraction, render: r => shortDate(r.lastInteraction) },
  ]} /> : <NoData text="No recorded opportunities match this CP filter." />}</Section>;
}
function ExhibitionDetail({ exhibition, view, href, cp }: { exhibition: Entity; view: Snapshot; href: Href; cp: string | null }) {
  const metric = metrics(view, undefined, exhibition.id);
  const link = (stage: string) => href("/performance/exhibitions/" + exhibition.id, { cp: stage }) + "#brands";
  const progress: { label: string; count: number | null; hint?: string }[] = [
    { label: "Brands", count: metric.brands },
    { label: "Samples Delivered", count: metric.samplesDelivered, hint: "Total Sample Links in these brands' details. Each link counts once; a brand can have multiple links." },
    { label: "Sample Tapped Brands", count: metric.sampleTapped, hint: "Distinct brands with at least one external Sample Tap. Repeated taps by the same brand count once." },
    { label: "Replied Brands", count: metric.replied, hint: "Distinct brands with an inbound reply in Email, SMS, WhatsApp, LinkedIn, or a connected inbound Phone call." },
    { label: "Back-and-forth Brands", count: metric.engaged, hint: "Distinct brands with at least one thread containing both an outbound message and an inbound reply, in either order." },
    { label: "Current CP3", count: metric.cp.CP3, hint: "Brands currently at CP3. CP3 already represents Meeting Confirmed." },
  ];
  const max = Math.max(1, ...progress.map(p => p.count || 0));
  return <><Metrics items={[
    { label: "Brands", count: metric.brands, hint: "Unique ClientDB brands acquired from this exhibition by the cutoff." },
    { label: "Samples Delivered", count: metric.samplesDelivered, hint: "Counts each Sample Link listed in the Brand Details for brands from this exhibition. Multiple links under one brand count separately." },
    { label: "Current CP3", count: metric.cp.CP3, hint: "Number of distinct exhibition brands whose latest current Round is at CP3." },
    { label: "Cost / CP3", count: null, hint: missingCost },
  ]} /><div className="grid gap-10 xl:grid-cols-2"><Section title="Conversion Progress" hint="Counts distinct brands linked to this exhibition as of the selected end date, except Samples Delivered, which counts Sample Links. Communication metrics include recorded activity up to that end date. Replies include Email, SMS, WhatsApp, LinkedIn and connected inbound Phone calls."><div className="space-y-5">{progress.map(p => <div key={p.label} className="grid grid-cols-[180px_1fr_40px] items-center gap-3 text-sm"><span className="flex items-center gap-1 text-slate-600">{p.label}{p.hint && <Hint text={p.hint} />}</span><div className="h-2 rounded-full bg-slate-200/60">{p.count !== null && <div className="h-2 rounded-full bg-primary/65" style={{ width: p.count / max * 100 + "%" }} />}</div>{p.label === "Current CP3" && p.count !== null ? <Link href={link("CP3")} className="text-right tabular-nums">{value(p.count)}</Link> : <span className="text-right tabular-nums">{value(p.count)}</span>}</div>)}</div></Section><Section title="CP Distribution" hint={currentHint}><CPDistribution metric={metric} link={link} /></Section></div><AMTable view={view} href={href} exhibition={exhibition} /><BrandList view={view} rounds={metric.rounds} href={href} cp={cp} /></>;
}
function AMDetail({ am, exhibition, view, href, cp }: { am: Entity; exhibition?: Entity; view: Snapshot; href: Href; cp: string | null }) {
  const metric = metrics(view, am.id, exhibition?.id);
  const activity = [
    { label: "OmniReach Sends", count: metric.activity.omniReachSends, hint: "Counts each task from an OmniReach run once, across channels, only when its linked outbound message has an actual Interaction At. Grouped by the task's brand and Owner. Queued tasks without an actual send do not count." },
    { label: "Send Message Sends", count: metric.activity.sendMessageSends, hint: "Counts each task created through the separate Send Message entry once, across channels, only when its linked outbound message has an actual Interaction At. Grouped by the task's brand and Owner." },
    { label: "OmniReach Runs", count: metric.activity.runs, hint: "Distinct OmniReach Run IDs launched in the selected period, using the first task creation time. Assigned to that task's Owner at launch; saved Round assignment history is the fallback. In an exhibition view, only Runs for its brands count." },
    { label: "Emails Sent", count: metric.activity.email, hint: "Actual outbound Email Conversation records in the selected period, deduplicated by provider Message ID or record ID; attributed through the Round or brand Owner." },
    { label: "WhatsApp Sent", count: metric.activity.whatsapp, hint: "Actual outbound WhatsApp Conversation records in the selected period, deduplicated by provider Message ID or record ID; attributed through the Round or brand Owner." },
    { label: "SMS Sent", count: metric.activity.sms, hint: "Actual outbound SMS Conversation records in the selected period, deduplicated by provider Message ID or record ID; attributed through the Round or brand Owner." },
    { label: "LinkedIn Sent", count: metric.activity.linkedin, hint: "Actual outbound LinkedIn Conversation records in the selected period, deduplicated by provider Message ID or record ID; attributed through the Round or brand Owner." },
    { label: "Caller Calls", count: metric.activity.calls, hint: "Phone Conversation records with a Call Result during the selected period, for brands assigned to this AM. Each call record counts once; the count is grouped by the AM responsible for the brand." },
  ];
  return <><Metrics items={[
    { label: "Assigned Brands", count: metric.assignedBrands, hint: "Distinct brands assigned to this AM with an active opportunity. A brand with multiple active Rounds counts once." },
    { label: "Replied Brands", count: metric.replied, period: true, hint: "Distinct brands with an inbound reply across Email, SMS, WhatsApp, LinkedIn, or connected inbound Phone calls." },
    { label: "Back-and-forth Brands", count: metric.engaged, period: true, hint: communicationHint + " Requires an outbound message and inbound reply in the same conversation thread, in either order." },
  ]} /><Section title="Current CP Distribution" hint={currentHint}><CPDistribution metric={metric} link={stage => href("/performance/ams/" + am.id, { cp: stage }) + "#brands"} /></Section><Section title="Activity & Effort" hint={communicationHint + " OmniReach Sends and Send Message Sends are separate entry points; each counts only tasks linked to an actual outbound message with an Interaction At. Scheduled messages and task creation times are not counted as actual sends."}><div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">{activity.map(item => <div key={item.label}><div className="flex items-center gap-1 text-sm text-slate-500">{item.label}{item.hint && <Hint text={item.hint} />}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{value(item.count)}</div></div>)}</div></Section>{metric.unknownEvents > 0 && <p className="text-xs text-slate-500">{metric.unknownEvents} interactions cannot be attributed to an AM from the available Round or brand Owner records; related metrics are unavailable.</p>}<BrandList view={view} rounds={metric.brandRounds} href={href} cp={cp} /></>;
}

export function PerformancePages() {
  const pathname = usePathname(); const search = useSearchParams(); const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch("/api/brands?view=performance" + (reload ? "&refresh=1" : ""), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Unable to read performance data");
      }
      if (!response.body) throw new Error("Performance data stream is unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (!controller.signal.aborted) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) {
            const event = JSON.parse(line) as { phase: "core" | "complete" | "error"; performance?: SourceData; error?: string };
            if (event.phase === "error") throw new Error(event.error || "Unable to load performance data");
            if (!event.performance) throw new Error("Performance data was empty");
            if (event.phase === "core") setState({ status: "loading", data: event.performance });
            else { setState({ status: "ready", data: event.performance }); completed = true; }
          }
          newline = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (!controller.signal.aborted && !completed) throw new Error("Performance data stream ended early");
    })().catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load performance data" });
    });
    return () => controller.abort();
  }, [reload]);
  const refresh = () => { setState(current => { const data = "data" in current ? current.data : undefined; return { status: "loading", ...(data ? { data } : {}) }; }); setReload(n => n + 1); };
  const { range, preset } = queryRange(search);
  const sourceData = state.status === "ready" ? state.data : state.status === "loading" ? state.data : undefined;
  const view = useMemo(() => sourceData ? snapshot(sourceData, range) : null, [sourceData, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const [, , section, rawId] = pathname.split("/");
  const id = rawId ? decodeURIComponent(rawId) : "";
  const context = section === "exhibitions" ? id : search.get("exhibition");
  const exhibition = view?.data.exhibitions.find(e => context && identity(e.id) === identity(context));
  const am = view ? amEntities(view).find(o => identity(o.id) === identity(id)) : undefined;
  const cp = isCpVisible(search.get("cp")) ? search.get("cp") : null;
  const validRoute = pathname === "/performance" || section === "exhibitions" && !!exhibition || section === "ams" && !!am && (!context || !!exhibition);
  const title = section === "exhibitions" ? exhibition?.name || "Exhibition Performance" : section === "ams" ? (am?.name || "AM") + " — Performance" : "Exhibition Performance";
  usePageMetadata({ title, description: "Exhibition, brand, Round and AM performance from the existing business databases." });
  const href: Href = (path, updates = {}) => {
    const params = new URLSearchParams(search.toString());
    params.set("range", preset); params.set("start", range.start); params.set("end", range.end);
    Object.entries(updates).forEach(([key, val]) => val === null ? params.delete(key) : params.set(key, val));
    return path + "?" + params.toString();
  };
  const back = section === "ams" && exhibition ? href("/performance/exhibitions/" + exhibition.id, { exhibition: null, cp: null }) : href("/performance", { exhibition: null, cp: null });
  const notStored = view ? view.data.followups.filter(f => !(view.data.rounds || []).some(r => identity(r.brand_id) === identity(f.id))).length : 0;
  const unattributed = view?.opportunities.filter(r => !r.sourceId).length || 0;
  return <TooltipProvider delayDuration={150}><div className="mx-auto max-w-6xl space-y-10 pb-12"><header className="space-y-4">{section && <Link href={back} className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-500 hover:text-primary"><ArrowLeft className="size-4" />{section === "ams" && exhibition ? "Back to " + exhibition.name : "Back to Exhibition Performance"}</Link>}<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex items-center gap-2"><SidebarTrigger className="md:hidden" /><h1 className="text-3xl font-bold tracking-[-0.04em]">{title}</h1></div><DateFilter key={pathname + preset} range={range} preset={preset} change={updates => router.replace(href(pathname, updates), { scroll: false })} /></div>{section === "ams" && exhibition && <div className="flex items-center gap-3 text-sm text-slate-500">{exhibition.name}<Link href={href(pathname, { exhibition: null })} className="underline underline-offset-2">Clear exhibition</Link></div>}</header>
    {state.status === "loading" && !view ? <LoadingPerformance section={section} /> : state.status === "error" ? <Empty><EmptyHeader><EmptyTitle>Performance data is unavailable</EmptyTitle><EmptyDescription>{state.message}</EmptyDescription></EmptyHeader><Button variant="secondary" onClick={refresh}>Try again</Button></Empty> : !validRoute ? <NoData text="Select an exhibition or Account Manager from Exhibition Performance." /> : view && <>
      {state.status === "loading" && <p role="status" className="rounded-lg bg-white/50 px-4 py-3 text-sm text-slate-500">Core performance data is ready. Loading communication statistics…</p>}
      {section === "exhibitions" ? <ExhibitionDetail exhibition={exhibition!} view={view} href={href} cp={cp} /> : section === "ams" ? <AMDetail am={am!} exhibition={exhibition} view={view} href={href} cp={cp} /> : <Overview view={view} href={href} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span>{view.recordedRounds.length} saved Rounds</span>{notStored > 0 && <span>{notStored} current Follow-up records without a saved Round</span>}{unattributed > 0 && <span>{unattributed} tracked opportunities without a primary exhibition</span>}<span>Read {shortDate(view.data.loadedAt)}</span><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw className="mr-1 size-3" />Refresh</Button></div>{view.data.unavailable.map(item => <p key={item} role="status" className="text-xs text-amber-700">{item}</p>)}{view.unresolvedLegacy > 0 && <p className="text-xs text-slate-500">{view.unresolvedLegacy} current Follow-up records have no historical ownership or stage snapshots.</p>}{view.unresolvedStarts > 0 && <p className="text-xs text-slate-500">{view.unresolvedStarts} migrated Rounds have no historical start time. Historical opportunity totals cannot be reconstructed.</p>}
    </>}
  </div></TooltipProvider>;
}
