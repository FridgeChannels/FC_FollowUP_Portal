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
      return Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }
  return Math.min(400 * 2 ** Math.max(0, attempt - 1), MAX_DELAY_MS);
}

export function createNotionRetry(options?: {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const maxAttempts = options?.maxAttempts ?? 5;
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));

  async function fetchWithRetry(doFetch: () => Promise<Response>) {
    let response: Response | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      response = await doFetch();
      if (!shouldRetryNotionStatus(response.status) || attempt === maxAttempts) {
        return response;
      }
      await response.text().catch(() => undefined);
      await sleep(notionRetryDelayMs(response, attempt));
    }
    return response as Response;
  }

  return { fetchWithRetry };
}

export const notionRetry = createNotionRetry();
