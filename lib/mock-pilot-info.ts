export type PilotInfoByBrand = {
  brandId: string;
  brandName: string;
  notionUrl: string;
  summary: string;
  status: string;
  occurredAt: string;
};

/** Frontend-only example for the Pilot Info By Brand experience. */
export const MOCK_PILOT_INFO: PilotInfoByBrand = {
  brandId: "3f39166f-d9fd-8170-884d-d6b9d04b5b35",
  brandName: "Lucky Energy",
  notionUrl: "https://app.notion.com/p/Lucky-Energy-3f39166fd9fd8170884dd6b9d04b5b35?v=3dc9166fd9fd81408a8e000c0a17d768&source=copy_link",
  summary: "Pilot overview: review the proposed scope, launch timing, and success criteria.",
  status: "Ready for review",
  occurredAt: "2026-10-16T09:00:00.000Z",
};

function normalizeId(value: string) {
  return value.replace(/-/g, "").toLowerCase();
}

export function mockPilotInfoForBrand(brandId: string, brandName?: string | null) {
  return normalizeId(brandId) === normalizeId(MOCK_PILOT_INFO.brandId) ||
    brandName?.trim().toLowerCase() === MOCK_PILOT_INFO.brandName.toLowerCase()
    ? MOCK_PILOT_INFO
    : null;
}
