"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import { mockPilotInfoForBrand } from "@/lib/mock-pilot-info";

export function PilotInfoByBrand({ brandId, brandName }: { brandId: string; brandName: string }) {
  const pilotInfo = mockPilotInfoForBrand(brandId, brandName);
  return <section id="brand-pilot-info" aria-label="Pilot Info By Brand" className="scroll-mt-4 border-t border-slate-100 py-4">
    <p className="text-xs font-semibold text-slate-500">Pilot Info By Brand</p>
    {pilotInfo?.notionUrl ? <>
      <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{pilotInfo.status}</span>
      <p className="mt-2 text-sm leading-5 text-slate-700">{pilotInfo.summary}</p>
      <a href={pilotInfo.notionUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900 hover:underline">
        <FileText className="size-3.5" />Open Notion page<ArrowUpRight className="size-3.5" />
      </a>
    </> : <p className="mt-2 text-sm text-slate-500">Not filled yet</p>}
  </section>;
}
