import type { BrandTask } from "../brand-list";
import { matchOpenPhoneTask, phoneLineCounterparty } from "../quo/phone-line";
import type { QuoCall } from "../quo/types";
import { listOpenPhoneTasks } from "./tasks";

/**
 * Open Phone Task by counterparty number.
 * Does not read Call ID, dial attempts, or cold-inbound contacts.
 */
export async function resolveOpenPhoneTaskForQuoCall(call?: QuoCall | null): Promise<BrandTask | null> {
  const phone = phoneLineCounterparty(call);
  if (!phone) return null;
  const tasks = await listOpenPhoneTasks();
  return matchOpenPhoneTask(phone, tasks);
}
