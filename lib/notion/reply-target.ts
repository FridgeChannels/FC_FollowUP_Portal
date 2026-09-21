import type { BrandActivity, BrandContact, BrandListItem, BrandTask } from "../brand-list";
import { endpointForChannel } from "../channel-availability";
import { firstRelationId, queryFollowupClientPages, retrievePage } from "./client";
import { listFollowupContacts } from "./contacts";
import { findConversationsByThreadId } from "./conversations";
import { mapFollowupClientPage, mapFollowupClientPages } from "./followup-clients";
import { isOpenTaskStatus } from "./reply-inbox";
import {
  findFollowupTasksByTitle,
  isNotionPageId,
  listFollowupTasks,
  retrieveFollowupTask,
  taskMatchesRef,
} from "./tasks";

export type ReplyTarget = {
  brand: BrandListItem;
  contact: BrandContact;
  task: BrandTask | null;
  outbound?: BrandActivity | null;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function senderForChannel(contact: BrandContact, channel: string) {
  return endpointForChannel(contact, channel);
}

export function pickReplyTaskForChannel(
  tasks: BrandTask[],
  contactId: string,
  channel: string,
) {
  const candidates = tasks.filter(
    (item) => item.contactId === contactId && item.channel === channel,
  );
  return (
    candidates.find((item) => isOpenTaskStatus(item.status) && item.sourceBombId) ||
    candidates.find((item) => isOpenTaskStatus(item.status)) ||
    candidates.at(-1) ||
    null
  );
}

export function pickCurrentContact(contacts: BrandContact[], tasks: BrandTask[] = []) {
  if (!contacts.length) return null;
  const openTaskContactIds = new Set(
    tasks
      .filter((item) => isOpenTaskStatus(item.status) && item.contactId)
      .map((item) => item.contactId),
  );
  const inProgress = contacts.filter((item) => item.followupStatus === "In Progress");
  const notClosed = contacts.filter(
    (item) => item.followupStatus !== "Completed" && item.followupStatus !== "Terminated",
  );
  const pool = inProgress.length ? inProgress : notClosed.length ? notClosed : contacts;
  const orderOf = (item: BrandContact) =>
    item.contactOrder === "Primary" ? 0 : item.contactOrder === "Secondary" ? 1 : item.contactOrder === "Backup" ? 2 : 9;

  return [...pool].sort((a, b) => {
    const aOpen = openTaskContactIds.has(a.id) ? 0 : 1;
    const bOpen = openTaskContactIds.has(b.id) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    const order = orderOf(a) - orderOf(b);
    if (order) return order;
    return (b.lastInteractionAt || "").localeCompare(a.lastInteractionAt || "") || a.name.localeCompare(b.name);
  })[0];
}

export async function findFollowupClientsByName(name: string) {
  const query = normalizeName(name);
  if (!query) return [];
  const brands = await mapFollowupClientPages(
    await queryFollowupClientPages(undefined, { includeTest: true }),
  );
  const exact = brands.filter((item) => normalizeName(item.name) === query);
  if (exact.length) return exact;
  return brands.filter((item) => {
    const value = normalizeName(item.name);
    return value.includes(query) || query.includes(value);
  });
}

export async function resolveCurrentContactForBrand(
  brandId: string,
  channel?: string,
): Promise<
  | { ok: true; target: ReplyTarget }
  | { ok: false; status: number; error: string }
> {
  const page = await retrievePage(brandId).catch(() => null);
  if (!page) return { ok: false, status: 404, error: "Brand not found" };
  const brand = await mapFollowupClientPage(page);
  const contacts = await listFollowupContacts(brand.id);
  if (!contacts.length) {
    return { ok: false, status: 422, error: `${brand.name} has no Follow-up Contact` };
  }
  const tasks = await listFollowupTasks(contacts.map((item) => item.id));
  const contact = pickCurrentContact(contacts, tasks);
  if (!contact) {
    return { ok: false, status: 422, error: `${brand.name} has no Follow-up Contact` };
  }
  const task = channel
    ? pickReplyTaskForChannel(tasks, contact.id, channel)
    : tasks.find((item) => item.contactId === contact.id && isOpenTaskStatus(item.status) && item.sourceBombId) ||
      tasks.find((item) => item.contactId === contact.id && isOpenTaskStatus(item.status)) ||
      tasks.find((item) => item.contactId === contact.id) ||
      null;
  return { ok: true, target: { brand, contact, task } };
}

export async function resolveReplyTargetByBrandName(
  name: string,
  channel?: string,
): Promise<
  | { ok: true; target: ReplyTarget }
  | { ok: false; status: number; error: string }
> {
  const query = name.trim();
  if (!query) return { ok: false, status: 400, error: "Brand name is required" };
  const matches = await findFollowupClientsByName(query);
  if (!matches.length) {
    return { ok: false, status: 404, error: `No Follow-up Client matches "${query}"` };
  }
  if (matches.length > 1) {
    const names = matches.map((item) => item.name).join(", ");
    return {
      ok: false,
      status: 409,
      error: `Multiple Follow-up Clients match "${query}": ${names}`,
    };
  }
  return resolveCurrentContactForBrand(matches[0].id, channel);
}

async function resolveRequestedTask(
  taskRef: string | undefined,
  items: BrandActivity[],
): Promise<
  | { ok: true; task: BrandTask | null }
  | { ok: false; status: number; error: string }
> {
  const value = taskRef?.trim();
  if (!value) return { ok: true, task: null };

  if (isNotionPageId(value)) {
    const task = await retrieveFollowupTask(value).catch(() => null);
    if (!task) return { ok: false, status: 404, error: "Follow-up Task not found" };
    return { ok: true, task };
  }

  const contactIds = [...new Set(items.map((item) => item.contactId).filter((id): id is string => !!id))];
  const fromThread = contactIds.length ? await listFollowupTasks(contactIds) : [];
  const titled = fromThread.filter((item) => taskMatchesRef(item, value));
  const fallback = titled.length ? titled : (await findFollowupTasksByTitle(value)).filter((item) => taskMatchesRef(item, value));
  if (!fallback.length) {
    return {
      ok: false,
      status: 404,
      error: `Follow-up Task "${value}" not found. Use the Notion page ID or the exact task title.`,
    };
  }

  const threadTaskIds = new Set(items.map((item) => item.taskId).filter((id): id is string => !!id));
  const conversationIds = new Set(items.map((item) => item.id));
  const onThread = fallback.filter(
    (item) => threadTaskIds.has(item.id) || item.conversationIds.some((id) => conversationIds.has(id)),
  );
  const matches = onThread.length ? onThread : fallback;
  if (matches.length > 1) {
    return {
      ok: false,
      status: 409,
      error: `Multiple Follow-up Tasks match "${value}". Pass the Task page ID.`,
    };
  }
  return { ok: true, task: matches[0] };
}

export function pickOutboundForTaskThread(
  items: BrandActivity[],
  taskId?: string | null,
  conversationIds: string[] = [],
) {
  if (taskId) {
    return (
      items.find((item) => item.direction === "Outbound" && item.taskId === taskId) ||
      items.find((item) => item.direction === "Outbound" && conversationIds.includes(item.id)) ||
      null
    );
  }
  return items.find((item) => item.direction === "Outbound") || items[0] || null;
}

export async function resolveReplyTargetByThreadId(
  threadId: string,
  taskId?: string,
): Promise<
  | { ok: true; target: ReplyTarget }
  | { ok: false; status: number; error: string }
> {
  const query = threadId.trim();
  if (!query) return { ok: false, status: 400, error: "Thread ID is required" };
  const items = await findConversationsByThreadId(query);
  if (!items.length) {
    return { ok: false, status: 404, error: `No conversation matches Thread ID "${query}"` };
  }
  const requested = await resolveRequestedTask(taskId, items);
  if (!requested.ok) return requested;
  const requestedTask = requested.task;
  const outbound = pickOutboundForTaskThread(
    items,
    requestedTask?.id,
    requestedTask?.conversationIds || [],
  );
  if (requestedTask && !outbound) {
    return {
      ok: false,
      status: 409,
      error: "Follow-up Task does not match this Thread ID",
    };
  }
  if (!outbound?.contactId) {
    return { ok: false, status: 422, error: `Thread ID "${query}" has no Follow-up Contact` };
  }
  if (requestedTask?.contactId && requestedTask.contactId !== outbound.contactId) {
    return {
      ok: false,
      status: 409,
      error: "Follow-up Task and Thread ID belong to different contacts",
    };
  }
  if (requestedTask?.channel && outbound.channel && requestedTask.channel !== outbound.channel) {
    return {
      ok: false,
      status: 400,
      error: `Follow-up Task is ${requestedTask.channel}, Thread ID is ${outbound.channel}`,
    };
  }
  const contactPage = await retrievePage(outbound.contactId).catch(() => null);
  if (!contactPage) return { ok: false, status: 404, error: "Contact not found" };
  const brandId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
  if (!brandId) return { ok: false, status: 422, error: "Contact has no Follow-up Client" };
  const brand = await mapFollowupClientPage(await retrievePage(brandId));
  const contacts = await listFollowupContacts(brand.id, [outbound.contactId]);
  const contact = contacts.find((item) => item.id === outbound.contactId);
  if (!contact) return { ok: false, status: 404, error: "Contact not found on this brand" };
  const task = requestedTask
    || (outbound.taskId
      ? await retrieveFollowupTask(outbound.taskId).catch(() => null)
      : outbound.channel
        ? pickReplyTaskForChannel(
            await listFollowupTasks([contact.id]),
            contact.id,
            outbound.channel,
          )
        : null);
  return { ok: true, target: { brand, contact, task, outbound } };
}
