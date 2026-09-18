import { formatSlackWebhookBody } from "./format.ts";
import type { NotificationEvent, NotifyProvider } from "./types.ts";

const SLACK_TIMEOUT_MS = 3000;

export type SlackWebhookProviderOptions = {
  webhookUrl: string;
  enabled?: boolean;
  contentMaxChars?: number;
  formatDueAt?: (iso: string) => string;
  resolvePortalUrl?: (event: NotificationEvent) => string | null;
  fetchImpl?: typeof fetch;
};

export function createSlackWebhookProvider(
  options: SlackWebhookProviderOptions,
): NotifyProvider {
  const webhookUrl = (options.webhookUrl || "").trim();
  const enabled = options.enabled !== false && !!webhookUrl;
  const contentMaxChars = options.contentMaxChars ?? 300;
  const fetchImpl = options.fetchImpl || fetch;

  return {
    id: "slack",
    enabled,
    async send(event: NotificationEvent) {
      if (!webhookUrl) {
        throw new Error("SLACK_WEBHOOK_URL is empty");
      }
      const payload = formatSlackWebhookBody(event, {
        contentMaxChars,
        formatDueAt: options.formatDueAt,
        resolvePortalUrl: options.resolvePortalUrl,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
      try {
        const response = await fetchImpl(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `Slack webhook HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
          );
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
