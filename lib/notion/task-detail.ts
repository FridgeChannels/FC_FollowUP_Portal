import type { BrandActivity, BrandDetail, BrandTask, CurrentCpOption } from "../brand-list";
import { brandInitials } from "../brand-list";
import { retrievePage } from "./client";
import { retrieveFollowupContact } from "./contacts";
import { listConversationsByIds, listFollowupConversations } from "./conversations";
import { listCheckpoints } from "./cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "./followup-clients";
import { annotateTasksWithReplyInbox } from "./reply-inbox";
import { listFollowupTasks, retrieveFollowupTask, type TaskResolveHints } from "./tasks";

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
  return { task: annotated || task, activities, brand, cps };
}

/**
 * Caller / lite payload: current Phone task context only.
 * Skips company/category/exhibition/bomb meta and non-Phone brand work.
 */
export async function buildCallerTaskDetailPayload(id: string): Promise<TaskDetailPayload> {
  const task = await retrieveFollowupTask(id);
  const contactId = task.contactId;

  const hints: TaskResolveHints | undefined = task.brandId
    ? {
        brand: {
          id: task.brandId,
          name: task.brandName || "Untitled brand",
          ownerId: task.brandOwnerId,
        },
        contactsById: contactId
          ? new Map([[contactId, { name: task.contactName, phone: task.contactPhone || null }]])
          : undefined,
      }
    : undefined;

  const [phoneActivities, phoneTasks, contact, brandList] = await Promise.all([
    contactId
      ? listFollowupConversations([contactId]).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        )
      : listConversationsByIds(task.conversationIds).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        ),
    contactId
      ? listFollowupTasks([contactId], hints).then((items) =>
          items.filter((item) => item.channel === "Phone"),
        )
      : Promise.resolve(task.channel === "Phone" ? [task] : []),
    contactId
      ? retrieveFollowupContact(contactId).catch(() => null)
      : Promise.resolve(null),
    task.brandId
      ? retrievePage(task.brandId).then((page) => mapFollowupClientPage(page)).catch(() => null)
      : Promise.resolve(null),
  ]);

  const contacts = contact ? [contact] : [];
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
        contacts,
        tasks,
        activities: [],
      }
    : brandShellFromTask(task, contacts, tasks);

  return { task, activities: phoneActivities, brand, cps: [] };
}
