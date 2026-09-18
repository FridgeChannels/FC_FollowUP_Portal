import type { BrandActivity, BrandDetail, BrandTask, CurrentCpOption } from "../brand-list";
import { brandInitials, listApplicableCps } from "../brand-list";
import { retrievePage } from "./client";
import { listFollowupContacts, retrieveFollowupContact } from "./contacts";
import { listConversationsByIds, listFollowupConversations } from "./conversations";
import { listCheckpoints } from "./cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "./followup-clients";
import { annotateTasksWithReplyInbox } from "./reply-inbox";
import { listFollowupTasks, retrieveFollowupTask, type TaskResolveHints } from "./tasks";
import { updateFollowupTask } from "./followup-writes";
import { historyFromTask, withInheritedCallIds, writeCallReviewHistory } from "../call-review-history";

function callIdsFromActivities(task: BrandTask, activities: BrandActivity[]) {
  return [...new Set(
    activities
      .filter((item) => item.taskId === task.id || (!item.taskId && task.conversationIds.includes(item.id)))
      .map((item) => item.quo?.callId)
      .filter((id): id is string => !!id),
  )];
}

async function hydrateTaskReviewRounds(task: BrandTask, activities: BrandActivity[]): Promise<BrandTask> {
  const history = withInheritedCallIds(historyFromTask(task), callIdsFromActivities(task, activities));
  const previous = historyFromTask(task);
  const changed = JSON.stringify(history) !== JSON.stringify(previous);
  if (!changed) return { ...task, callReviewHistory: history };
  const notes = writeCallReviewHistory(task.notes, history);
  await updateFollowupTask(task.id, { notes }).catch(() => undefined);
  return { ...task, notes, callReviewHistory: history };
}

export type TaskDetailPayload = {
  task: BrandTask;
  activities: BrandActivity[];
  brand: BrandDetail | null;
  cps: CurrentCpOption[];
};

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
    createdAt: null,
    lastEditedAt: null,
    currentCpFullName: null,
    currentCpDefinition: null,
    productDescription: null,
    matchedCategory: null,
    followupExhibition: null,
    meetingNotes: [],
    contacts,
    tasks,
    activities: [],
  };
}

/** Full AM/Admin payload — brand detail + all contact conversations. */
export async function buildTaskDetailPayload(id: string): Promise<TaskDetailPayload> {
  const task = await retrieveFollowupTask(id);
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
 * Caller / lite payload: brand-scoped Phone work.
 * Loads all Phone tasks/contacts on the Follow-up Client; skips non-Phone meta.
 */
export async function buildCallerTaskDetailPayload(id: string): Promise<TaskDetailPayload> {
  const task = await retrieveFollowupTask(id);
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
        createdAt: null,
        lastEditedAt: null,
        currentCpFullName: null,
        currentCpDefinition: null,
        productDescription: null,
        matchedCategory: null,
        followupExhibition: null,
        meetingNotes: [],
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
