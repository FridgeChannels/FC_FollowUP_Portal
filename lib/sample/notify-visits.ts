import { emitNotificationSafe } from "../notify/engine.ts";
import { getPortalBaseUrl, shouldNotifySampleVisit } from "../notify/config.ts";
import { retrievePage, titleFromProperties } from "../notion/client.ts";
import { getSampleTapBaseUrl } from "./config.ts";
import { getMagnetBySn } from "./magnet.ts";
import { sampleNotifyUrl } from "./notify-url.ts";
import { experienceToSampleType } from "./paths.ts";
import { buildSampleVisitDedupeKey, insertSystemNotification } from "./notifications.ts";
import type { SampleTapVisit } from "./visits.ts";

async function resolveOwnerName(ownerId: string | null | undefined) {
  if (!ownerId) return null;
  try {
    const page = await retrievePage(ownerId);
    return titleFromProperties(page.properties || {}) || null;
  } catch {
    return null;
  }
}

export async function notifySampleVisits(input: {
  sn: string;
  brandId: string | null;
  brandName: string | null;
  ownerId: string | null;
  ownerName?: string | null;
  sampleUrl: string | null;
  visits: SampleTapVisit[];
}): Promise<number> {
  if (!input.brandId || !shouldNotifySampleVisit()) return 0;

  let notified = 0;
  const deepLink = `${getPortalBaseUrl()}/signals?brand=${encodeURIComponent(input.brandId)}`;
  const ownerName = input.ownerName || (await resolveOwnerName(input.ownerId));
  const envBaseUrl = getSampleTapBaseUrl();
  let databaseUrl = (input.sampleUrl || "").trim() || null;
  if (!envBaseUrl) {
    try {
      databaseUrl = (await getMagnetBySn(input.sn))?.url?.trim() || databaseUrl;
    } catch {
      // keep the caller-supplied URL when magnet lookup fails
    }
  }
  const sampleUrl = sampleNotifyUrl({
    sn: input.sn,
    envBaseUrl,
    databaseUrl,
  });

  for (const visit of input.visits) {
    if (visit.is_internal) continue;
    const sampleType = experienceToSampleType(visit.experience) || "Sample";
    const dedupeKey = buildSampleVisitDedupeKey({
      sn: input.sn,
      deviceId: visit.device_id,
      occurredAt: visit.occurred_at,
    });
    const location = [visit.geo_city, visit.geo_country].filter(Boolean).join(", ") || null;
    const device = [visit.browser, visit.os].filter(Boolean).join(" · ") || null;
    const body = [sampleUrl, location, device].filter(Boolean).join(" · ");

    const inserted = await insertSystemNotification({
      type: "sample.visited",
      brandId: input.brandId,
      ownerId: input.ownerId,
      title: `Sample tap · ${sampleType}`,
      body,
      deepLink,
      dedupeKey,
    });
    if (!inserted) continue;
    notified += 1;

    await emitNotificationSafe({
      eventType: "sample.visited",
      channel: sampleType,
      brandId: input.brandId,
      brandName: input.brandName,
      ownerId: input.ownerId,
      ownerName,
      // Slack sample layout maps: subject→SN, sender→Location, contactName→Device
      subject: input.sn,
      sender: location,
      contactName: device,
      contentPreview: sampleUrl,
      occurredAt: visit.occurred_at,
      portalUrl: deepLink,
      inboxStatus: null,
    });
  }

  return notified;
}
