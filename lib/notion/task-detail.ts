import type { BrandActivity, BrandContact, BrandDetail, BrandTask, CurrentCpOption } from "../brand-list";
import { brandInitials, listApplicableCps } from "../brand-list";
import { retrievePage } from "./client";
import { listFollowupContacts, retrieveFollowupContact } from "./contacts";
import { findQuoCallConversation, listConversationsByIds, listFollowupConversations } from "./conversations";
import { listCheckpoints } from "./cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "./followup-clients";
import { annotateTasksWithReplyInbox } from "./reply-inbox";
import { getWarmDashboardTask, listFollowupTasks, retrieveFollowupTask, type TaskResolveHints } from "./tasks";
import { updateFollowupTask } from "./followup-writes";
import {
  encodeCallReviewHistory,
  hasDuplicateCallReviewHistory,
  historyFromTask,
  latestQualifiedAt,
  latestUnqualifiedReason,
  notesContainCallReviewHistory,
  stripCallReviewHistoryFromNotes,
  withInheritedCallIds,
} from "../call-review-history";

function callIdsFromActivities(task: BrandTask, activities: BrandActivity[]) {
  return [...new Set(
    activities
      .filter((item) => item.taskId === task.id || (!item.taskId && task.conversationIds.includes(item.id)))
      .map((item) => item.quo?.callId)
      .filter((id): id is string => !!id),
  )];
}

async function hydrateTaskReviewRounds(task: BrandTask, activities: BrandActivity[]): Promise<BrandTask> {
  const previous = historyFromTask(task);
  const history = withInheritedCallIds(previous, callIdsFromActivities(task, activities));
  const historyChanged = JSON.stringify(history) !== JSON.stringify(previous);
  const notesDirty =
    notesContainCallReviewHistory(task.notes) || hasDuplicateCallReviewHistory(task.notes);
  const columnMissing = history.length > 0 && !task.callReviewHistoryText?.trim();
  const expectedReason =
    task.callReviewStatus === "Unqualified"
      ? (task.callReviewReason?.trim() || latestUnqualifiedReason(history) || null)
      : task.callReviewReason?.trim() || null;
  const expectedQualifiedAt =
    task.callReviewStatus === "Qualified"
      ? (task.callQualifiedAt || latestQualifiedAt(history) || null)
      : null;
  const reasonNeedsSync =
    task.callReviewStatus === "Unqualified"
      && !!expectedReason
      && expectedReason !== (task.callReviewReason || null);
  const qualifiedAtNeedsSync =
    (task.callReviewStatus === "Qualified" && !!expectedQualifiedAt && expectedQualifiedAt !== (task.callQualifiedAt || null))
    || (task.callReviewStatus === "Unqualified" && !!task.callQualifiedAt);

  if (!historyChanged && !notesDirty && !columnMissing && !reasonNeedsSync && !qualifiedAtNeedsSync) {
    return { ...task, callReviewHistory: history };
  }

  const notes = stripCallReviewHistoryFromNotes(task.notes);
  const callReviewHistoryText = encodeCallReviewHistory(history);
  const patch: {
    notes?: string | null;
    callReviewHistory?: string | null;
    callReviewReason?: string | null;
    callQualifiedAt?: string | null;
  } = {
    callReviewHistory: callReviewHistoryText || null,
  };
  if (notes !== (task.notes || "").trim()) patch.notes = notes || null;
  if (task.callReviewStatus === "Unqualified") {
    if (expectedReason) patch.callReviewReason = expectedReason;
    if (task.callQualifiedAt) patch.callQualifiedAt = null;
  } else if (task.callReviewStatus === "Qualified") {
    if (expectedQualifiedAt && !task.callQualifiedAt) patch.callQualifiedAt = expectedQualifiedAt;
    if (task.callReviewReason) patch.callReviewReason = null;
  }

  await updateFollowupTask(task.id, patch).catch(() => undefined);
  return {
    ...task,
    notes: patch.notes !== undefined ? patch.notes : task.notes,
    callReviewHistoryText: callReviewHistoryText || null,
    callReviewHistory: history,
    callReviewReason: patch.callReviewReason !== undefined ? patch.callReviewReason : task.callReviewReason,
    callQualifiedAt: patch.callQualifiedAt !== undefined ? patch.callQualifiedAt : task.callQualifiedAt,
  };
}

export type TaskDetailPayload = {
  task: BrandTask;
  activities: BrandActivity[];
  brand: BrandDetail | null;
  cps: CurrentCpOption[];
};

function contactShellFromTask(task: BrandTask): BrandContact[] {
  if (!task.contactId) return [];
  const phone = task.contactPhone || null;
  return [{
    id: task.contactId,
    name: task.contactName || "Contact",
    role: "Other",
    title: null,
    contactRole: null,
    email: null,
    phone,
    directPhone: null,
    officePhone: null,
    linkedin: null,
    emailValid: false,
    phoneValid: !!phone,
    followupStatus: null,
    followupMode: null,
    contactOrder: null,
    notes: null,
    lastInteractionAt: null,
  }];
}

function brandShellFromTask(
  task: BrandTask,
  contacts: BrandDetail["contacts"],
  tasks: BrandTask[],
): BrandDetail {
  const name = task.brandName || "Untitled brand";
  return {
    id: task.brandId || task.id,
    name,
    initials: brandInitials(name),
    currentCp: "NONE",
    currentCpId: null,
    status: "Ready",
    handlingMode: null,
    lastInteractionAt: null,
    lastInteractionChannel: null,
    lastInteractionDirection: null,
    lastInteractionStatus: null,
    lastInteractionCallResult: null,
    lastReplyAt: null,
    ownerId: task.brandOwnerId || task.ownerId,
    ownerName: task.ownerName,
    ownerEmail: null,
    priority: null,
    notes: null,
    humanNotes: null,
    createdAt: null,
    lastEditedAt: null,
    currentCpFullName: null,
    currentCpDefinition: null,
    productDescription: null,
    matchedCategory: null,
    icpGroup: null,
    followupExhibition: null,
    meetingNotes: [],
    aiMeetingLinks: [],
    contacts,
    tasks,
    activities: [],
  };
}

/** Full AM/Admin payload — brand detail + all contact conversations. */
export async function buildTaskDetailPayload(id: string, useDashboardCache = false): Promise<TaskDetailPayload> {
  const task = useDashboardCache ? getWarmDashboardTask(id) || await retrieveFollowupTask(id) : await retrieveFollowupTask(id);
  const [byIds, byContact, brand, cps] = await Promise.all([
    listConversationsByIds(task.conversationIds),
    task.contactId ? listFollowupConversations([task.contactId]) : Promise.resolve([]),
    task.brandId
      ? retrievePage(task.brandId).then(mapFollowupClientDetail).catch(() => null)
      : Promise.resolve(null),
    listCheckpoints(),
  ]);
  const seen = new Set<string>();
  const activities = [...byIds, ...byContact].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const [annotated] = annotateTasksWithReplyInbox([task], activities);
  const hydrated = await hydrateTaskReviewRounds(annotated || task, activities);
  return { task: hydrated, activities, brand, cps };
}

/**
 * Dashboard is a call-review surface. It only needs the selected Phone task and
 * its phone history, not the whole brand's contacts, messages, meetings, and
 * tasks. Keeping that broad query out of this path makes opening a KPI row fast.
 */
export async function buildDashboardTaskDetailPayload(
  id: string,
  selectedCallId?: string | null,
): Promise<TaskDetailPayload> {
  const task = getWarmDashboardTask(id) || await retrieveFollowupTask(id);
  // The dashboard already identifies the exact call. Querying it directly avoids
  // downloading the contact's full message history before the detail can render.
  const selectedCall = selectedCallId
    ? await findQuoCallConversation(selectedCallId, { includeCheckpoint: false })
    : [];
  const activities = selectedCall.some(
    (item) => item.channel === "Phone" && (item.taskId === task.id || task.conversationIds.includes(item.id)),
  )
    ? selectedCall.filter((item) => item.channel === "Phone")
    : task.contactId
      ? (await listFollowupConversations([task.contactId])).filter((item) => item.channel === "Phone")
      : await listConversationsByIds(task.conversationIds);
  const [annotated] = annotateTasksWithReplyInbox([task], activities);
  const hydrated = await hydrateTaskReviewRounds(annotated || task, activities);
  const contacts = contactShellFromTask(hydrated);
  return {
    task: hydrated,
    activities,
    brand: brandShellFromTask(hydrated, contacts, [hydrated]),
    cps: listApplicableCps(),
  };
}

/**
 * Caller / lite payload: brand-scoped Phone work.
 * Loads all Phone tasks/contacts on the Follow-up Client; skips non-Phone meta.
 */
export async function buildCallerTaskDetailPayload(id: string, useDashboardCache = false): Promise<TaskDetailPayload> {
  const task = useDashboardCache ? getWarmDashboardTask(id) || await retrieveFollowupTask(id) : await retrieveFollowupTask(id);
  const contactId = task.contactId;
  const brandId = task.brandId;

  const [brandContacts, brandList] = await Promise.all([
    brandId ? listFollowupContacts(brandId).catch(() => []) : Promise.resolve([]),
    brandId
      ? retrievePage(brandId).then((page) => mapFollowupClientPage(page)).catch(() => null)
      : Promise.resolve(null),
  ]);

  const contactsById = new Map<string, { name: string | null; phone: string | null }>(
    brandContacts.map((item) => [item.id, { name: item.name, phone: item.phone || null }]),
  );
  if (contactId && !contactsById.has(contactId)) {
    contactsById.set(contactId, { name: task.contactName, phone: task.contactPhone || null });
  }

  const hints: TaskResolveHints | undefined = brandId
    ? {
        brand: {
          id: brandId,
          name: task.brandName || brandList?.name || "Untitled brand",
          ownerId: task.brandOwnerId || brandList?.ownerId || null,
          isTest: task.brandIsTest || brandList?.isTest,
        },
        contactsById,
      }
    : undefined;

  const contactIds = brandContacts.length
    ? brandContacts.map((item) => item.id)
    : contactId
      ? [contactId]
      : [];

  const [phoneActivities, phoneTasks, fallbackContact] = await Promise.all([
    contactIds.length
      ? listFollowupConversations(contactIds).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        )
      : listConversationsByIds(task.conversationIds).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        ),
    contactIds.length
      ? listFollowupTasks(contactIds, hints).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        )
      : Promise.resolve(task.channel === "Phone" ? [task] : []),
    !brandContacts.length && contactId
      ? retrieveFollowupContact(contactId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const contacts = brandContacts.length
    ? brandContacts
    : fallbackContact
      ? [fallbackContact]
      : [];
  const byId = new Map(phoneTasks.map((item) => [item.id, item]));
  if (task.channel === "Phone" && !byId.has(task.id)) byId.set(task.id, task);
  const tasks = [...byId.values()];

  const brand: BrandDetail | null = brandList
    ? {
        ...brandList,
        name: brandList.name || task.brandName || "Untitled brand",
        priority: null,
        notes: null,
        humanNotes: null,
        createdAt: null,
        lastEditedAt: null,
        currentCpFullName: null,
        currentCpDefinition: null,
        productDescription: null,
        matchedCategory: null,
        icpGroup: null,
        followupExhibition: null,
        meetingNotes: [],
        aiMeetingLinks: [],
        contacts,
        tasks,
        activities: [],
      }
    : brandShellFromTask(task, contacts, tasks);

  const hydrated = await hydrateTaskReviewRounds(task, phoneActivities);
  const nextTasks = tasks.map((item) => item.id === hydrated.id ? hydrated : item);
  return {
    task: hydrated,
    activities: phoneActivities,
    brand: brand ? { ...brand, tasks: nextTasks } : brand,
    cps: listApplicableCps(),
  };
}
