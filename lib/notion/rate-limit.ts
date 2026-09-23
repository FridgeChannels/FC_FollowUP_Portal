import { AsyncLocalStorage } from "node:async_hooks";

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_DELAY_MS = 8_000;

export function shouldRetryNotionStatus(status: number) {
  return RETRY_STATUSES.has(status);
}

export function notionRetryDelayMs(response: Response, attempt: number) {
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(400 * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
}

export function notionErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const match = message.match(/Notion (\d{3}):/);
  return match ? Number(match[1]) : null;
}

export function isRetryableNotionError(error: unknown) {
  const status = notionErrorStatus(error);
  return status != null && shouldRetryNotionStatus(status);
}

export function createNotionLimiter(options?: {
  concurrency?: number;
  minIntervalMs?: number;
}) {
  const concurrency = Math.max(1, options?.concurrency ?? 3);
  const minIntervalMs = Math.max(0, options?.minIntervalMs ?? 0);
  let active = 0;
  let coolDownUntil = 0;
  let nextStartAt = 0;
  const waiting: Array<() => void> = [];

  function coolDown(ms: number) {
    if (ms > 0) coolDownUntil = Math.max(coolDownUntil, Date.now() + ms);
  }

  async function schedule<T>(task: () => Promise<T>): Promise<T> {
    while (true) {
      const wait = Math.max(coolDownUntil, nextStartAt) - Date.now();
      if (wait > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, wait);
        });
        continue;
      }
      if (active < concurrency) {
        active += 1;
        nextStartAt = Date.now() + minIntervalMs;
        break;
      }
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  }

  return { schedule, coolDown };
}

type NotionLimiter = ReturnType<typeof createNotionLimiter>;

const notionLimitStore = new AsyncLocalStorage<NotionLimiter>();

export function runWithNotionLimit<T>(fn: () => T): T {
  if (notionLimitStore.getStore()) return fn();
  return notionLimitStore.run(createNotionLimiter(), fn);
}

function requestNotionLimit() {
  return notionLimitStore.getStore() || createNotionLimiter();
}

export function createNotionRetry(options?: {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  schedule?: <T>(task: () => Promise<T>) => Promise<T>;
  coolDown?: (ms: number) => void;
}) {
  const maxAttempts = options?.maxAttempts ?? 5;
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  const schedule = options?.schedule ?? (<T>(task: () => Promise<T>) => task());

  async function fetchWithRetry(doFetch: () => Promise<Response>) {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await schedule(async () => {
        const next = await doFetch();
        if (shouldRetryNotionStatus(next.status) && attempt < maxAttempts) {
          options?.coolDown?.(notionRetryDelayMs(next, attempt));
        }
        return next;
      });
      if (!shouldRetryNotionStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
      const delay = notionRetryDelayMs(response, attempt);
      const retryAfter = response.headers.get("Retry-After");
      console.warn(
        `[notion] ${response.status} on attempt ${attempt}/${maxAttempts}; ` +
          `backing off ${delay}ms` +
          (retryAfter ? ` (Retry-After: ${retryAfter})` : ""),
      );
      await response.text().catch(() => undefined);
      await sleep(delay);
    }
    return response as Response;
  }

  return { fetchWithRetry };
}

export const notionRetry = createNotionRetry({
  schedule: (task) => requestNotionLimit().schedule(task),
  coolDown: (ms) => requestNotionLimit().coolDown(ms),
});
