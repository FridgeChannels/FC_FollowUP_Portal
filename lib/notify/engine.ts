import { formatScheduledDateTime } from "../display-time.ts";
import {
  eventTypeEnabled,
  getNotifyContentMaxChars,
  getSlackWebhookUrl,
  isNotifyEnabled,
  isSlackNotifyEnabled,
  portalBrandUrl,
  shouldNotifyPhone,
} from "./config.ts";
import { emitNotification as emitNotificationCore } from "./core.ts";
import { createSlackWebhookProvider } from "./slack-provider.ts";
import type { NotificationEvent, NotifyProvider } from "./types.ts";

export type EmitOptions = {
  providers?: NotifyProvider[];
  isEnabled?: () => boolean;
  eventAllowed?: (event: NotificationEvent) => boolean;
};

function defaultEventAllowed(event: NotificationEvent) {
  if (!eventTypeEnabled(event.eventType)) return false;
  if (event.channel === "Phone" && !shouldNotifyPhone()) return false;
  return true;
}

function defaultProviders(): NotifyProvider[] {
  return [
    createSlackWebhookProvider({
      webhookUrl: getSlackWebhookUrl(),
      enabled: isSlackNotifyEnabled(),
      contentMaxChars: getNotifyContentMaxChars(),
      formatDueAt: (iso) => formatScheduledDateTime(iso) || iso,
      resolvePortalUrl: (event) => portalBrandUrl(event.brandId),
    }),
  ];
}

/** Fan-out using env-backed defaults (or injectable overrides). */
export async function emitNotification(
  event: NotificationEvent,
  options: EmitOptions = {},
): Promise<void> {
  await emitNotificationCore(event, {
    providers: options.providers ?? defaultProviders(),
    isEnabled: options.isEnabled ?? isNotifyEnabled,
    eventAllowed: options.eventAllowed ?? defaultEventAllowed,
  });
}

/** Fire-and-forget — safe on API success paths. */
export function emitNotificationSafe(
  event: NotificationEvent,
  options: EmitOptions = {},
): void {
  void emitNotification(event, options).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("notify emit failed", { eventType: event.eventType, error: message });
  });
}
