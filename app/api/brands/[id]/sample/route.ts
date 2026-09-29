import { after } from "next/server";
import { canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  firstRelationId,
  propertyText,
  retrievePage,
} from "@/lib/notion/client";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { updateFollowupClient } from "@/lib/notion/followup-writes";
import {
  getMagnetBrandParamBySn,
  getMagnetBySn,
  updateMagnetBrandParamBySn,
  type MagnetBrandParam,
  type MagnetBrandParamPatch,
} from "@/lib/sample/magnet";
import { countUnreadSampleNotifications, markSampleNotificationsRead } from "@/lib/sample/notifications";
import { getInternalDeviceIds, isInternalDeviceId } from "@/lib/sample/internal-devices";
import {
  experienceToSampleType,
  formatReferrer,
  normalizeMagnetExperience,
  pathnameForSn,
  sampleTypeToExperience,
  type SampleChannelType,
} from "@/lib/sample/paths";
import {
  pickSelectedSn,
  readNfcCardSnsFromClientPage,
} from "@/lib/sample/resolve";
import { planBrandSampleSync, syncSampleVisitsForSn } from "@/lib/sample/sync";
import { listVisitsForSn } from "@/lib/sample/visits";
import { isPosthogConfigured } from "@/lib/posthog/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { validHttpUrl } from "@/lib/sample-product";

type Params = { params: Promise<{ id: string }> };

function formatDevice(browser: string | null, os: string | null) {
  return [browser, os].filter(Boolean).join(" · ") || "Unknown";
}

function formatLocation(city: string | null, country: string | null) {
  return [city, country].filter(Boolean).join(", ") || "Unknown";
}

function summarizeClicks(
  clicks: Array<{
    clickedAt: string;
    deviceId?: string | null;
    person: string;
    isInternal?: boolean;
  }>,
) {
  const visible = clicks.filter((item) => !item.isInternal);
  const uniqueDevices = new Set(
    visible.map((item) => item.deviceId || item.person).filter(Boolean),
  );
  return {
    totalClicks: visible.length,
    uniqueVisitors: uniqueDevices.size,
    lastClickedAt: visible[0]?.clickedAt || null,
  };
}

function runInBackground(job: Promise<unknown>, label: string) {
  try {
    after(() => job);
  } catch {
    void job.catch((error) => {
      console.error(`[sample] background ${label} failed`, error);
    });
  }
}

function sampleUrlForSn(sn: string, magnetUrl: string | null | undefined) {
  return magnetUrl || `https://tap.fridgechannels.com${pathnameForSn(sn)}`;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canViewBrand(viewer, brand, [])) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    if (!isSupabaseConfigured()) {
      return Response.json(
        {
          error: "Supabase is not configured",
          nfcCardSn: null,
          nfcCardSns: [],
          samples: [],
          sampleUrl: null,
          clicks: [],
          summary: null,
        },
        { status: 503 },
      );
    }

    const requestedSn = new URL(request.url).searchParams.get("sn");

    // Fast path: reuse the Follow-up page already fetched for auth; only ClientDB for SN.
    const properties = page.properties || {};
    const clientPageId = firstRelationId(properties.Client) || null;
    const ownerId = firstRelationId(properties.Owner) || null;
    const brandName =
      propertyText(properties["Follow-up Client"]) ||
      propertyText(properties["Company Name"]) ||
      brand.name ||
      null;
    const nfcCardSns = await readNfcCardSnsFromClientPage(clientPageId);
    const nfcCardSn = pickSelectedSn(nfcCardSns, requestedSn);

    const [magnetEntries, visits, internalDeviceIds, plan] = await Promise.all([
      Promise.all(
        nfcCardSns.map(async (sn) => {
          const [magnet, magnetParam] = await Promise.all([
            getMagnetBySn(sn),
            getMagnetBrandParamBySn(sn),
          ]);
          return { sn, magnet, magnetParam };
        }),
      ),
      nfcCardSn ? listVisitsForSn(nfcCardSn, 200) : Promise.resolve([]),
      getInternalDeviceIds(),
      planBrandSampleSync({
        brandId: id,
        sn: nfcCardSn,
        link: {
          brandId: id,
          brandName,
          ownerId,
          clientPageId,
          nfcCardSns,
          nfcCardSn,
          sampleUrl: nfcCardSn
            ? `https://tap.fridgechannels.com${pathnameForSn(nfcCardSn)}`
            : null,
          pathname: nfcCardSn ? pathnameForSn(nfcCardSn) : null,
        },
      }),
    ]);

    const samples = magnetEntries.map(({ sn, magnet, magnetParam }) => {
      const configuredExperience = magnetParam?.experience || null;
      return {
        sn,
        sampleUrl: sampleUrlForSn(sn, magnet?.url),
        pathname: pathnameForSn(sn),
        configuredExperience,
        defaultSampleType: experienceToSampleType(configuredExperience),
        magnetParam,
      };
    });

    const selected =
      samples.find((item) => item.sn === nfcCardSn) || samples[0] || null;
    const sampleUrl = selected?.sampleUrl || null;
    const magnetParam: MagnetBrandParam | null = selected?.magnetParam || null;
    const configuredExperience = selected?.configuredExperience || null;
    const defaultSampleType = selected?.defaultSampleType || null;

    const clicks = visits.map((visit) => {
      const experience = normalizeMagnetExperience(visit.experience);
      return {
        id: visit.id,
        sn: visit.sn,
        clickedAt: visit.occurred_at,
        person: "Anonymous",
        role: "Unknown",
        location: formatLocation(visit.geo_city, visit.geo_country),
        device: formatDevice(visit.browser, visit.os),
        referrer: formatReferrer(visit.referrer),
        isInternal:
          visit.is_internal || isInternalDeviceId(visit.device_id, internalDeviceIds),
        deviceId: visit.device_id,
        experience,
        sampleType: experienceToSampleType(experience) as SampleChannelType | null,
      };
    });

    const byType = {
      DTC: clicks.filter((item) => item.sampleType === "DTC"),
      Amazon: clicks.filter((item) => item.sampleType === "Amazon"),
      Unknown: clicks.filter((item) => !item.sampleType),
    };

    const unreadNotifications = nfcCardSns.length
      ? await countUnreadSampleNotifications(id, internalDeviceIds)
      : 0;

    // Clear banner after we've captured the count; don't block the response.
    if (nfcCardSns.length) {
      runInBackground(markSampleNotificationsRead(id), "mark-read");
    }

    // PostHog sync stays off the critical path — only the selected SN on page load.
    if (plan.shouldSync && plan.sn) {
      runInBackground(
        syncSampleVisitsForSn({
          sn: plan.sn,
          brandId: plan.link.brandId,
          brandName: plan.link.brandName || brandName,
          ownerId: plan.link.ownerId || ownerId,
          sampleUrl: sampleUrlForSn(plan.sn, null),
        }),
        "page-sync",
      );
    }

    return Response.json({
      nfcCardSn,
      nfcCardSns,
      samples,
      brandName,
      sampleUrl,
      pathname: nfcCardSn ? pathnameForSn(nfcCardSn) : null,
      configuredExperience,
      defaultSampleType,
      magnetParam,
      posthogConfigured: isPosthogConfigured(),
      sync: {
        skipped: !plan.shouldSync,
        scheduled: plan.shouldSync,
        reason: plan.reason,
        sn: plan.sn,
      },
      unreadNotifications,
      summary: summarizeClicks(clicks),
      summaryByType: {
        DTC: summarizeClicks(byType.DTC),
        Amazon: summarizeClicks(byType.Amazon),
        Unknown: summarizeClicks(byType.Unknown),
      },
      clicks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample] GET failed", { message, error });
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

/** Save magnet experience + DTC/Amazon form fields onto magnet_brand_param. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    if (!isSupabaseConfigured()) {
      return Response.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const body = (await request.json()) as {
      sn?: string | null;
      sampleType?: string | null;
      experience?: string | null;
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
      price?: string | null;
    };

    const experience =
      normalizeMagnetExperience(body.experience) ||
      sampleTypeToExperience(
        body.sampleType === "DTC" || body.sampleType === "Amazon" ? body.sampleType : null,
      );
    if (!experience) {
      return Response.json(
        { error: 'experience must be "dtc" | "asin_plus", or sampleType "DTC" | "Amazon"' },
        { status: 400 },
      );
    }

    const properties = page.properties || {};
    const clientPageId = firstRelationId(properties.Client) || null;
    const nfcCardSns = await readNfcCardSnsFromClientPage(clientPageId);
    if (!nfcCardSns.length) {
      return Response.json({ error: "Brand has no NFC Card SN" }, { status: 400 });
    }
    const requestedSn = (body.sn || "").trim();
    if (nfcCardSns.length > 1 && !requestedSn) {
      return Response.json(
        { error: "sn is required when the brand has multiple NFC Card SNs" },
        { status: 400 },
      );
    }
    if (requestedSn && !nfcCardSns.includes(requestedSn)) {
      return Response.json(
        { error: "SN is not on this brand's ClientDB NFC Card SN list" },
        { status: 400 },
      );
    }
    const targetSn = pickSelectedSn(nfcCardSns, requestedSn);
    if (!targetSn) {
      return Response.json({ error: "Brand has no NFC Card SN" }, { status: 400 });
    }

    const brandName = (body.brandName || "").trim();
    const website = (body.website || "").trim();
    const brandLogo = (body.brandLogo || "").trim();
    const storeWebsite = (body.storeWebsite || "").trim();
    const productName = (body.productName || "").trim();
    const productImageUrl = (body.productImageUrl || "").trim();
    const amazonAsinUrl = (body.amazonAsinUrl || "").trim();
    const amazonFrontstore = (body.amazonFrontstore || "").trim();

    if (!brandName) {
      return Response.json({ error: "Brand name is required" }, { status: 400 });
    }
    if (experience === "dtc") {
      if (!website || !validHttpUrl(website)) {
        return Response.json({ error: "Enter a valid brand website URL" }, { status: 400 });
      }
      if (brandLogo && !validHttpUrl(brandLogo)) {
        return Response.json({ error: "Enter a valid brand logo URL" }, { status: 400 });
      }
      if (storeWebsite && !validHttpUrl(storeWebsite)) {
        return Response.json({ error: "Enter a valid store website URL" }, { status: 400 });
      }
    } else {
      if (!productName) {
        return Response.json({ error: "Product name is required" }, { status: 400 });
      }
      if (!amazonAsinUrl || !validHttpUrl(amazonAsinUrl)) {
        return Response.json({ error: "Enter a valid Amazon product URL" }, { status: 400 });
      }
      if (!productImageUrl || !validHttpUrl(productImageUrl)) {
        return Response.json({ error: "Enter a valid product image URL" }, { status: 400 });
      }
      if (amazonFrontstore && !validHttpUrl(amazonFrontstore)) {
        return Response.json({ error: "Enter a valid Amazon storefront URL" }, { status: 400 });
      }
      if (brandLogo && !validHttpUrl(brandLogo)) {
        return Response.json({ error: "Enter a valid brand logo URL" }, { status: 400 });
      }
    }

    const patch: MagnetBrandParamPatch = {
      experience,
      brandName,
      brandLogo: brandLogo || null,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
    };

    if (experience === "dtc") {
      patch.website = website;
      patch.storeWebsite = storeWebsite || null;
    } else {
      patch.productName = productName;
      patch.productImageUrl = productImageUrl;
      patch.amazonAsinUrl = amazonAsinUrl;
      patch.amazonFrontstore = amazonFrontstore || null;
      patch.discountBenefit = body.discountBenefit;
      patch.discountClaimCode = body.discountClaimCode;
      patch.discountAsin = body.discountAsin;
    }

    const updated = await updateMagnetBrandParamBySn(targetSn, patch);
    if (!updated) {
      return Response.json(
        { error: "No magnet_brand_param row for this SN — cannot switch experience" },
        { status: 404 },
      );
    }

    if (experience === "asin_plus") {
      await updateFollowupClient(id, {
        amazonSampleProduct: {
          name: productName,
          url: amazonAsinUrl,
          imageUrl: productImageUrl,
          price: (body.price || "").trim(),
        },
      });
    }

    return Response.json({
      nfcCardSn: targetSn,
      nfcCardSns,
      configuredExperience: updated.experience,
      defaultSampleType: experienceToSampleType(updated.experience),
      magnetParam: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[sample] PATCH failed", { message, error });
    const status = /required|Enter a valid|must be|not on this brand/.test(message)
      ? 400
      : message.includes("404")
        ? 404
        : 500;
    return Response.json({ error: message }, { status });
  }
}
