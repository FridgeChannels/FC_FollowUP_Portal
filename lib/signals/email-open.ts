/**
 * Records an email open as a raw Signals event.
 *
 * Writes into the existing `system_notifications` store, exactly like the
 * Sample tap webhook does, so `lib/signals/data.ts` picks it up with no changes:
 * `type = email.opened`, a stable `dedupe_key`, the summary in `title`, and the
 * structured payload in `body`.
 *
 * `dedupe_key` buckets by time so a single open's burst of pixel fetches insert
 * once. Retries never overwrite history — `insertSystemNotification` uses
 * conflict-ignore on `dedupe_key`.
 */
import { insertSystemNotification } from "../sample/notifications.ts";
import { dedupeBucket } from "../sample/paths.ts";
import { getEmailOpenDedupeMinutes } from "./email-config.ts";
import type { EmailOpenTokenPayload } from "./email-tracking.ts";

export type EmailOpenContext = {
  /** Override for tests; defaults to now. */
  occurredAt?: string;
  userAgent?: string | null;
};

export async function recordEmailOpen(
  payload: EmailOpenTokenPayload,
  context: EmailOpenContext = {},
) {
  const occurredAt = context.occurredAt || new Date().toISOString();
  const subject = payload.s?.trim() || "";
  const bucket = dedupeBucket(occurredAt, getEmailOpenDedupeMinutes());

  const body: Record<string, unknown> = {
    messageId: payload.m,
    occurredAt,
    evidence: "Tracking pixel loaded by the recipient's email client.",
    highPriority: false,
  };
  if (subject) body.subject = subject;
  if (payload.c) body.contactId = payload.c;
  if (payload.t) body.threadId = payload.t;
  const userAgent = (context.userAgent || "").trim();
  if (userAgent) body.userAgent = userAgent.slice(0, 200);

  return insertSystemNotification({
    type: "email.opened",
    brandId: payload.b,
    ownerId: null,
    title: subject ? `Email opened · ${subject}` : "Email opened",
    body: JSON.stringify(body),
    deepLink: `/signals?brand=${encodeURIComponent(payload.b)}`,
    dedupeKey: `email.opened:${payload.m}:${bucket}`,
  });
}
