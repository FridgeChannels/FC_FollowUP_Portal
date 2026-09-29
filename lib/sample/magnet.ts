import { supabasePatch, supabaseSelect } from "../supabase/client.ts";
import {
  normalizeMagnetExperience,
  pathnameForSn,
  type MagnetExperience,
} from "./paths.ts";

export type MagnetLink = {
  sn: string;
  url: string | null;
  magnetId: number | null;
};

export type MagnetBrandParam = {
  magnetSn: string;
  experience: MagnetExperience | null;
  brandName: string | null;
  brandLogo: string | null;
  website: string | null;
  storeWebsite: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  productName: string | null;
  productImageUrl: string | null;
  amazonAsinUrl: string | null;
  amazonFrontstore: string | null;
  discountBenefit: string | null;
  discountClaimCode: string | null;
  discountAsin: string | null;
};

export type MagnetBrandParamPatch = {
  experience: MagnetExperience;
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

export { pathnameForSn };

type MagnetRow = {
  id?: number | null;
  sn?: string | null;
  url?: string | null;
};

type MagnetBrandParamRow = {
  magnet_sn?: string | null;
  experience?: string | null;
  brand_name?: string | null;
  brand_logo?: string | null;
  website?: string | null;
  store_website?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  amazon_asin_url?: string | null;
  amazon_frontstore?: string | null;
  discount_benefit?: string | null;
  discount_claim_code?: string | null;
  discount_asin?: string | null;
};

function trimOrNull(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function mapMagnetBrandParam(row: MagnetBrandParamRow): MagnetBrandParam {
  return {
    magnetSn: (row.magnet_sn || "").trim(),
    experience: normalizeMagnetExperience(row.experience),
    brandName: trimOrNull(row.brand_name),
    brandLogo: trimOrNull(row.brand_logo),
    website: trimOrNull(row.website),
    storeWebsite: trimOrNull(row.store_website),
    primaryColor: trimOrNull(row.primary_color),
    secondaryColor: trimOrNull(row.secondary_color),
    productName: trimOrNull(row.product_name),
    productImageUrl: trimOrNull(row.product_image_url),
    amazonAsinUrl: trimOrNull(row.amazon_asin_url),
    amazonFrontstore: trimOrNull(row.amazon_frontstore),
    discountBenefit: trimOrNull(row.discount_benefit),
    discountClaimCode: trimOrNull(row.discount_claim_code),
    discountAsin: trimOrNull(row.discount_asin),
  };
}

export async function getMagnetBySn(sn: string): Promise<MagnetLink | null> {
  const normalized = sn.trim();
  if (!normalized) return null;
  const rows = await supabaseSelect<MagnetRow>("magnet", {
    select: "id,sn,url",
    filters: { sn: `eq.${normalized}` },
    limit: 5,
  });
  const withUrl = rows.find((row) => (row.url || "").trim());
  const row = withUrl || rows[0];
  if (!row?.sn) return null;
  return {
    sn: row.sn,
    url: row.url?.trim() || null,
    magnetId: row.id ?? null,
  };
}

export async function getMagnetBrandParamBySn(sn: string): Promise<MagnetBrandParam | null> {
  const normalized = sn.trim();
  if (!normalized) return null;
  const rows = await supabaseSelect<MagnetBrandParamRow>("magnet_brand_param", {
    select:
      "magnet_sn,experience,brand_name,brand_logo,website,store_website,primary_color,secondary_color,product_name,product_image_url,amazon_asin_url,amazon_frontstore,discount_benefit,discount_claim_code,discount_asin",
    filters: { magnet_sn: `eq.${normalized}` },
    limit: 5,
  });
  const row = rows[0];
  return row ? mapMagnetBrandParam(row) : null;
}

/** Current magnet experience config (dtc | asin_plus). Used as sync-time snapshot source. */
export async function getExperienceBySn(sn: string): Promise<MagnetExperience | null> {
  const param = await getMagnetBrandParamBySn(sn);
  return param?.experience || null;
}

/** Update experience + related magnet_brand_param fields for this SN. */
export async function updateMagnetBrandParamBySn(
  sn: string,
  patch: MagnetBrandParamPatch,
): Promise<MagnetBrandParam | null> {
  const normalized = sn.trim();
  if (!normalized) return null;
  const payload: MagnetBrandParamRow = {
    experience: patch.experience,
  };
  if (patch.brandName !== undefined) payload.brand_name = trimOrNull(patch.brandName);
  if (patch.brandLogo !== undefined) payload.brand_logo = trimOrNull(patch.brandLogo);
  if (patch.website !== undefined) payload.website = trimOrNull(patch.website);
  if (patch.storeWebsite !== undefined) payload.store_website = trimOrNull(patch.storeWebsite);
  if (patch.primaryColor !== undefined) payload.primary_color = trimOrNull(patch.primaryColor);
  if (patch.secondaryColor !== undefined) payload.secondary_color = trimOrNull(patch.secondaryColor);
  if (patch.productName !== undefined) payload.product_name = trimOrNull(patch.productName);
  if (patch.productImageUrl !== undefined) {
    payload.product_image_url = trimOrNull(patch.productImageUrl);
  }
  if (patch.amazonAsinUrl !== undefined) payload.amazon_asin_url = trimOrNull(patch.amazonAsinUrl);
  if (patch.amazonFrontstore !== undefined) {
    payload.amazon_frontstore = trimOrNull(patch.amazonFrontstore);
  }
  if (patch.discountBenefit !== undefined) {
    payload.discount_benefit = trimOrNull(patch.discountBenefit);
  }
  if (patch.discountClaimCode !== undefined) {
    payload.discount_claim_code = trimOrNull(patch.discountClaimCode);
  }
  if (patch.discountAsin !== undefined) payload.discount_asin = trimOrNull(patch.discountAsin);

  const rows = await supabasePatch<MagnetBrandParamRow>(
    "magnet_brand_param",
    payload,
    { magnet_sn: `eq.${normalized}` },
  );
  if (!rows.length) return null;
  return mapMagnetBrandParam(rows[0]!);
}
