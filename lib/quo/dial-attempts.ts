import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const DIAL_ATTEMPT_TTL_MS = 30 * 60 * 1000;

export type QuoDialAttempt = {
  taskId: string;
  phone: string;
  contactId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  contactName?: string | null;
  channel?: string | null;
  dialedAt: string;
};

const memoryByPath = new Map<string, QuoDialAttempt[]>();

export function normalizeDialPhone(value?: string | null) {
  return (value || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

export function dialAttemptsPath() {
  return (
    (typeof process !== "undefined" ? process.env.QUO_DIAL_ATTEMPTS_PATH : "") ||
    join(tmpdir(), "fc-followup-quo-dial-attempts.json")
  );
}

function isFresh(attempt: QuoDialAttempt, at = Date.now()) {
  const dialedAt = new Date(attempt.dialedAt).getTime();
  return Number.isFinite(dialedAt) && Math.abs(at - dialedAt) <= DIAL_ATTEMPT_TTL_MS;
}

function asAttempts(value: unknown): QuoDialAttempt[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { attempts?: unknown }).attempts)
      ? (value as { attempts: unknown[] }).attempts
      : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<QuoDialAttempt>;
    if (typeof row.taskId !== "string" || typeof row.phone !== "string" || typeof row.dialedAt !== "string") {
      return [];
    }
    return [{
      taskId: row.taskId,
      phone: normalizeDialPhone(row.phone),
      contactId: row.contactId || null,
      brandId: row.brandId || null,
      brandName: row.brandName || null,
      contactName: row.contactName || null,
      channel: row.channel || null,
      dialedAt: row.dialedAt,
    }];
  });
}

async function loadAttempts() {
  const path = dialAttemptsPath();
  try {
    const parsed = asAttempts(JSON.parse(await readFile(path, "utf8")));
    const fresh = parsed.filter((item) => isFresh(item));
    memoryByPath.set(path, fresh);
    return fresh;
  } catch {
    return (memoryByPath.get(path) || []).filter((item) => isFresh(item));
  }
}

async function saveAttempts(attempts: QuoDialAttempt[]) {
  const path = dialAttemptsPath();
  const fresh = attempts.filter((item) => isFresh(item));
  memoryByPath.set(path, fresh);
  try {
    await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
    await writeFile(path, `${JSON.stringify({ attempts: fresh }, null, 2)}\n`);
  } catch (error) {
    console.error("Unable to persist Quo dial attempts to disk; using in-process memory.", error);
  }
  return fresh;
}

export async function recordQuoDialAttempt(input: {
  taskId: string;
  phone?: string | null;
  contactId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  contactName?: string | null;
  channel?: string | null;
}) {
  const phone = normalizeDialPhone(input.phone);
  if (!input.taskId.trim()) throw new Error("Dial attempt requires a Follow-up Task");
  if (!phone) throw new Error("Dial attempt requires a phone number");
  const next: QuoDialAttempt = {
    taskId: input.taskId,
    phone,
    contactId: input.contactId || null,
    brandId: input.brandId || null,
    brandName: input.brandName || null,
    contactName: input.contactName || null,
    channel: input.channel || "Phone",
    dialedAt: new Date().toISOString(),
  };
  const attempts = (await loadAttempts()).filter((item) => item.taskId !== input.taskId);
  await saveAttempts([next, ...attempts]);
  return next;
}

export async function findRecentQuoDialAttempt(
  phones: Iterable<string | null | undefined>,
  eventAt?: string | null,
) {
  const numbers = new Set(
    [...phones].map((value) => normalizeDialPhone(value)).filter(Boolean),
  );
  if (!numbers.size) return null;
  const at = new Date(eventAt || Date.now()).getTime();
  const eventTime = Number.isFinite(at) ? at : Date.now();
  const matches = (await loadAttempts()).filter(
    (item) => numbers.has(item.phone) && isFresh(item, eventTime),
  );
  return matches.sort((left, right) => right.dialedAt.localeCompare(left.dialedAt))[0] || null;
}

export async function removeQuoDialAttempt(taskId: string) {
  const id = taskId.trim();
  if (!id) return [];
  const remaining = (await loadAttempts()).filter((item) => item.taskId !== id);
  return saveAttempts(remaining);
}
