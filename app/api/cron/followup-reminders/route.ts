import { firstRelationId, propertyText, queryFollowupClientPages, titleFromProperties } from "@/lib/notion/client";
import { queryOwnerPages } from "@/lib/notion/owners";
import { latestFollowUpReminder } from "@/lib/followup-reminder";
import { getFollowUpReminderCronSecret, portalBrandUrl } from "@/lib/notify/config";
import { emitNotificationSafe } from "@/lib/notify/engine";
import { insertSystemNotification } from "@/lib/sample/notifications";

function authorized(request: Request) {
  const secret = getFollowUpReminderCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer === secret || new URL(request.url).searchParams.get("secret") === secret;
}

async function run() {
  const now = Date.now();
  const [pages, owners] = await Promise.all([
    queryFollowupClientPages(undefined, { status: "Paused" }),
    queryOwnerPages(),
  ]);
  const admin = owners.find((owner) => owner.isAdmin && owner.status !== "Inactive") || null;
  let due = 0;
  let notified = 0;
  for (const page of pages) {
    const reminder = latestFollowUpReminder(propertyText(page.properties?.Notes));
    if (!reminder || Date.parse(reminder.dueAt) > now) continue;
    due += 1;
    const brandId = page.id;
    const brandName = titleFromProperties(page.properties || {}) || "Untitled brand";
    const ownerId = firstRelationId(page.properties?.Owner) || reminder.ownerId;
    const owner = owners.find((item) => item.id === ownerId) || null;
    const body = [
      `Customer note: ${reminder.note}`,
      `Previous Account Manager: ${owner?.name || "Unassigned"}`,
      "Review and assign the next follow-up.",
    ].join("\n");
    const dedupeKey = `followup.resume_due:${brandId}:${reminder.dueAt}`;
    let inserted = true;
    try {
      inserted = Boolean(await insertSystemNotification({
        type: "followup.resume_due",
        brandId,
        ownerId: admin?.id || null,
        title: `Follow-up review due · ${brandName}`,
        body,
        deepLink: portalBrandUrl(brandId),
        dedupeKey,
      }));
    } catch (error) {
      console.error("[followup-reminders] in-app notification failed", error);
      inserted = false;
    }
    if (!inserted) continue;
    await emitNotificationSafe({
      eventType: "followup.resume_due",
      channel: "Follow-up",
      brandId,
      brandName,
      ownerId: admin?.id || null,
      ownerName: admin?.name || "Admin",
      contentPreview: body,
      occurredAt: reminder.dueAt,
      portalUrl: portalBrandUrl(brandId),
    });
    notified += 1;
  }
  return { due, notified };
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await run()) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
