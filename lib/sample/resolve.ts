import {
  firstRelationId,
  notionFetch,
  propertyText,
  relationIds,
  retrievePage,
  type NotionPage,
} from "../notion/client.ts";
import { getClientDbId } from "../notion/config.ts";
import { getMagnetBySn, pathnameForSn } from "./magnet.ts";

export type BrandSampleLink = {
  brandId: string;
  brandName: string | null;
  ownerId: string | null;
  clientPageId: string | null;
  nfcCardSn: string | null;
  sampleUrl: string | null;
  pathname: string | null;
};

export async function readNfcCardSnFromClientPage(clientPageId: string | null | undefined) {
  if (!clientPageId) return null;
  try {
    const page = await retrievePage(clientPageId);
    return propertyText(page.properties?.["NFC Card SN"])?.trim() || null;
  } catch {
    return null;
  }
}

function sampleLinkMetaFromPage(page: NotionPage, brandId: string) {
  const properties = page.properties || {};
  return {
    brandId,
    brandName:
      propertyText(properties["Follow-up Client"]) ||
      propertyText(properties["Company Name"]) ||
      null,
    ownerId: firstRelationId(properties.Owner) || null,
    clientPageId: firstRelationId(properties.Client) || null,
  };
}

/** Resolve sample link using an already-fetched Follow-up Client page (avoids a second Notion retrieve). */
export async function resolveBrandSampleLinkFromPage(
  page: NotionPage,
  brandId = page.id,
): Promise<BrandSampleLink> {
  const meta = sampleLinkMetaFromPage(page, brandId);
  const nfcCardSn = await readNfcCardSnFromClientPage(meta.clientPageId);
  const magnet = nfcCardSn ? await getMagnetBySn(nfcCardSn) : null;
  return {
    ...meta,
    nfcCardSn,
    sampleUrl: magnet?.url || (nfcCardSn ? `https://tap.fridgechannels.com${pathnameForSn(nfcCardSn)}` : null),
    pathname: nfcCardSn ? pathnameForSn(nfcCardSn) : null,
  };
}

export async function resolveBrandSampleLink(brandId: string): Promise<BrandSampleLink> {
  const page = await retrievePage(brandId);
  return resolveBrandSampleLinkFromPage(page, brandId);
}

/** Resolve Follow-up brand id from ClientDB NFC Card SN. */
export async function resolveBrandIdBySn(sn: string): Promise<string | null> {
  const normalized = sn.trim();
  if (!normalized) return null;
  try {
    const data = await notionFetch<{ results: NotionPage[] }>(
      `/databases/${getClientDbId()}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 1,
          filter: {
            property: "NFC Card SN",
            rich_text: { equals: normalized },
          },
        }),
      },
    );
    const page = data.results?.[0];
    if (!page) return null;
    return relationIds(page.properties?.["Follow up Client"])[0] || null;
  } catch {
    return null;
  }
}

/** ClientDB pages with NFC Card SN → Follow-up brand ids for batch sync (single page). */
export async function listSampleTargetsFromClientDb(limit: number): Promise<
  Array<{ sn: string; brandId: string; clientPageId: string }>
> {
  const pageSize = Math.max(1, Math.min(limit, 100));
  const data = await notionFetch<{ results: NotionPage[] }>(
    `/databases/${getClientDbId()}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: pageSize,
        filter: {
          property: "NFC Card SN",
          rich_text: { is_not_empty: true },
        },
      }),
    },
  );

  const targets: Array<{ sn: string; brandId: string; clientPageId: string }> = [];
  for (const page of data.results || []) {
    if (targets.length >= limit) break;
    const sn = propertyText(page.properties?.["NFC Card SN"])?.trim();
    if (!sn) continue;
    const brandIds = relationIds(page.properties?.["Follow up Client"]);
    const brandId = brandIds[0];
    if (!brandId) continue;
    targets.push({ sn, brandId, clientPageId: page.id });
  }
  return targets;
}
