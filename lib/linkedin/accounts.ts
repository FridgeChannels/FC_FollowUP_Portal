import { easternDateOnly } from "../scheduling-engine/calendar.ts";
import {
  propertyNumber,
  propertyText,
  queryDatabasePages,
  richText,
  titleFromProperties,
  updatePage,
  type NotionPage,
} from "../notion/client.ts";
import { getFollowupLinkedInAccountDbId } from "../notion/config.ts";
import type { LinkedInAccount, LinkedInAccountStatus } from "./types.ts";

function asStatus(value?: string | null): LinkedInAccountStatus {
  if (value === "Active" || value === "Standby" || value === "Exhausted" || value === "Paused") {
    return value;
  }
  return "Standby";
}

export function currentLinkedInQuotaMonth(now = new Date()) {
  return easternDateOnly(now).slice(0, 7);
}

function mapAccount(page: NotionPage): LinkedInAccount {
  const properties = page.properties || {};
  return {
    id: page.id,
    name: titleFromProperties(properties) || propertyText(properties["Account Name"]) || "Unknown",
    monthlyQuota: Math.max(0, Math.floor(propertyNumber(properties["Monthly Quota"]) ?? 15)),
    monthlyUsedCold: Math.max(0, Math.floor(propertyNumber(properties["Monthly Used Cold"]) ?? 0)),
    status: asStatus(propertyText(properties.Status)),
    sortOrder: propertyNumber(properties["Sort Order"]) ?? 999,
    quotaMonth: propertyText(properties["Quota Month"]) || "",
    notes: propertyText(properties.Notes) || null,
  };
}

let accountCache: { at: number; value: LinkedInAccount[] } | null = null;
const ACCOUNT_CACHE_MS = 15_000;

export function clearLinkedInAccountCache() {
  accountCache = null;
}

export async function listLinkedInAccounts(options: { bypassCache?: boolean } = {}) {
  if (!options.bypassCache && accountCache && Date.now() - accountCache.at < ACCOUNT_CACHE_MS) {
    return accountCache.value.map((item) => ({ ...item }));
  }
  const pages = await queryDatabasePages(getFollowupLinkedInAccountDbId());
  const accounts = pages.map(mapAccount).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  accountCache = { at: Date.now(), value: accounts };
  return accounts.map((item) => ({ ...item }));
}

async function writeAccount(
  account: LinkedInAccount,
  patch: Partial<Pick<LinkedInAccount, "monthlyUsedCold" | "status" | "quotaMonth">>,
) {
  const properties: Record<string, unknown> = {};
  if (patch.monthlyUsedCold !== undefined) {
    properties["Monthly Used Cold"] = { number: patch.monthlyUsedCold };
  }
  if (patch.status !== undefined) {
    properties.Status = { select: { name: patch.status } };
  }
  if (patch.quotaMonth !== undefined) {
    properties["Quota Month"] = { rich_text: richText(patch.quotaMonth) };
  }
  if (!Object.keys(properties).length) return account;
  await updatePage(account.id, properties);
  clearLinkedInAccountCache();
  return { ...account, ...patch };
}

/** Reset counters when the ET calendar month rolls over. */
export async function ensureLinkedInQuotaMonth(now = new Date()) {
  const month = currentLinkedInQuotaMonth(now);
  const accounts = await listLinkedInAccounts({ bypassCache: true });
  const next: LinkedInAccount[] = [];
  for (const account of accounts) {
    if (account.quotaMonth === month) {
      next.push(account);
      continue;
    }
    const status =
      account.status === "Paused"
        ? "Paused"
        : account.status === "Active"
          ? "Active"
          : "Standby";
    next.push(
      await writeAccount(account, {
        monthlyUsedCold: 0,
        quotaMonth: month,
        status: account.status === "Exhausted" ? "Standby" : status,
      }),
    );
  }
  return next;
}

function remaining(account: LinkedInAccount) {
  return Math.max(0, account.monthlyQuota - account.monthlyUsedCold);
}

async function promoteNextActive(accounts: LinkedInAccount[], exceptId?: string) {
  const candidate = accounts.find(
    (item) =>
      item.id !== exceptId &&
      item.status !== "Paused" &&
      item.status !== "Active" &&
      remaining(item) > 0,
  );
  if (!candidate) return null;
  return writeAccount(candidate, { status: "Active" });
}

export async function resolveActiveLinkedInAccount(now = new Date()) {
  let accounts = await ensureLinkedInQuotaMonth(now);
  let active = accounts.find((item) => item.status === "Active" && item.status !== "Paused");
  if (active && remaining(active) <= 0) {
    await writeAccount(active, { status: "Exhausted" });
    accounts = await listLinkedInAccounts({ bypassCache: true });
    active = undefined;
  }
  if (!active) {
    const promoted = await promoteNextActive(accounts);
    if (!promoted) {
      return {
        ok: false as const,
        error: "Monthly LinkedIn cold-outreach quota is exhausted, or no active sender is available.",
        accounts,
      };
    }
    accounts = await listLinkedInAccounts({ bypassCache: true });
    active = accounts.find((item) => item.id === promoted.id);
  }
  if (!active || remaining(active) <= 0) {
    return {
      ok: false as const,
      error: "The active LinkedIn sender has no remaining monthly quota.",
      accounts,
    };
  }
  return { ok: true as const, account: active, accounts };
}

export async function reserveLinkedInColdQuota(accountId: string, now = new Date()) {
  const accounts = await ensureLinkedInQuotaMonth(now);
  const account = accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("LinkedIn sender account not found");
  if (account.status === "Paused") throw new Error(`LinkedIn sender ${account.name} is paused`);
  if (remaining(account) <= 0) {
    throw new Error(`LinkedIn sender ${account.name} has no remaining monthly cold-outreach quota`);
  }
  const monthlyUsedCold = account.monthlyUsedCold + 1;
  const exhausted = monthlyUsedCold >= account.monthlyQuota;
  const updated = await writeAccount(account, {
    monthlyUsedCold,
    status: exhausted ? "Exhausted" : account.status === "Active" ? "Active" : account.status,
  });
  if (exhausted) {
    const refreshed = await listLinkedInAccounts({ bypassCache: true });
    await promoteNextActive(refreshed, account.id);
  }
  return updated;
}

export async function releaseLinkedInColdQuota(senderAccount: string, now = new Date()) {
  const accounts = await ensureLinkedInQuotaMonth(now);
  const account = accounts.find(
    (item) => item.name.trim().toLowerCase() === senderAccount.trim().toLowerCase(),
  );
  if (!account) return null;
  const monthlyUsedCold = Math.max(0, account.monthlyUsedCold - 1);
  const status =
    account.status === "Exhausted" && monthlyUsedCold < account.monthlyQuota
      ? "Standby"
      : account.status;
  return writeAccount(account, { monthlyUsedCold, status });
}
