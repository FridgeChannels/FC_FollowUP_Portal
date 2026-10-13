"use client";
import { useEffect, useState } from "react";
import type { CallerNotionReport } from "@/lib/caller-notion";

export function useBrandNotion(brandId?: string) {
  const [data, setData] = useState<{ brandId: string; reports: CallerNotionReport[]; callerName?: string; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!brandId) return;
    let controller: AbortController | undefined;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/brands/${encodeURIComponent(brandId)}/caller-notion`, { signal: request.signal, cache: "no-store" });
        const payload = await response.json() as { reports?: CallerNotionReport[]; caller?: { name: string }; error?: string };
        if (!response.ok) throw new Error(payload.error || "Notion links unavailable.");
        if (!request.signal.aborted) setData({ brandId, reports: payload.reports || [], callerName: payload.caller?.name });
      } catch (error) {
        if (!request.signal.aborted) setData({ brandId, reports: [], error: error instanceof Error ? error.message : "Notion links unavailable." });
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("caller-notion-updated", refresh);
    return () => { controller?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("caller-notion-updated", refresh); };
  }, [brandId, retry]);
  return { reports: data && data.brandId === brandId ? data.reports : [], callerName: data && data.brandId === brandId ? data.callerName : undefined, loading: !!brandId && data?.brandId !== brandId, error: data && data.brandId === brandId ? data.error : undefined, retry: () => setRetry((value) => value + 1) };
}
