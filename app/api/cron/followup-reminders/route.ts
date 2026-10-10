import { firstRelationId, propertyText, queryFollowupClientPages, retrievePage, titleFromProperties } from "@/lib/notion/client";
import { queryOwnerPages } from "@/lib/notion/owners";
import { listReplyActionReminderConversations } from "@/lib/notion/conversations";
import { latestFollowUpReminder } from "@/lib/followup-reminder";
import { latestReplyActionReminder } from "@/lib/reply-action-reminder";
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
  const [pages, owners, replyActivities] = await Promise.all([
    queryFollowupClientPages(undefined, { status: "Paused" }),
    queryOwnerPages(),
    listReplyActionReminderConversations(),
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

  let replyDue = 0;
  let replyNotified = 0;
  for (const activity of replyActivities) {
    const reminder = latestReplyActionReminder(activity.notes);
    if (!reminder || Date.parse(reminder.dueAt) > now || !activity.brandId) continue;
    replyDue += 1;
    const brandPage = await retrievePage(activity.brandId).catch(() => null);
    const brandName = brandPage ? titleFromProperties(brandPage.properties || {}) || "Untitled brand" : "Brand";
    const ownerId = brandPage ? firstRelationId(brandPage.properties?.Owner) || reminder.ownerId : reminder.ownerId;
    const owner = owners.find((item) => item.id === ownerId) || null;
    const body = [
      `Reply note: ${reminder.note}`,
      "A follow-up action is due now.",
    ].join("\n");
    const dedupeKey = `reply.action_due:${activity.id}:${reminder.dueAt}`;
    let inserted = true;
    try {
      inserted = Boolean(await insertSystemNotification({
        type: "reply.action_due",
        brandId: activity.brandId,
        ownerId,
        title: `Action reminder · ${brandName}`,
        body,
        deepLink: portalBrandUrl(activity.brandId),
        dedupeKey,
      }));
    } catch (error) {
      console.error("[followup-reminders] AM action notification failed", error);
      inserted = false;
    }
    if (!inserted) continue;
    await emitNotificationSafe({
      eventType: "reply.action_due",
      channel: activity.channel || "Follow-up",
      brandId: activity.brandId,
      brandName,
      ownerId,
      ownerName: owner?.name || "Account Manager",
      contentPreview: body,
      occurredAt: reminder.dueAt,
      portalUrl: portalBrandUrl(activity.brandId),
    });
    replyNotified += 1;
  }
  return { due, notified, replyDue, replyNotified };
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
