export type ChannelType = "DTC" | "Amazon" | "DTC&Amazon";

export const CHANNEL_TYPES = ["DTC", "Amazon", "DTC&Amazon"] as const satisfies readonly ChannelType[];

export type AmazonSampleProduct = {
  url: string;
  name: string;
  price: string;
  imageUrl: string;
};

export const EMPTY_AMAZON_PRODUCT: AmazonSampleProduct = {
  url: "", name: "", price: "", imageUrl: "",
};

export function parseAmazonSampleProduct(value: string): AmazonSampleProduct {
  try {
    const parsed = JSON.parse(value) as Partial<AmazonSampleProduct>;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
      price: typeof parsed.price === "string" ? parsed.price : "",
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : "",
    };
  } catch {
    return { ...EMPTY_AMAZON_PRODUCT };
  }
}

export function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Normalize Follow-up `Portal Channel Type` select value. */
export function normalizePortalChannelType(
  raw: string | null | undefined,
): ChannelType | null {
  const value = (raw || "").trim();
  return (CHANNEL_TYPES as readonly string[]).includes(value)
    ? (value as ChannelType)
    : null;
}

/**
 * Map ClientDB ICP Group (A / B / A&B) to portal channel labels.
 * Unknown / empty defaults to DTC (legacy UI behavior).
 */
export function channelTypeFromIcpGroup(icp: string | null | undefined): ChannelType {
  const value = (icp || "").trim();
  if (value === "Amazon" || value === "DTC&Amazon" || value === "DTC") return value;
  const normalized = value.replace(/\s*&\s*/g, "&").toUpperCase();
  if (normalized === "B") return "Amazon";
  if (normalized === "A&B") return "DTC&Amazon";
  return "DTC";
}

/** Prefer Portal Channel Type; fall back to ClientDB ICP Group mapping. */
export function resolveChannelType(input: {
  portal?: string | null;
  icpGroup?: string | null;
}): ChannelType {
  return (
    normalizePortalChannelType(input.portal) ||
    channelTypeFromIcpGroup(input.icpGroup)
  );
}
