export const WEBHOOK_JOB_MAX_ATTEMPTS = 3;
const WEBHOOK_JOB_MAX_DELAY_MS = 8_000;

export function isRetryableQuoWebhookError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/Notion (400|401|403|404)\b/.test(message)) return false;
  if (/Notion (429|502|503|504)\b/.test(message)) return true;
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|UND_ERR/i.test(message);
}

export function webhookJobRetryDelayMs(attempt: number) {
  return Math.min(500 * 2 ** Math.max(0, attempt - 1), WEBHOOK_JOB_MAX_DELAY_MS);
}

export async function runWithLimitedRetries<T>(
  run: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    shouldRetry?: (error: unknown) => boolean;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (error: unknown, attempt: number) => void;
  },
) {
  const maxAttempts = options?.maxAttempts ?? WEBHOOK_JOB_MAX_ATTEMPTS;
  const shouldRetry = options?.shouldRetry ?? isRetryableQuoWebhookError;
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || attempt === maxAttempts) break;
      options?.onRetry?.(error, attempt);
      await sleep(webhookJobRetryDelayMs(attempt));
    }
  }
  throw lastError;
}
