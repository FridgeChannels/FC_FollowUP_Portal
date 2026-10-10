"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, MailOpen, SmartphoneNfc } from "lucide-react";
import type { SignalEvent } from "@/lib/signals/model";
import { safeSourceUrl } from "@/lib/signals/model";
import type { MagnetBrandParam } from "@/lib/sample/magnet";
import type { AmazonSampleProduct, ChannelType } from "@/lib/sample-product";
import { ChannelIcon } from "./channel-icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const date = (value: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

export function BrandProfileFields({
  profiles, channelType, amazon,
}: {
  profiles: Array<{ sn: string; profile: MagnetBrandParam | null }>;
  channelType: ChannelType;
  amazon?: AmazonSampleProduct;
}) {
  const dtc = profiles.find((item) => item.profile?.experience === "dtc")?.profile;
  const amazonProfile = profiles.find((item) => item.profile?.experience === "asin_plus")?.profile;
  const showDtc = channelType === "DTC" || channelType === "DTC&Amazon";
  const showAmazon = channelType === "Amazon" || channelType === "DTC&Amazon";
  const fields: Array<[string, string | null | undefined]> = [
    ...(showDtc ? [
      ["Website", dtc?.website], ["Store website", dtc?.storeWebsite],
    ] as Array<[string, string | null | undefined]> : []),
    ...(showAmazon ? [
      ["Product", amazonProfile?.productName || amazon?.name],
      ["Price", amazon?.price],
      ["Amazon product", amazonProfile?.amazonAsinUrl || amazon?.url],
      ["Amazon store", amazonProfile?.amazonFrontstore],
      ["Discount", amazonProfile?.discountBenefit],
    ] as Array<[string, string | null | undefined]> : []),
  ].filter(([, value]) => !!value?.trim());
  if (!fields.length) return null;
  return <dl className="mt-3 space-y-1.5 text-xs">
    {fields.map(([label, value]) => <div key={label} className="flex min-w-0 gap-2">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-800">{safeSourceUrl(value) ? <a href={value!} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-0.5 break-all text-violet-700 hover:underline">{value}<ExternalLink className="size-3 shrink-0" /></a> : value}</dd>
    </div>)}
  </dl>;
}

export function SampleActivity({
  events, hasSample, readIds, initialOpen = false, onRead,
}: {
  events: SignalEvent[];
  hasSample: boolean;
  readIds: string[];
  initialOpen?: boolean;
  onRead: (ids: string[]) => void;
}) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? initialOpen;
  const [limit, setLimit] = useState(5);
  if (!hasSample && !events.length) return null;
  const visits = [...new Map(events.map((event) => [event.id, event])).values()]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const unread = visits.some((event) => !readIds.includes(event.id));
  return <section id="brand-sample-activity" className="border-t border-slate-100 py-4" aria-label="Sample activity">
    <h4 className="text-xs font-semibold text-slate-500">Sample activity</h4>
    {visits.length ? <>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-800">
        <SmartphoneNfc className="size-4 text-[#7C3AED]" aria-hidden="true" />
        <strong>{visits.length} sample visit{visits.length === 1 ? "" : "s"}</strong>
        <span className="text-slate-500">· Last activity {date(visits[0].occurredAt)}</span>
        {unread ? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#7C3AED]">New</span> : null}
      </p>
      <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900" aria-expanded={open} onClick={() => { setOpenOverride(!open); if (!open && unread) onRead(visits.map((item) => item.id)); }}>
        Visit history <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="mt-2 space-y-1.5">
        {visits.slice(0, limit).map((event) => <p key={event.id} className="text-xs text-slate-600">
          <time dateTime={event.occurredAt}>{date(event.occurredAt)}</time> · Sample {event.sampleId || "visit"} accessed
        </p>)}
        {limit < visits.length ? <button type="button" className="text-xs font-medium text-violet-700 hover:underline" onClick={() => setLimit(limit + 5)}>Load more</button> : null}
      </div> : null}
    </> : <p className="mt-2 text-sm text-slate-500">No activity yet</p>}
  </section>;
}

export function ImportantSignalsPanel({
  events, readIds, brandName, ownerName, activeSignalId, onOpenSignal, onRead, onOpenEmailSignal,
}: {
  events: SignalEvent[];
  readIds: string[];
  brandName?: string;
  ownerName?: string | null;
  /** Keeps one just-opened signal stable while its details are being read. */
  activeSignalId?: string | null;
  onOpenSignal?: (event: SignalEvent) => void;
  /** @deprecated Parents can pass onOpenSignal for coordinated detail panels. */
  onRead?: (ids: string[]) => void;
  onOpenEmailSignal?: (event: SignalEvent) => void;
}) {
  const [localActiveSignalId, setLocalActiveSignalId] = useState<string | null>(null);
  const viewingSignalId = activeSignalId ?? localActiveSignalId;
  const openSignal = (event: SignalEvent) => {
    const readId = event.signalReadId || event.id;
    setLocalActiveSignalId(readId);
    onRead?.([readId]);
    onOpenSignal?.(event);
    if (event.type === "email") onOpenEmailSignal?.(event);
  };
  const groups = new Map<string, SignalEvent[]>();
  for (const event of [...new Map(events.map((item) => [item.id, item])).values()]) {
    const key = event.signalKey || event.id;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  const notifications = [...groups.entries()]
    .map(([key, groupedEvents]) => ({
      key,
      events: groupedEvents.sort((a, b) => Date.parse(b.detectedAt || b.occurredAt) - Date.parse(a.detectedAt || a.occurredAt)),
    }))
    .filter(({ events: groupedEvents }) => {
      const readId = groupedEvents[0]?.signalReadId || groupedEvents[0]?.id;
      return Boolean(readId && (!readIds.includes(readId) || readId === viewingSignalId));
    })
    .sort((a, b) => Date.parse(b.events[0].detectedAt || b.events[0].occurredAt) - Date.parse(a.events[0].detectedAt || a.events[0].occurredAt));

  if (!notifications.length) return null;
  return <section id="brand-important-signals" aria-label="Brand signals" className="mx-5 mt-4 pb-1">
    <div className="mb-1 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-900">New Signals</h2>
      <span className="text-xs text-slate-500">{notifications.length} signal{notifications.length === 1 ? "" : "s"}</span>
    </div>
    <div>
      {notifications.map(({ key, events: groupedEvents }) => {
        const latest = groupedEvents[0];
        const readId = latest.signalReadId || latest.id;
        const isNew = !readIds.includes(readId);
        const isEmail = latest.type === "email";
        const title = latest.type === "sample"
          ? `Sample ${latest.sampleId || ""} visited ${groupedEvents.length} time${groupedEvents.length === 1 ? "" : "s"}`
          : isEmail
            ? `${latest.subject && latest.subject !== "Subject unavailable" ? latest.subject : "Email"} · ${groupedEvents.length} open${groupedEvents.length === 1 ? "" : "s"} detected`
            : latest.summary;
        const timestamp = latest.type === "email" ? latest.detectedAt : latest.type === "linkedin" ? latest.publishedAt || latest.occurredAt : latest.occurredAt;
        const timeLabel = latest.type === "sample" ? "Last activity" : latest.type === "email" ? "Last detected" : "Published";
        const icon = latest.type === "email"
          ? <MailOpen className="size-4 text-[#B45309]" aria-hidden="true" />
          : latest.type === "sample"
            ? <SmartphoneNfc className="size-4 text-[#7C3AED]" aria-hidden="true" />
            : <ChannelIcon channel="LinkedIn" className="size-4" alt="" />;
        const source = safeSourceUrl(latest.sourceUrl);
        return <article key={key} className="min-w-0 py-3">
          <button type="button" className="flex w-full min-w-0 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" onClick={() => openSignal(latest)}>
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-slate-800">{title}</p>
              <p className="mt-1 text-xs text-slate-500"><span>{timeLabel} {date(timestamp)}</span>{source ? <> · <span className="text-violet-700">View details</span></> : null}</p>
              {latest.type === "sample" && (latest.tapLocation || latest.tapDevice) ? <p className="mt-1 truncate text-xs text-slate-500">{[latest.tapDevice, latest.tapLocation].filter(Boolean).join(" · ")}</p> : null}
            </div>
            {isNew ? <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">New</span> : null}
          </button>
          {viewingSignalId === readId && latest.type === "sample" ? <SampleTapDetails event={latest} brandName={brandName} ownerName={ownerName} className="ml-8 mt-3" /> : null}
        </article>;
      })}
    </div>
  </section>;
}

const signalHistoryTime = (event: SignalEvent) => event.type === "email"
  ? event.detectedAt
  : event.type === "linkedin"
    ? event.publishedAt || event.occurredAt
    : event.occurredAt;

function SignalHistoryType({ type }: { type: SignalEvent["type"] }) {
  if (type === "sample") return <span className="inline-flex items-center gap-1 text-xs font-medium text-[#7C3AED]"><SmartphoneNfc className="size-3.5" aria-hidden="true" />Sample Tap</span>;
  if (type === "email") return <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B45309]"><MailOpen className="size-3.5" aria-hidden="true" />Email Open</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-[#0A66C2]"><ChannelIcon channel="LinkedIn" className="size-3.5" alt="" />LinkedIn</span>;
}

export function SampleTapDetails({
  event, brandName, ownerName, className = "",
}: {
  event: SignalEvent;
  brandName?: string;
  ownerName?: string | null;
  className?: string;
}) {
  if (event.type !== "sample") return null;
  const source = safeSourceUrl(event.sourceUrl);
  const rows = [
    ["Brand", brandName || event.tapBrandName],
    ["Owner", ownerName || event.tapOwnerName],
    ["SN", event.sampleId],
    ["Location", event.tapLocation],
    ["Device", event.tapDevice],
  ].filter(([, value]) => Boolean(value));
  if (!rows.length && !source) return null;
  return <dl aria-label="Sample tap details" className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs leading-5 ${className}`}>
    {rows.map(([label, value]) => <div key={label} className="contents">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-slate-700" title={value}>{value}</dd>
    </div>)}
    {source ? <div className="contents">
      <dt className="text-slate-500">URL</dt>
      <dd className="min-w-0 truncate"><a href={source} target="_blank" rel="noreferrer" className="text-violet-700 hover:underline" title={source}>{source.replace(/^https?:\/\//, "")}</a></dd>
    </div> : null}
  </dl>;
}

export function SignalHistoryPanel({ events, readIds, brandName, ownerName, activeSignalId, onOpenSignal }: {
  events: SignalEvent[];
  readIds: string[];
  brandName?: string;
  ownerName?: string | null;
  activeSignalId?: string | null;
  onOpenSignal?: (event: SignalEvent) => void;
}) {
  const [type, setType] = useState<"all" | SignalEvent["type"]>("all");
  const allRecords = [...new Map(events.map((event) => [event.id, event])).values()]
    .sort((left, right) => Date.parse(signalHistoryTime(right)) - Date.parse(signalHistoryTime(left)));
  const records = allRecords.filter((event) => type === "all" || event.type === type);
  if (!allRecords.length) return <p className="text-sm text-slate-500">No signal history yet.</p>;
  return <div className="min-w-0">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-slate-500">{records.length} record{records.length === 1 ? "" : "s"}</p>
      <Select value={type} onValueChange={(value) => setType(value as "all" | SignalEvent["type"])}>
        <SelectTrigger aria-label="Signal history type" size="sm" className="h-9 w-32 border-0 bg-slate-50 px-2.5 shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="sample">Sample Tap</SelectItem>
          <SelectItem value="email">Email Open</SelectItem>
          <SelectItem value="linkedin">LinkedIn</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {records.length ? <div className="mt-3 divide-y divide-slate-100">
      {records.map((event) => {
        const occurredAt = signalHistoryTime(event);
        const source = safeSourceUrl(event.sourceUrl);
        const readId = event.signalReadId || event.id;
        const read = readIds.includes(readId);
        return <article key={event.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <SignalHistoryType type={event.type} />
            <time dateTime={occurredAt} className="shrink-0 text-[11px] text-slate-500">{date(occurredAt)}</time>
          </div>
          {event.type === "linkedin" ? <p className="mt-1.5 text-sm leading-5 text-slate-800">{event.summary}</p> : null}
          {event.type !== "sample" ? <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{read ? "Read" : "New"}</span>
            {event.type === "email" && event.subject ? <span className="truncate">{event.subject}</span> : null}
          </div> : null}
          {(event.evidence || source || event.type === "linkedin" || event.type === "sample") ? <details className="mt-2 text-xs text-slate-500" open={activeSignalId === event.id} onToggle={(toggle) => {
            if (toggle.currentTarget.open) onOpenSignal?.(event);
          }}>
            <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">Details</summary>
            <div className="mt-2 space-y-1.5 leading-5">
              {event.type === "sample" ? <SampleTapDetails event={event} brandName={brandName} ownerName={ownerName} /> : null}
              {event.type !== "sample" && event.evidence ? <p>{event.evidence}</p> : null}
              {event.type === "linkedin" ? <p>Detected {date(event.detectedAt)}</p> : null}
              {event.type !== "sample" && source ? <a href={source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-violet-700 hover:underline">View source <ExternalLink className="size-3" /></a> : null}
            </div>
          </details> : null}
        </article>;
      })}
    </div> : <p className="mt-5 text-sm text-slate-500">No {type === "all" ? "signal" : type === "sample" ? "Sample Tap" : type === "email" ? "Email Open" : "LinkedIn"} history yet.</p>}
  </div>;
}

export function EmailSignalUpdates({ events, readIds, onRead, onOpen }: {
  events: SignalEvent[];
  readIds: string[];
  onRead: (ids: string[]) => void;
  onOpen?: (event: SignalEvent) => void;
}) {
  if (!events.length) return null;
  const grouped = new Map<string, SignalEvent[]>();
  for (const event of events) {
    const key = event.conversationId || event.messageId || event.id;
    grouped.set(key, [...(grouped.get(key) || []), event]);
  }
  const groups = [...grouped.values()]
    .map((group) => ({
      latest: group.reduce((current, event) => Date.parse(event.detectedAt) > Date.parse(current.detectedAt) ? event : current),
      events: group,
    }))
    .sort((a, b) => Date.parse(b.latest.detectedAt) - Date.parse(a.latest.detectedAt));
  return <section id="brand-email-signals" className="border-t border-slate-100 py-4" aria-label="Email signals">
    <h4 className="text-xs font-semibold text-slate-500">Email signals</h4>
    <div className="mt-2 space-y-3">
      {groups.map(({ latest, events: group }) => {
        const unread = group.some((event) => !readIds.includes(event.id));
        return <button
          key={latest.conversationId || latest.messageId || latest.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/55 px-3 py-2.5 text-left transition-colors hover:bg-amber-100/70"
          onClick={() => { onRead(group.map((event) => event.id)); onOpen?.(latest); }}
        >
            <MailOpen className="mt-0.5 size-4 shrink-0 text-[#B45309]" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-800">Email opened</span>
            <time dateTime={latest.detectedAt} className="min-w-0 flex-1 text-xs text-slate-600">{date(latest.detectedAt)}</time>
            {unread ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#B45309]">New</span> : null}
        </button>;
      })}
    </div>
  </section>;
}

export function LinkedInUpdates({
  events, readIds, onRead, id,
}: {
  events: SignalEvent[];
  readIds: string[];
  onRead: (ids: string[]) => void;
  id?: string;
}) {
  const [all, setAll] = useState(true);
  if (!events.length) return null;
  const seen = new Set<string>();
  const updates = [...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .filter((event) => {
      const key = `${event.contactId || "brand"}:${event.publishedAt || event.occurredAt}:${event.summary.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return <section id={id} className="border-t border-slate-100 py-4" aria-label="LinkedIn updates">
    <h4 className="text-xs font-semibold text-slate-500">LinkedIn updates</h4>
    <div className="mt-2 space-y-3">
      {(all ? updates : updates.slice(0, 1)).map((event) => <article key={event.id}>
        <p className="flex items-start gap-1.5 text-sm text-slate-800">
          <ChannelIcon channel="LinkedIn" className="mt-0.5 size-4 shrink-0" alt="" />
          <span>{event.summary}</span>
          {!readIds.includes(event.id) ? <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0A66C2]">New</span> : null}
        </p>
        <p className="mt-1 pl-5 text-xs text-slate-500">Published {date(event.publishedAt || event.occurredAt)} · Detected {date(event.detectedAt)}
          {safeSourceUrl(event.sourceUrl) ? <> · <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[#0A66C2] hover:underline" onClick={() => onRead([event.id])}>View source <ExternalLink className="size-3" /></a></> : null}
        </p>
      </article>)}
    </div>
    {updates.length > 1 ? <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900" aria-expanded={all} onClick={() => { setAll(!all); if (!all) onRead(updates.map((event) => event.id)); }}>{all ? "Show less" : "View all"} <ChevronDown className={`size-3.5 transition-transform ${all ? "rotate-180" : ""}`} /></button> : null}
  </section>;
}

export function EmailOpenActivity({ events, readIds, expanded, onRead }: {
  events: SignalEvent[];
  readIds: string[];
  expanded: boolean;
  onRead: (ids: string[]) => void;
}) {
  if (!events.length) return null;
  const opens = [...new Map(events.map((event) => [event.id, event])).values()]
    .sort((a, b) => Date.parse(a.detectedAt) - Date.parse(b.detectedAt));
  const unread = opens.some((event) => !readIds.includes(event.id));
  return <section aria-label="Email open signal" className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs">
    <p className="flex flex-wrap items-center gap-1.5 text-[#92400E]">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold"><MailOpen className="size-3" aria-hidden="true" />Email open signal</span>
      <span>Email opened {opens.length} time{opens.length === 1 ? "" : "s"}</span>
      <span className="text-amber-800/70">·</span>
      <time dateTime={opens.at(-1)!.detectedAt}>Last opened {date(opens.at(-1)!.detectedAt)}</time>
      {unread ? <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold">New</span> : null}
    </p>
    {expanded && opens.length > 1 ? <details className="mt-2 text-slate-600" onToggle={(event) => { if (event.currentTarget.open && unread) onRead(opens.map((item) => item.id)); }}><summary className="cursor-pointer text-xs font-medium text-[#92400E]">Open history</summary><ul className="mt-1 space-y-1">{[...opens].reverse().map((event) => <li key={event.id}><time dateTime={event.detectedAt}>{date(event.detectedAt)}</time></li>)}</ul></details> : null}
  </section>;
}
