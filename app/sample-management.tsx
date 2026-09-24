"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Clock3, Copy, ExternalLink, Link2, MousePointerClick, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadMediaFile } from "./message-media";
import { EMPTY_AMAZON_PRODUCT, validHttpUrl, type AmazonSampleProduct } from "@/lib/sample-product";

type SampleType = "DTC" | "Amazon";
type SampleClick = { id: string; clickedAt: string; person: string; role: string; location: string; device: string; referrer: string };
type SampleBrand = { name: string; amazonSampleProduct?: AmazonSampleProduct };

const MOCK_CLICKS: Record<SampleType, SampleClick[]> = {
  DTC: [
    { id: "dtc-1", clickedAt: "2026-09-23T09:42:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Chrome · macOS", referrer: "Email" },
    { id: "dtc-2", clickedAt: "2026-09-22T16:18:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Safari · iPhone", referrer: "Email" },
    { id: "dtc-3", clickedAt: "2026-09-22T11:07:00-04:00", person: "Example contact", role: "Connector", location: "Boston, US", device: "Chrome · Windows", referrer: "WhatsApp" },
    { id: "dtc-4", clickedAt: "2026-09-21T15:31:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Safari · macOS", referrer: "Direct link" },
    { id: "dtc-5", clickedAt: "2026-09-20T08:56:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Chrome · Android", referrer: "Email" },
    { id: "dtc-6", clickedAt: "2026-09-18T17:44:00-04:00", person: "Example contact", role: "Connector", location: "Boston, US", device: "Chrome · Windows", referrer: "Email" },
  ],
  Amazon: [
    { id: "amazon-1", clickedAt: "2026-09-23T12:16:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Safari · iPhone", referrer: "Email" },
    { id: "amazon-2", clickedAt: "2026-09-22T10:03:00-04:00", person: "Example owner", role: "Owner", location: "New York, US", device: "Chrome · macOS", referrer: "Direct link" },
    { id: "amazon-3", clickedAt: "2026-09-20T14:27:00-04:00", person: "Example contact", role: "Connector", location: "Boston, US", device: "Safari · iPhone", referrer: "WhatsApp" },
  ],
};
const formatDate = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
const productComplete = (product: AmazonSampleProduct) => Boolean(product.name.trim() && validHttpUrl(product.url) && validHttpUrl(product.imageUrl));

export function SampleManagementPage({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState<SampleBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState<SampleType | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/brands/${encodeURIComponent(customerId)}`)
      .then(async (response) => {
        const data = await response.json() as { error?: string; brand?: SampleBrand };
        if (!response.ok || !data.brand) throw new Error(data.error || "Unable to load sample details");
        return data.brand;
      })
      .then((value) => { if (active) setBrand(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load sample details"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customerId]);

  const types: SampleType[] = ["DTC", "Amazon"];
  const activeType = selectedType && types.includes(selectedType) ? selectedType : types[0];
  const product = brand?.amazonSampleProduct || EMPTY_AMAZON_PRODUCT;
  const ready = activeType === "DTC" || productComplete(product);
  const clicks = [...MOCK_CLICKS[activeType]].sort((a, b) => Date.parse(b.clickedAt) - Date.parse(a.clickedAt));
  const sampleUrl = !ready ? "" : activeType === "DTC"
    ? `https://sample.fridgechannels.com/dtc/${encodeURIComponent(customerId)}`
    : `https://sample.fridgechannels.com/amazon/${encodeURIComponent(customerId)}?product=${encodeURIComponent(product.url.trim())}`;
  const uniqueVisitors = new Set(clicks.map((item) => item.person)).size;

  const copyLink = async () => {
    if (!sampleUrl) return;
    try {
      await navigator.clipboard.writeText(sampleUrl);
      setCopied(true);
      toast.success("Sample link copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch { toast.error("Unable to copy sample link"); }
  };

  return <div className="mx-auto max-w-5xl text-slate-900">
    <button type="button" onClick={() => router.push(`/customers/${encodeURIComponent(customerId)}`)} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" />Back to brand</button>
    {loading ? <p className="py-8 text-sm text-slate-500">Loading sample details…</p> : error ? <p role="alert" className="py-8 text-sm text-rose-700">{error}</p> : brand ? <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Sample</h1>
      <p className="mt-1 truncate text-sm text-slate-500">{brand.name}</p>
      <div className="mt-6 flex border-b border-slate-200" role="tablist" aria-label="Sample type">
        {types.map((type) => <button key={type} type="button" role="tab" id={`sample-tab-${type}`} aria-selected={activeType === type} aria-controls="sample-panel" onClick={() => { setSelectedType(type); setCopied(false); }} className={`min-h-11 min-w-28 border-b-2 px-5 text-sm font-semibold transition-colors ${activeType === type ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"}`}>{type}</button>)}
      </div>
      <div id="sample-panel" role="tabpanel" aria-labelledby={`sample-tab-${activeType}`}>
        {activeType === "Amazon" ? <AmazonProductEditor customerId={customerId} initialProduct={product} onSaved={(saved) => setBrand((current) => current ? { ...current, amazonSampleProduct: saved } : current)} /> : null}
        <section className="mt-8" aria-label="Sample link">
          <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4 text-violet-600" />Sample link</div>
          {sampleUrl ? <div className="mt-3 flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1 truncate text-sm text-violet-700" title={sampleUrl}>{sampleUrl.replace(/^https?:\/\//, "")}</span><Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => void copyLink()}>{copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}{copied ? "Copied" : "Copy link"}</Button></div> : <p className="mt-3 text-sm text-slate-500">Add the Amazon product name, link, and image to complete this sample link.</p>}
          {sampleUrl ? <p className="mt-1 text-xs text-slate-500">Link preview · mock data</p> : null}
        </section>
        <section className="mt-8 grid grid-cols-3 gap-3 sm:gap-8" aria-label="Click summary">
          <SummaryStat label="Total clicks" value={String(clicks.length)} icon={MousePointerClick} />
          <SummaryStat label="Unique visitors" value={String(uniqueVisitors)} icon={UserRound} />
          <SummaryStat label="Last clicked" value={clicks[0] ? formatDate(clicks[0].clickedAt) : "—"} icon={Clock3} compact />
        </section>
        <section className="mt-10" aria-label="Click activity">
          <div className="flex items-baseline justify-between gap-3"><h2 className="text-lg font-semibold">Click activity</h2><span className="text-xs text-slate-500">Mock data · {clicks.length} records</span></div>
          <ol className="mt-5 space-y-6">{clicks.map((click) => <li key={click.id} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-8"><div className="min-w-0"><span className="block truncate text-sm font-semibold">{click.person}</span><span className="mt-1 block truncate text-xs text-slate-500">{click.role} · {click.location} · {click.device} · {click.referrer}</span></div><time className="text-xs text-slate-500 sm:text-right" dateTime={click.clickedAt}>{formatDate(click.clickedAt)}</time></li>)}</ol>
        </section>
      </div>
    </> : null}
  </div>;
}

function AmazonProductEditor({ customerId, initialProduct, onSaved }: { customerId: string; initialProduct: AmazonSampleProduct; onSaved: (product: AmazonSampleProduct) => void }) {
  const [product, setProduct] = useState<AmazonSampleProduct>(initialProduct);
  const [saved, setSaved] = useState<AmazonSampleProduct>(initialProduct);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = JSON.stringify(product) !== JSON.stringify(saved);
  const update = (key: keyof AmazonSampleProduct, value: string) => setProduct((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/brands/${encodeURIComponent(customerId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amazonSampleProduct: product }) });
      const data = await response.json() as { error?: string; brand?: { amazonSampleProduct?: AmazonSampleProduct } };
      if (!response.ok) throw new Error(data.error || "Unable to save product");
      const next = data.brand?.amazonSampleProduct || product;
      setSaved(next);
      setProduct(next);
      onSaved(next);
      toast.success("Amazon product saved");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save product"); }
    finally { setSaving(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const media = await uploadMediaFile(file, "image"); update("imageUrl", media.url); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Image upload failed"); }
    finally { setUploading(false); }
  };

  return <section className="mt-8" aria-label="Amazon product">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Amazon product</h2><Button size="sm" className="min-h-11" disabled={!dirty || saving || uploading} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Product name<input value={product.name} onChange={(event) => update("name", event.target.value)} className="h-11 rounded-lg bg-white px-3 font-normal outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500" /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Amazon product link<input type="url" value={product.url} onChange={(event) => update("url", event.target.value)} placeholder="https://www.amazon.com/dp/..." className="h-11 rounded-lg bg-white px-3 font-normal outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500" /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Product image URL<input type="url" value={product.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} className="h-11 rounded-lg bg-white px-3 font-normal outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500" /></label>
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center text-sm font-medium text-violet-700 hover:text-violet-900">{uploading ? "Uploading…" : "Upload product image"}<input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])} /></label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">Price <span className="font-normal text-slate-500">(optional)</span><input value={product.price} onChange={(event) => update("price", event.target.value)} placeholder="$29.99" className="h-11 rounded-lg bg-white px-3 font-normal outline-none ring-1 ring-slate-200 focus:ring-2 focus:ring-violet-500" /></label>
    </div>
    {validHttpUrl(product.imageUrl) ? <div className="mt-4 flex min-w-0 items-center gap-4"><Image src={product.imageUrl} alt={product.name || "Amazon product"} width={88} height={88} unoptimized className="size-20 shrink-0 rounded-lg object-contain" /><div className="min-w-0"><p className="truncate text-sm font-medium">{product.name || "Product preview"}</p>{validHttpUrl(product.url) ? <a href={product.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-violet-700">View product <ExternalLink className="size-3" /></a> : null}</div></div> : null}
  </section>;
}

function SummaryStat({ label, value, icon: Icon, compact }: { label: string; value: string; icon: typeof Clock3; compact?: boolean }) {
  return <div className="min-w-0"><div className="flex items-center gap-1 text-[11px] text-slate-500"><Icon className="size-3.5 shrink-0 text-violet-600" /><span className="truncate">{label}</span></div><p className={`mt-2 break-words font-semibold tracking-tight ${compact ? "text-xs leading-5 sm:text-sm" : "text-2xl"}`}>{value}</p></div>;
}
