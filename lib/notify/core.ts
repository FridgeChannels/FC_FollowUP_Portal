import type { NotificationEvent, NotifyProvider } from "./types.ts";

export type EmitCoreOptions = {
  providers: NotifyProvider[];
  isEnabled: () => boolean;
  eventAllowed: (event: NotificationEvent) => boolean;
};

/**
 * Provider fan-out with injectable gates — no env / Cloudflare imports.
 * Failures are logged; this function does not throw for provider errors.
 */
export async function emitNotification(
  event: NotificationEvent,
  options: EmitCoreOptions,
): Promise<void> {
  if (!options.isEnabled()) {
    console.info("notify skipped: engine disabled", { eventType: event.eventType });
    return;
  }

  if (!options.eventAllowed(event)) {
    console.info("notify skipped: event filtered", {
      eventType: event.eventType,
      channel: event.channel,
    });
    return;
  }

  for (const provider of options.providers) {
    if (!provider.enabled) continue;
    if (provider.supports && !provider.supports(event)) continue;
    try {
      await provider.send(event);
      console.info("notify delivered", {
        provider: provider.id,
        eventType: event.eventType,
        conversationId: event.conversationId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("notify provider failed", {
        provider: provider.id,
        eventType: event.eventType,
        conversationId: event.conversationId,
        error: message,
      });
    }
  }
}
