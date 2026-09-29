"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, Copy, ExternalLink, Loader2, MousePointerClick, UserRound } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadMediaFile } from "./message-media";
import { EMPTY_AMAZON_PRODUCT, validHttpUrl, type AmazonSampleProduct } from "@/lib/sample-product";

type SampleType = "DTC" | "Amazon";
type MagnetParam = {
  magnetSn?: string;
  experience?: "dtc" | "asin_plus" | null;
  brandName?: string | null;
  brandLogo?: string | null;
  website?: string | null;
  storeWebsite?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  productName?: string | null;
  productImageUrl?: string | null;
  amazonAsinUrl?: string | null;
  amazonFrontstore?: string | null;
  discountBenefit?: string | null;
  discountClaimCode?: string | null;
  discountAsin?: string | null;
};
type ExperienceFormState = {
  brandName: string;
  brandLogo: string;
  website: string;
  storeWebsite: string;
  primaryColor: string;
  secondaryColor: string;
  productName: string;
  productImageUrl: string;
  amazonAsinUrl: string;
  amazonFrontstore: string;
  discountBenefit: string;
  discountClaimCode: string;
  discountAsin: string;
  price: string;
};
type SampleClick = {
  id: string;
  sn?: string;
  clickedAt: string;
  person: string;
  role: string;
  location: string;
  device: string;
  referrer: string;
  isInternal?: boolean;
  deviceId?: string | null;
  experience?: "dtc" | "asin_plus" | null;
  sampleType?: SampleType | null;
};
type SampleSummary = {
  totalClicks: number;
  uniqueVisitors: number;
  lastClickedAt: string | null;
};
type SampleMagnetSummary = {
  sn: string;
  sampleUrl?: string | null;
  pathname?: string | null;
  configuredExperience?: "dtc" | "asin_plus" | null;
  defaultSampleType?: SampleType | null;
  magnetParam?: MagnetParam | null;
};
type SampleBrand = { name: string; amazonSampleProduct?: AmazonSampleProduct; nfcCardSn?: string | null };
type SamplePayload = {
  error?: string;
  nfcCardSn?: string | null;
  nfcCardSns?: string[];
  samples?: SampleMagnetSummary[];
  brandName?: string | null;
  sampleUrl?: string | null;
  configuredExperience?: "dtc" | "asin_plus" | null;
  defaultSampleType?: SampleType | null;
  magnetParam?: MagnetParam | null;
  posthogConfigured?: boolean;
  unreadNotifications?: number;
  sync?: {
    skipped?: boolean;
    scheduled?: boolean;
    reason?: string;
    sn?: string | null;
  } | null;
  summary?: SampleSummary | null;
  summaryByType?: {
    DTC?: SampleSummary;
    Amazon?: SampleSummary;
    Unknown?: SampleSummary;
  } | null;
  clicks?: SampleClick[];
};

function experienceLabel(value: "dtc" | "asin_plus" | null | undefined) {
  if (value === "asin_plus") return "Amazon";
  if (value === "dtc") return "DTC";
  return null;
}

const EMPTY_EXPERIENCE_FORM: ExperienceFormState = {
  brandName: "",
  brandLogo: "",
  website: "",
  storeWebsite: "",
  primaryColor: "",
  secondaryColor: "",
  productName: "",
  productImageUrl: "",
  amazonAsinUrl: "",
  amazonFrontstore: "",
  discountBenefit: "",
  discountClaimCode: "",
  discountAsin: "",
  price: "",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));

function buildExperienceForm(
  param: MagnetParam | null | undefined,
  brand: SampleBrand | null,
): ExperienceFormState {
  const amazon = brand?.amazonSampleProduct || EMPTY_AMAZON_PRODUCT;
  return {
    brandName: param?.brandName || brand?.name || "",
    brandLogo: param?.brandLogo || "",
    website: param?.website || "",
    storeWebsite: param?.storeWebsite || "",
    primaryColor: param?.primaryColor || "",
    secondaryColor: param?.secondaryColor || "",
    productName: param?.productName || amazon.name || "",
    productImageUrl: param?.productImageUrl || amazon.imageUrl || "",
    amazonAsinUrl: param?.amazonAsinUrl || amazon.url || "",
    amazonFrontstore: param?.amazonFrontstore || "",
    discountBenefit: param?.discountBenefit || "",
    discountClaimCode: param?.discountClaimCode || "",
    discountAsin: param?.discountAsin || "",
    price: amazon.price || "",
  };
}

function validateExperienceForm(target: SampleType, form: ExperienceFormState): string | null {
  if (!form.brandName.trim()) return "Brand name is required";
  if (target === "DTC") {
    if (!form.website.trim()) return "Brand website is required";
    if (!validHttpUrl(form.website)) return "Enter a valid brand website URL";
    if (form.brandLogo.trim() && !validHttpUrl(form.brandLogo)) {
      return "Enter a valid brand logo URL";
    }
    if (form.storeWebsite.trim() && !validHttpUrl(form.storeWebsite)) {
      return "Enter a valid store website URL";
    }
    return null;
  }
  if (!form.productName.trim()) return "Product name is required";
  if (!form.amazonAsinUrl.trim()) return "Amazon product URL is required";
  if (!validHttpUrl(form.amazonAsinUrl)) return "Enter a valid Amazon product URL";
  if (!form.productImageUrl.trim()) return "Product image URL is required";
  if (!validHttpUrl(form.productImageUrl)) return "Enter a valid product image URL";
  if (form.amazonFrontstore.trim() && !validHttpUrl(form.amazonFrontstore)) {
    return "Enter a valid Amazon brand store URL";
  }
  if (form.brandLogo.trim() && !validHttpUrl(form.brandLogo)) {
    return "Enter a valid brand logo URL";
  }
  return null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
        {hint ? <span className="font-normal text-slate-500"> {hint}</span> : null}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg bg-slate-50 px-3 text-sm font-normal outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500"
      />
    </label>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const hex = value.trim();
  const previewable = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>
        {label}
        {hint ? <span className="font-normal text-slate-500"> {hint}</span> : null}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg bg-slate-50 px-3 text-sm font-normal outline-none ring-1 ring-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500"
        />
        <span
          className="size-10 shrink-0 rounded-lg border border-slate-200"
          style={{ backgroundColor: previewable ? hex : "#f8fafc" }}
          title={previewable ? hex : "No color"}
          aria-hidden
        />
      </div>
    </label>
  );
}

function ImageUrlField({
  label,
  hint,
  required,
  value,
  onChange,
  placeholder,
  alt,
  uploading,
  uploadLabel,
  onUpload,
  disabled,
  footer,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  alt: string;
  uploading: boolean;
  uploadLabel: string;
  onUpload: (file: File | undefined) => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const previewable = validHttpUrl(value);
  return (
    <div className="grid gap-2">
      <Field
        label={label}
        type="url"
        hint={hint}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <div className="flex items-center gap-3">
        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {previewable ? (
            <Image
              src={value}
              alt={alt}
              width={56}
              height={56}
              unoptimized
              className="size-full object-contain p-1"
            />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-slate-400">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-8 cursor-pointer items-center text-xs font-medium text-violet-700 hover:text-violet-900">
              {uploading ? "Uploading…" : uploadLabel}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={disabled || uploading}
                onChange={(event) => {
                  onUpload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {previewable ? (
              <button
                type="button"
                className="inline-flex min-h-8 items-center text-xs font-medium text-slate-500 hover:text-rose-700 disabled:opacity-50"
                disabled={disabled || uploading}
                onClick={() => onChange("")}
              >
                Remove
              </button>
            ) : null}
          </div>
          {footer}
        </div>
      </div>
    </div>
  );
}

export function SampleManagementPage({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [brand, setBrand] = useState<SampleBrand | null>(null);
  const [sample, setSample] = useState<SamplePayload | null>(null);
  const [brandLoading, setBrandLoading] = useState(true);
  const [sampleLoading, setSampleLoading] = useState(true);
  const [syncRefreshing, setSyncRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState<SampleType | null>(null);
  const [copied, setCopied] = useState(false);
  const [experienceFormOpen, setExperienceFormOpen] = useState(false);
  const [experienceTarget, setExperienceTarget] = useState<SampleType>("DTC");
  const [experienceForm, setExperienceForm] = useState<ExperienceFormState>(EMPTY_EXPERIENCE_FORM);
  const [experienceSaving, setExperienceSaving] = useState(false);
  const [experienceFormError, setExperienceFormError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [markingDeviceId, setMarkingDeviceId] = useState<string | null>(null);
  const [extractingColors, setExtractingColors] = useState(false);
  const [snSwitching, setSnSwitching] = useState(false);
  const [pendingSn, setPendingSn] = useState<string | null>(null);

  const fetchSamplePayload = async (sn?: string | null) => {
    const query = sn ? `?sn=${encodeURIComponent(sn)}` : "";
    const response = await fetch(
      `/api/brands/${encodeURIComponent(customerId)}/sample${query}`,
    );
    const data = (await response.json()) as SamplePayload;
    if (!response.ok && response.status !== 503) {
      throw new Error(data.error || "Unable to load sample activity");
    }
    return data;
  };

  useEffect(() => {
    let active = true;
    setBrandLoading(true);
    setSampleLoading(true);
    setSyncRefreshing(false);
    setError("");
    setBrand(null);
    setSample(null);

    fetch(`/api/brands/${encodeURIComponent(customerId)}`)
      .then(async (response) => {
        const data = (await response.json()) as { error?: string; brand?: SampleBrand };
        if (!response.ok || !data.brand) throw new Error(data.error || "Unable to load brand");
        return data.brand;
      })
      .then((brandValue) => {
        if (!active) return;
        setBrand(brandValue);
      })
      .catch((cause) => {
        if (!active) return;
        // Sample payload can still render without brand metadata.
        console.error(cause);
      })
      .finally(() => {
        if (active) setBrandLoading(false);
      });

    const loadSample = async () => {
      const data = await fetchSamplePayload();
      if (!active) return data;
      setSample(data);
      if (data.defaultSampleType === "DTC" || data.defaultSampleType === "Amazon") {
        setSelectedType(data.defaultSampleType);
      }
      setSampleLoading(false);

      if (data.sync?.scheduled) {
        setSyncRefreshing(true);
        // Background PostHog sync was scheduled; soft-refresh a few times.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          if (!active) return data;
          try {
            const next = await fetchSamplePayload(data.nfcCardSn);
            if (!active) return data;
            setSample(next);
            if (next.defaultSampleType === "DTC" || next.defaultSampleType === "Amazon") {
              setSelectedType(next.defaultSampleType);
            }
            if (!next.sync?.scheduled) break;
          } catch {
            // keep last good payload
          }
        }
        if (active) setSyncRefreshing(false);
      }
      return data;
    };

    void loadSample().catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Unable to load sample activity");
      setSampleLoading(false);
      setSyncRefreshing(false);
    });

    return () => {
      active = false;
    };
  }, [customerId]);

  const types: SampleType[] = ["DTC", "Amazon"];
  const activeType =
    selectedType && types.includes(selectedType)
      ? selectedType
      : sample?.defaultSampleType && types.includes(sample.defaultSampleType)
        ? sample.defaultSampleType
        : types[0];
  const nfcCardSns =
    sample?.nfcCardSns?.length
      ? sample.nfcCardSns
      : sample?.nfcCardSn
        ? [sample.nfcCardSn]
        : brand?.nfcCardSn
          ? [brand.nfcCardSn]
          : [];
  const nfcCardSn = sample?.nfcCardSn || nfcCardSns[0] || null;
  const sampleUrl = sample?.sampleUrl || "";
  const configuredLabel = experienceLabel(sample?.configuredExperience);
  const clicks = [...(sample?.clicks || [])]
    .filter((item) => item.sampleType === activeType && !item.isInternal)
    .sort((a, b) => Date.parse(b.clickedAt) - Date.parse(a.clickedAt));
  const summary = {
    totalClicks: clicks.length,
    uniqueVisitors: new Set(clicks.map((item) => item.deviceId || item.person).filter(Boolean)).size,
    lastClickedAt: clicks[0]?.clickedAt || null,
  };

  const selectSn = async (nextSn: string) => {
    if (!nextSn || nextSn === nfcCardSn || snSwitching) return;
    setPendingSn(nextSn);
    setSnSwitching(true);
    setSyncRefreshing(false);
    try {
      const data = await fetchSamplePayload(nextSn);
      setSample(data);
      setPendingSn(null);
      if (data.defaultSampleType === "DTC" || data.defaultSampleType === "Amazon") {
        setSelectedType(data.defaultSampleType);
      } else {
        setSelectedType(null);
      }
      setSnSwitching(false);
      if (data.sync?.scheduled) {
        setSyncRefreshing(true);
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500));
          try {
            const next = await fetchSamplePayload(nextSn);
            setSample(next);
            if (next.defaultSampleType === "DTC" || next.defaultSampleType === "Amazon") {
              setSelectedType(next.defaultSampleType);
            }
            if (!next.sync?.scheduled) break;
          } catch {
            break;
          }
        }
        setSyncRefreshing(false);
      }
    } catch (cause) {
      setPendingSn(null);
      setSnSwitching(false);
      toast.error(cause instanceof Error ? cause.message : "Unable to switch magnet");
    }
  };

  const copyLink = async () => {
    if (!sampleUrl) return;
    try {
      await navigator.clipboard.writeText(sampleUrl);
      setCopied(true);
      toast.success("Sample link copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Unable to copy sample link");
    }
  };

  const setDeviceInternal = async (deviceId: string, nextInternal: boolean) => {
    const id = deviceId.trim();
    if (!id) {
      toast.error("This click has no device id");
      return;
    }
    setMarkingDeviceId(id);
    try {
      const response = await fetch(
        `/api/brands/${encodeURIComponent(customerId)}/sample/internal-devices${
          nextInternal ? "" : `?deviceId=${encodeURIComponent(id)}`
        }`,
        {
          method: nextInternal ? "POST" : "DELETE",
          headers: nextInternal ? { "Content-Type": "application/json" } : undefined,
          body: nextInternal ? JSON.stringify({ deviceId: id }) : undefined,
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update internal device");
      setSample((current) => {
        if (!current?.clicks) return current;
        return {
          ...current,
          clicks: current.clicks.map((click) =>
            click.deviceId === id ? { ...click, isInternal: nextInternal } : click,
          ),
        };
      });
      toast.success(nextInternal ? "Marked as internal device" : "Removed internal mark");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to update internal device");
    } finally {
      setMarkingDeviceId(null);
    }
  };

  const openExperienceForm = (nextType: SampleType) => {
    if (!nfcCardSn || !sample) return;
    setExperienceTarget(nextType);
    setExperienceForm(buildExperienceForm(sample.magnetParam, brand));
    setExperienceFormError("");
    setExperienceFormOpen(true);
  };

  const updateExperienceField = <K extends keyof ExperienceFormState>(
    key: K,
    value: ExperienceFormState[K],
  ) => {
    setExperienceForm((current) => ({ ...current, [key]: value }));
    if (experienceFormError) setExperienceFormError("");
  };

  const uploadExperienceImage = async (
    file: File | undefined,
    field: "brandLogo" | "productImageUrl",
  ) => {
    if (!file) return;
    const setUploading = field === "brandLogo" ? setLogoUploading : setProductImageUploading;
    setUploading(true);
    try {
      const media = await uploadMediaFile(file, "image");
      updateExperienceField(field, media.url);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const extractBrandColors = async () => {
    const website = experienceForm.website.trim();
    if (!validHttpUrl(website)) {
      toast.error("Enter a valid brand website URL first");
      return;
    }
    setExtractingColors(true);
    try {
      const response = await fetch("/api/brand-colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website, format: "fc" }),
      });
      const payload = (await response.json()) as {
        error?: string;
        primaryColor?: string | null;
        secondaryColor?: string | null;
        brandName?: string | null;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to extract brand colors");
      setExperienceForm((current) => ({
        ...current,
        primaryColor: payload.primaryColor || current.primaryColor,
        secondaryColor: payload.secondaryColor || current.secondaryColor,
        brandName:
          !current.brandName.trim() && payload.brandName
            ? payload.brandName
            : current.brandName,
      }));
      toast.success("Brand colors extracted");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to extract brand colors");
    } finally {
      setExtractingColors(false);
    }
  };

  const saveExperienceForm = async () => {
    if (!nfcCardSn || experienceSaving) return;
    const validationError = validateExperienceForm(experienceTarget, experienceForm);
    if (validationError) {
      setExperienceFormError(validationError);
      toast.error(validationError);
      return;
    }
    setExperienceFormError("");
    setExperienceSaving(true);
    try {
      const response = await fetch(`/api/brands/${encodeURIComponent(customerId)}/sample`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sn: nfcCardSn,
          sampleType: experienceTarget,
          ...experienceForm,
        }),
      });
      const data = (await response.json()) as SamplePayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to save experience");
      setSample((current) => {
        if (!current) return current;
        const samples = (current.samples || []).map((item) =>
          item.sn === nfcCardSn
            ? {
                ...item,
                configuredExperience:
                  data.configuredExperience ?? item.configuredExperience,
                defaultSampleType: data.defaultSampleType ?? experienceTarget,
                magnetParam: data.magnetParam ?? item.magnetParam,
              }
            : item,
        );
        return {
          ...current,
          configuredExperience: data.configuredExperience ?? current.configuredExperience,
          defaultSampleType: data.defaultSampleType ?? experienceTarget,
          magnetParam: data.magnetParam ?? current.magnetParam,
          samples,
        };
      });
      if (experienceTarget === "Amazon") {
        setBrand((current) =>
          current
            ? {
                ...current,
                amazonSampleProduct: {
                  name: experienceForm.productName,
                  url: experienceForm.amazonAsinUrl,
                  imageUrl: experienceForm.productImageUrl,
                  price: experienceForm.price,
                },
              }
            : current,
        );
      }
      setSelectedType(experienceTarget);
      setExperienceFormOpen(false);
      toast.success(`Experience saved as ${experienceTarget}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to save experience");
    } finally {
      setExperienceSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl text-slate-900">
      <button
        type="button"
        onClick={() => router.replace(`/customers/${encodeURIComponent(customerId)}`)}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Brand
      </button>
      {error ? (
        <p role="alert" className="py-8 text-sm text-rose-700">
          {error}
        </p>
      ) : (
        <>
          <div className="flex border-b border-slate-200" role="tablist" aria-label="Sample type">
            {types.map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                id={`sample-tab-${type}`}
                aria-selected={activeType === type}
                aria-controls="sample-panel"
                onClick={() => {
                  setSelectedType(type);
                  setCopied(false);
                }}
                className={`min-h-11 min-w-28 border-b-2 px-5 text-sm font-semibold transition-colors ${
                  activeType === type
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <div id="sample-panel" role="tabpanel" aria-labelledby={`sample-tab-${activeType}`}>
            {sampleLoading ? (
              <p className="mt-6 text-sm text-slate-500">Loading sample activity…</p>
            ) : sample ? (
              <>
            {(sample.unreadNotifications || 0) > 0 ? (
              <p className="mt-6 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
                {sample.unreadNotifications} new external sample tap
                {(sample.unreadNotifications || 0) === 1 ? "" : "s"} since last review.
              </p>
            ) : null}
            {syncRefreshing ? (
              <p className="mt-4 text-xs text-slate-500">Refreshing taps in the background…</p>
            ) : null}
            <section className="mt-8 border-b border-slate-200 pb-6" aria-label="Sample magnet">
              {nfcCardSns.length > 1 ? (
                <div>
                  <p className="text-xs text-slate-500">
                    {nfcCardSns.length} magnets on this ClientDB — pick one to configure.
                  </p>
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    role="tablist"
                    aria-label="NFC Card SN"
                  >
                    {nfcCardSns.map((sn) => {
                      const entry = sample?.samples?.find((item) => item.sn === sn);
                      const label = experienceLabel(entry?.configuredExperience);
                      const activeSn = pendingSn || nfcCardSn;
                      const selected = sn === activeSn;
                      return (
                        <button
                          key={sn}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          disabled={snSwitching}
                          onClick={() => void selectSn(sn)}
                          className={`inline-flex items-center rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                            selected
                              ? "border-violet-600 bg-violet-50 text-violet-900"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                          } ${snSwitching && !selected ? "opacity-60" : ""}`}
                        >
                          {snSwitching && selected ? (
                            <Loader2 className="mr-1.5 size-3.5 shrink-0 animate-spin text-violet-600" />
                          ) : null}
                          <span className="font-medium">{sn}</span>
                          <span
                            className={`ml-1.5 ${label ? "text-slate-500" : "text-slate-400"}`}
                          >
                            · {label || "Not set"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div
                className={`relative ${snSwitching ? "pointer-events-none opacity-50" : ""}`}
                aria-busy={snSwitching}
              >
              {snSwitching ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center pt-6">
                  <p className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                    <Loader2 className="size-3.5 animate-spin text-violet-600" />
                    Loading {pendingSn || "magnet"}…
                  </p>
                </div>
              ) : null}
              {nfcCardSn ? (
                <div className={`${nfcCardSns.length > 1 ? "mt-2" : ""} flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500`}>
                  <p>
                    NFC Card SN · <span className="font-medium text-slate-700">{nfcCardSn}</span>
                    {configuredLabel ? (
                      <>
                        {" "}
                        · Experience ·{" "}
                        <span className="font-medium text-slate-700">{configuredLabel}</span>
                      </>
                    ) : (
                      <>
                        {" "}
                        · Experience · <span className="font-medium text-slate-400">Not set</span>
                      </>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 min-h-8 px-2.5 text-[11px]"
                    disabled={!sample || brandLoading || snSwitching}
                    onClick={() =>
                      openExperienceForm(
                        configuredLabel === "Amazon"
                          ? "DTC"
                          : configuredLabel === "DTC"
                            ? "Amazon"
                            : activeType,
                      )
                    }
                  >
                    {configuredLabel ? `Switch to ${configuredLabel === "Amazon" ? "DTC" : "Amazon"}` : "Set experience"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-700">
                  No NFC Card SN on ClientDB for this brand. Add SN to resolve the tap link.
                </p>
              )}
              {!configuredLabel && nfcCardSn ? (
                <p className="mt-2 text-xs text-amber-700">
                  No magnet experience configured yet. Use Set experience to fill in details.
                </p>
              ) : null}
              {configuredLabel && configuredLabel !== activeType ? (
                <p className="mt-2 text-xs text-amber-700">
                  This magnet is configured as {configuredLabel}. The {activeType} tab shows visits
                  stamped as {activeType} at sync time.
                </p>
              ) : null}
              {sampleUrl ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-violet-700" title={sampleUrl}>
                    {sampleUrl.replace(/^https?:\/\//, "")}
                  </span>
                  <Button variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => void copyLink()}>
                    {copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
              ) : nfcCardSn ? (
                <p className="mt-3 text-sm text-slate-500">
                  SN found, but magnet.url is empty in Supabase.
                </p>
              ) : null}
              {sample && sample.posthogConfigured === false ? (
                <p className="mt-2 text-xs text-amber-700">
                  PostHog is not configured — tap activity will stay empty until sync credentials are set.
                </p>
              ) : null}
            </div>
            </section>
            <div
              className={`relative ${snSwitching ? "pointer-events-none opacity-50" : ""}`}
              aria-busy={snSwitching}
            >
            <section className="mt-8 grid grid-cols-3 gap-3 sm:gap-8" aria-label="Click summary">
              <SummaryStat label="Total clicks" value={String(summary.totalClicks)} icon={MousePointerClick} />
              <SummaryStat label="Unique visitors" value={String(summary.uniqueVisitors)} icon={UserRound} />
              <SummaryStat
                label="Last clicked"
                value={summary.lastClickedAt ? formatDate(summary.lastClickedAt) : "—"}
                icon={Clock3}
                compact
              />
            </section>
            <section className="mt-10" aria-label="Click activity">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">Click activity</h2>
                <span className="text-xs text-slate-500">{clicks.length} records</span>
              </div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-[920px] w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="px-3 py-3">Person</th>
                      <th className="px-3 py-3">Role</th>
                      <th className="px-3 py-3">Location</th>
                      <th className="px-3 py-3">Device</th>
                      <th className="px-3 py-3">Referrer</th>
                      <th className="px-3 py-3">Clicked at</th>
                      <th className="px-3 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clicks.length ? (
                      clicks.map((click) => (
                        <tr key={click.id} className="border-b border-slate-100 last:border-0">
                          <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold">
                            {click.person}
                            {click.isInternal ? (
                              <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                Internal
                              </span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{click.role}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{click.location}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{click.device}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">{click.referrer}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-500">
                            <time dateTime={click.clickedAt}>{formatDate(click.clickedAt)}</time>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-right">
                            {click.deviceId ? (
                              click.isInternal ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  className="text-slate-500"
                                  disabled={markingDeviceId === click.deviceId}
                                  onClick={() => void setDeviceInternal(click.deviceId!, false)}
                                >
                                  {markingDeviceId === click.deviceId ? "Saving…" : "Unmark internal"}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  disabled={markingDeviceId === click.deviceId}
                                  onClick={() => void setDeviceInternal(click.deviceId!, true)}
                                >
                                  {markingDeviceId === click.deviceId ? "Saving…" : "Mark internal"}
                                </Button>
                              )
                            ) : (
                              <span className="text-xs text-slate-400">No device id</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                          {configuredLabel && configuredLabel !== activeType
                            ? `No ${activeType} tap activity. Current magnet experience is ${configuredLabel}.`
                            : "No tap activity synced yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            </div>
              </>
            ) : (
              <p className="mt-6 text-sm text-slate-500">No sample data available.</p>
            )}
          </div>

          <Dialog open={experienceFormOpen} onOpenChange={setExperienceFormOpen}>
            <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-2xl">
              <DialogHeader className="shrink-0 pr-8">
                <DialogTitle>
                  Configure {experienceTarget} experience
                  {nfcCardSn ? (
                    <span className="mt-1 block text-sm font-normal text-slate-500">
                      NFC Card SN · {nfcCardSn}
                    </span>
                  ) : null}
                </DialogTitle>
                <DialogDescription>
                  Fill in the tap page details, then save to switch this magnet to {experienceTarget}.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="space-y-4 px-1 py-1">
                {experienceFormError ? (
                  <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {experienceFormError}
                  </p>
                ) : null}
                <Field
                  label="Brand name"
                  required
                  value={experienceForm.brandName}
                  onChange={(value) => updateExperienceField("brandName", value)}
                />
                <ImageUrlField
                  label="Brand logo URL"
                  hint="(optional)"
                  value={experienceForm.brandLogo}
                  onChange={(value) => updateExperienceField("brandLogo", value)}
                  placeholder="https://…"
                  alt={experienceForm.brandName || "Brand logo"}
                  uploading={logoUploading}
                  uploadLabel="Upload logo"
                  onUpload={(file) => void uploadExperienceImage(file, "brandLogo")}
                  disabled={experienceSaving}
                />

                {experienceTarget === "DTC" ? (
                  <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                    <Field
                      label="Brand website"
                      type="url"
                      required
                      value={experienceForm.website}
                      onChange={(value) => updateExperienceField("website", value)}
                      placeholder="https://brand.com"
                    />
                    <Field
                      label="Store website"
                      type="url"
                      hint="(optional)"
                      value={experienceForm.storeWebsite}
                      onChange={(value) => updateExperienceField("storeWebsite", value)}
                      placeholder="https://brand.com/shop"
                    />
                    <div className="grid gap-3 sm:col-span-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-700">Brand colors</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          disabled={extractingColors || experienceSaving || !validHttpUrl(experienceForm.website)}
                          onClick={() => void extractBrandColors()}
                        >
                          {extractingColors ? "Extracting…" : "Extract from website"}
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                        <ColorField
                          label="Primary color"
                          hint="(optional)"
                          value={experienceForm.primaryColor}
                          onChange={(value) => updateExperienceField("primaryColor", value)}
                          placeholder="#E23031"
                        />
                        <ColorField
                          label="Secondary color"
                          hint="(optional)"
                          value={experienceForm.secondaryColor}
                          onChange={(value) => updateExperienceField("secondaryColor", value)}
                          placeholder="#04244B"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                    <Field
                      label="Product name"
                      required
                      value={experienceForm.productName}
                      onChange={(value) => updateExperienceField("productName", value)}
                    />
                    <Field
                      label="Price"
                      hint="(optional)"
                      value={experienceForm.price}
                      onChange={(value) => updateExperienceField("price", value)}
                      placeholder="$29.99"
                    />
                    <Field
                      label="Amazon product URL"
                      type="url"
                      required
                      value={experienceForm.amazonAsinUrl}
                      onChange={(value) => updateExperienceField("amazonAsinUrl", value)}
                      placeholder="https://www.amazon.com/dp/…"
                    />
                    <Field
                      label="Amazon brand store URL"
                      type="url"
                      hint="(optional)"
                      value={experienceForm.amazonFrontstore}
                      onChange={(value) => updateExperienceField("amazonFrontstore", value)}
                      placeholder="https://www.amazon.com/stores/…"
                    />
                    <div className="sm:col-span-2">
                      <ImageUrlField
                        label="Product image URL"
                        required
                        value={experienceForm.productImageUrl}
                        onChange={(value) => updateExperienceField("productImageUrl", value)}
                        alt={experienceForm.productName || "Product"}
                        uploading={productImageUploading}
                        uploadLabel="Upload product image"
                        onUpload={(file) => void uploadExperienceImage(file, "productImageUrl")}
                        disabled={experienceSaving}
                        footer={
                          validHttpUrl(experienceForm.amazonAsinUrl) ? (
                            <a
                              href={experienceForm.amazonAsinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-violet-700"
                            >
                              View product <ExternalLink className="size-3" />
                            </a>
                          ) : null
                        }
                      />
                    </div>
                    <Field
                      label="Discount benefit"
                      hint="(optional)"
                      value={experienceForm.discountBenefit}
                      onChange={(value) => updateExperienceField("discountBenefit", value)}
                      placeholder="Save 10%"
                    />
                    <Field
                      label="Discount claim code"
                      hint="(optional)"
                      value={experienceForm.discountClaimCode}
                      onChange={(value) => updateExperienceField("discountClaimCode", value)}
                    />
                    <Field
                      label="Discount ASIN"
                      hint="(optional)"
                      value={experienceForm.discountAsin}
                      onChange={(value) => updateExperienceField("discountAsin", value)}
                    />
                  </div>
                )}
                </div>
              </div>
              <DialogFooter className="shrink-0 border-t border-slate-100 pt-4">
                <Button
                  variant="outline"
                  disabled={experienceSaving}
                  onClick={() => setExperienceFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={experienceSaving || logoUploading || productImageUploading}
                  onClick={() => void saveExperienceForm()}
                >
                  {experienceSaving ? "Saving…" : `Save as ${experienceTarget}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  compact,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <Icon className="size-3.5 shrink-0 text-violet-600" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-2 break-words font-semibold tracking-tight ${
          compact ? "text-xs leading-5 sm:text-sm" : "text-2xl"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
