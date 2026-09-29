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
import { parseNfcCardSns, pickSelectedSn } from "./sns.ts";

export type BrandSampleLink = {
  brandId: string;
  brandName: string | null;
  ownerId: string | null;
  clientPageId: string | null;
  /** All SNs from ClientDB (comma-separated field, order preserved). */
  nfcCardSns: string[];
  /** Primary SN = first in list (compat for older callers). */
  nfcCardSn: string | null;
  sampleUrl: string | null;
  pathname: string | null;
};

export { parseNfcCardSns, pickSelectedSn };

export async function readNfcCardSnsFromClientPage(
  clientPageId: string | null | undefined,
): Promise<string[]> {
  if (!clientPageId) return [];
  try {
    const page = await retrievePage(clientPageId);
    return parseNfcCardSns(propertyText(page.properties?.["NFC Card SN"]));
  } catch {
    return [];
  }
}

/** @deprecated Prefer readNfcCardSnsFromClientPage — returns first SN only. */
export async function readNfcCardSnFromClientPage(clientPageId: string | null | undefined) {
  const sns = await readNfcCardSnsFromClientPage(clientPageId);
  return sns[0] || null;
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

function linkFromMetaAndSns(
  meta: ReturnType<typeof sampleLinkMetaFromPage>,
  nfcCardSns: string[],
  magnetUrl: string | null,
): BrandSampleLink {
  const nfcCardSn = nfcCardSns[0] || null;
  return {
    ...meta,
    nfcCardSns,
    nfcCardSn,
    sampleUrl:
      magnetUrl ||
      (nfcCardSn ? `https://tap.fridgechannels.com${pathnameForSn(nfcCardSn)}` : null),
    pathname: nfcCardSn ? pathnameForSn(nfcCardSn) : null,
  };
}

/** Resolve sample link using an already-fetched Follow-up Client page (avoids a second Notion retrieve). */
export async function resolveBrandSampleLinkFromPage(
  page: NotionPage,
  brandId = page.id,
): Promise<BrandSampleLink> {
  const meta = sampleLinkMetaFromPage(page, brandId);
  const nfcCardSns = await readNfcCardSnsFromClientPage(meta.clientPageId);
  const primary = nfcCardSns[0] || null;
  const magnet = primary ? await getMagnetBySn(primary) : null;
  return linkFromMetaAndSns(meta, nfcCardSns, magnet?.url || null);
}

export async function resolveBrandSampleLink(brandId: string): Promise<BrandSampleLink> {
  const page = await retrievePage(brandId);
  return resolveBrandSampleLinkFromPage(page, brandId);
}

/**
 * Resolve Follow-up brand id from ClientDB NFC Card SN.
 * Field may be comma-separated (`A,B`) so we `contains` then exact-member check.
 */
export async function resolveBrandIdBySn(sn: string): Promise<string | null> {
  const normalized = sn.trim();
  if (!normalized) return null;
  try {
    const data = await notionFetch<{ results: NotionPage[] }>(
      `/databases/${getClientDbId()}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 25,
          filter: {
            property: "NFC Card SN",
            rich_text: { contains: normalized },
          },
        }),
      },
    );
    for (const page of data.results || []) {
      const sns = parseNfcCardSns(propertyText(page.properties?.["NFC Card SN"]));
      if (!sns.includes(normalized)) continue;
      const brandId = relationIds(page.properties?.["Follow up Client"])[0] || null;
      if (brandId) return brandId;
    }
    return null;
  } catch {
    return null;
  }
}

/** ClientDB pages with NFC Card SN → Follow-up brand ids for batch sync (expands multi-SN). */
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
    const sns = parseNfcCardSns(propertyText(page.properties?.["NFC Card SN"]));
    if (!sns.length) continue;
    const brandIds = relationIds(page.properties?.["Follow up Client"]);
    const brandId = brandIds[0];
    if (!brandId) continue;
    for (const sn of sns) {
      if (targets.length >= limit) break;
      targets.push({ sn, brandId, clientPageId: page.id });
    }
  }
  return targets;
}
