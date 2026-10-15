import { buildBrandWork, WORK_REPLY_CHANNELS, type PendingWorkAssignment, type PendingWorkCall, type PendingWorkDeadline, type PendingWorkPause, type PendingWorkReply, type WorkReplyChannel } from "../brand-work";
import { historyFromTask } from "../call-review-history";
import { firstRelationId, propertyDate, propertyText, queryDatabasePages, retrievePage, type NotionPage } from "./client";
import { getFollowupConversationDbId, getFollowupTaskDbId } from "./config";
import { listScopedClientBrandMetadata } from "./followup-clients";
import { attachBrandInteractionSignals, listBrandInteractionSignals } from "./brand-reply-signals";
import { listFollowupConversationsByBrands } from "./conversations";
import { listFollowupTaskSignalsByBrands } from "./tasks";
import type { NeedsReplyBrandScope } from "./owner-filter";
import { hasResolvedFollowUpReminder, latestFollowUpReminder } from "../followup-reminder";
import { expiredUnansweredReplyDeadline } from "../reply-deadline";

function preview(page: NotionPage) {
  const properties = page.properties || {};
  return (propertyText(properties.Content) || propertyText(properties.Subject) || "Customer replied")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

const key = (id: string) => id.replace(/-/g, "").toLowerCase();

export async function listBrandWorkForViewer(scope: NeedsReplyBrandScope) {
  const [conversationPages, taskPages, scopedMetadata] = await Promise.all([
    queryDatabasePages(getFollowupConversationDbId(), {
      and: [
        { property: "Reply Status", select: { equals: "Needs Reply" } },
        { property: "Direction", select: { equals: "Inbound" } },
      ],
    }),
    queryDatabasePages(getFollowupTaskDbId(), {
      and: [
        { property: "Call Review Status", select: { equals: "Awaiting Review" } },
        { property: "Channel", select: { equals: "Phone" } },
        { property: "Task Status", status: { equals: "Completed" } },
      ],
    }),
    listScopedClientBrandMetadata(scope),
  ]);

  const now = Date.now();
  const pauses: PendingWorkPause[] = scope.ownerPageId
    ? scopedMetadata.flatMap(({ page, brand }) => {
      if (brand.status !== "Paused" || !brand.ownerId || key(brand.ownerId) !== key(scope.ownerPageId!)) return [];
      const notes = propertyText(page.properties?.Notes);
      const reminder = latestFollowUpReminder(notes);
      if (!reminder || Date.parse(reminder.dueAt) > now || hasResolvedFollowUpReminder(notes, reminder.dueAt)) return [];
      return [{ brandId: brand.id, dueAt: reminder.dueAt, preview: reminder.note || "Paused FollowUp is ready to resume" }];
    })
    : [];
  const duePauseIds = new Set(pauses.map((pause) => key(pause.brandId)));
  // A pause suppresses old work signals until its current AM's reminder is due.
  // Admin's portfolio-wide scope never receives paused brands as pending work.
  const ownedMetadata = scopedMetadata.filter(({ brand }) => brand.status !== "Paused" || duePauseIds.has(key(brand.id)));

  const contactBrandCache = new Map<string, string | null>();
  const unresolvedContacts = [...new Set(conversationPages.flatMap((page) => {
    if (firstRelationId(page.properties?.["Follow-up Client"])) return [];
    const contactId = firstRelationId(page.properties?.["Follow-up Contact"]);
    return contactId ? [contactId] : [];
  }))];
  let nextContact = 0;
  await Promise.all(Array.from({ length: Math.min(4, unresolvedContacts.length) }, async () => {
    while (nextContact < unresolvedContacts.length) {
      const id = unresolvedContacts[nextContact++];
      const page = await retrievePage(id).catch(() => null);
      contactBrandCache.set(id, page ? firstRelationId(page.properties?.["Follow-up Client"]) || null : null);
    }
  }));

  const replies: PendingWorkReply[] = conversationPages.flatMap((page) => {
    const properties = page.properties || {};
    const channel = propertyText(properties.Channel);
    if (!WORK_REPLY_CHANNELS.includes(channel as WorkReplyChannel)) return [];
    const contactId = firstRelationId(properties["Follow-up Contact"]) || null;
    const brandId = firstRelationId(properties["Follow-up Client"]) || (contactId ? contactBrandCache.get(contactId) : null);
    if (!brandId) return [];
    return [{
      id: page.id,
      brandId,
      contactId,
      taskId: firstRelationId(properties["Follow-up Task"]) || null,
      channel: channel as WorkReplyChannel,
      threadId: propertyText(properties["Thread ID"]) || null,
      preview: preview(page),
      receivedAt: propertyDate(properties["Interaction At"]) || page.created_time || null,
      dueAt: propertyDate(properties["Reply Due At"]) || null,
    }];
  });

  const calls: PendingWorkCall[] = taskPages.flatMap((page) => {
    const properties = page.properties || {};
    const brandId = firstRelationId(properties["Follow-up Client"]);
    if (!brandId) return [];
    const history = historyFromTask({
      id: page.id,
      notes: propertyText(properties.Notes) || null,
      callReviewHistoryText: propertyText(properties["Call Review History"]) || null,
      endedAt: propertyDate(properties["Ended At"]),
      callReviewStatus: "Awaiting Review",
    });
    const submitted = [...history].reverse().find((round) => round.status === "Awaiting Review" && round.submittedAt && round.callIds.length);
    if (!submitted?.submittedAt) return [];
    return submitted.callIds.map((callId) => ({
      callId,
      taskId: page.id,
      brandId,
      submittedAt: submitted.submittedAt!,
      preview: submitted.callerNote?.trim() || `${submitted.callerName || "Caller"} submitted a call for review`,
      priority: propertyText(properties.Priority) || null,
    }));
  });
  const assignmentCandidates = ownedMetadata.filter(({ brand }) =>
    Boolean(brand.ownerAssignedAt)
    && !brand.ownerAssignmentHandledAt,
  );
  const assignmentBrands = assignmentCandidates.map((item) => item.brand);
  const [assignmentActivities, assignmentTasks] = await Promise.all([
    listFollowupConversationsByBrands(assignmentBrands.map((brand) => brand.id)),
    listFollowupTaskSignalsByBrands(assignmentBrands.map((brand) => brand.id)),
  ]);
  const assignments: PendingWorkAssignment[] = assignmentBrands.flatMap((brand) => {
    const assignedAt = brand.ownerAssignedAt!;
    const completedByOutbound = assignmentActivities.some((activity) =>
      key(activity.brandId || "") === key(brand.id)
      && activity.direction === "Outbound"
      && (activity.recordedAt || activity.createdAt || "") > assignedAt,
    );
    const completedByTask = assignmentTasks.some((task) =>
      key(task.brandId || "") === key(brand.id)
      && (task.createdAt || "") > assignedAt,
    );
    return completedByOutbound || completedByTask ? [] : [{ brandId: brand.id, assignedAt }];
  });
  const deadlineCandidates = ownedMetadata.flatMap(({ page, brand }) =>
    brand.replyDeadline && brand.status !== "Paused" && brand.status !== "Completed" ? [{ page, brand }] : [],
  );
  const deadlineActivities = deadlineCandidates.length
    ? await listFollowupConversationsByBrands(deadlineCandidates.map(({ brand }) => brand.id))
    : [];
  const deadlineSignals = deadlineCandidates.length
    ? await listBrandInteractionSignals(deadlineCandidates.map(({ page }) => page))
    : new Map();
  const replyDeadlines: PendingWorkDeadline[] = deadlineCandidates.flatMap(({ brand }) => {
    const signal = deadlineSignals.get(brand.id);
    const dueAt = expiredUnansweredReplyDeadline({
      deadline: brand.replyDeadline,
      status: brand.status,
      activities: deadlineActivities.filter((activity) => key(activity.brandId || "") === key(brand.id)),
      lastSuccessfulOutboundAt: signal?.lastInteractionDirection === "Outbound" ? signal.lastInteractionAt : null,
      lastReplyAt: signal?.lastReplyAt,
      nowMs: now,
    });
    return dueAt ? [{ brandId: brand.id, dueAt }] : [];
  });

  const brandIds = [...new Set([
    ...replies.map((item) => item.brandId),
    ...calls.map((item) => item.brandId),
    ...assignments.map((item) => item.brandId),
    ...pauses.map((item) => item.brandId),
    ...replyDeadlines.map((item) => item.brandId),
  ].map(key))];
  if (!brandIds.length) return buildBrandWork([], [], []);
  const metadataByKey = new Map(ownedMetadata.map((item) => [key(item.brand.id), item]));
  const metadata = brandIds.flatMap((id) => {
    const item = metadataByKey.get(id);
    return item ? [item] : [];
  });
  const interactionSignals = new Map(deadlineSignals);
  const missingSignalMetadata = metadata.filter(({ brand }) => !interactionSignals.has(brand.id));
  if (missingSignalMetadata.length) {
    const additionalSignals = await listBrandInteractionSignals(missingSignalMetadata.map(({ page }) => page));
    for (const [id, signal] of additionalSignals) interactionSignals.set(id, signal);
  }
  const brands = attachBrandInteractionSignals(metadata.map(({ brand }) => brand), interactionSignals);
  return buildBrandWork(brands, replies, calls, Date.now(), assignments, pauses, replyDeadlines);
}
