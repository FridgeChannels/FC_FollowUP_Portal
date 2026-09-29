import { insertSystemNotification } from "../sample/notifications.ts";
import type { NotificationEvent, NotifyProvider } from "./types.ts";

/**
 * Persists domain notifications into system_notifications.
 * sample.visited is written by the sync pipeline with dedupe; this provider
 * is a no-op for that type to avoid double inserts, and can store others later.
 */
export function createInAppNotifyProvider(options?: { enabled?: boolean }): NotifyProvider {
  return {
    id: "in_app",
    enabled: options?.enabled !== false,
    supports(event) {
      // sample.visited rows are inserted in lib/sample/sync before emit.
      return event.eventType !== "sample.visited";
    },
    async send(event: NotificationEvent) {
      if (!event.brandId) return;
      const dedupeKey = [
        event.eventType,
        event.brandId,
        event.messageId || event.conversationId || event.occurredAt || Date.now(),
      ].join(":");
      await insertSystemNotification({
        type: event.eventType,
        brandId: event.brandId,
        ownerId: event.ownerId,
        title: `${event.eventType} · ${event.channel || "—"}`,
        body: event.contentPreview || event.brandName || null,
        deepLink: event.portalUrl || null,
        dedupeKey,
      });
    },
  };
}
