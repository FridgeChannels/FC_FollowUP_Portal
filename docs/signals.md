# Signals workspace

`/signals` is available to Account Managers and Admins under the existing brand permissions. Admins see unassigned brands and use the existing Brand Detail assignment flow. Callers cannot access the Signals API.

Sample events come from `sample_tap_visits`. Internal devices are excluded using both the event flag and the current internal-device list. All original visits remain in place; stable PostHog UUIDs identify events. Existing Sample notifications now link directly to the selected brand in Signals.

The page refreshes every 15 seconds while the browser is visible and on window focus. Existing Sample webhook ingestion supplies live events; the existing sync cron still supports historical backfill. LinkedIn is not scraped or monitored by this implementation. Email-open and LinkedIn providers have not been connected; they show genuine empty states until an authorized upstream feed supplies events.

## Upstream event contract

Use the existing server-only `system_notifications` store. Each raw event must have its own stable provider event ID in `dedupe_key`, a Follow-up Client brand ID in `brand_id`, the real summary in `title`, and structured JSON in `body`. Use the existing insert helper's conflict-ignore mode; retries must never overwrite or duplicate raw history. Keep aggregate reminders separate from these event records.

For `email.opened`, `body` supports `subject`, `contactId`, `occurredAt`, `sourceUrl`, `evidence`, and `highPriority`. Missing subjects are explicitly labeled unavailable. Open detection does not establish that the recipient read the message.

For `linkedin.updated`, `body` must contain `relevant: true`, a valid `sourceUrl`, and `publishedAt`. `occurredAt` represents the signal update time; notification `created_at` represents the monitoring time. Supply only new relevant changes from a licensed API, authorized export, or another sustainable permitted provider, on the upstream provider's weekly schedule. Events without evidence, relevance or a valid publication date are rejected by the display adapter. The workspace groups newly received LinkedIn changes into one toast.

The current source labels indicate whether the store has received usable events. They do not independently verify provider health. Actual provider setup and health checks remain with the existing integration owners.

## Read-only preview

Writes are disabled by default. The Signals API rejects review updates, and the workspace does not write unread markers or send messages. Email drafts can be previewed. `SIGNALS_REVIEW_WRITES_ENABLED=true` is a server-only opt-in for a later deployment after write access is approved. Existing CRM screens are unchanged.

## State and follow-up

`signals.read` and `signals.review` are compact snapshots in the existing notification store, with one dedupe key per brand and marker type. They always have `read_at` set, so they are not new unread notifications. They store stable event IDs, which means delayed or same-timestamp events reopen the queue correctly. Raw events are never removed or marked completed. No separate Signal Task system or notification center is created; no database migration is needed.

Viewing the review panel clears only unread. The mobile queue never mounts the review panel until a brand is selected. Mark Reviewed records an explicit review and advances the queue. Follow up later requires a real future scheduled Task belonging to the brand. The existing sending workflow can create that Task; existing task ownership is revalidated by the API before linking it.

The existing email composer, channel availability checks, messaging API, Quo dial action and communication Timeline are reused. Opening drafts or creating a queued outgoing message does not mark Handled. During the current review session, the page watches the created message or initiated call and marks Handled only after the server validates a Sent/Delivered outbound message or a connected call with an actual completion time after the signal. If the review workspace is closed, its watch stops; the brand remains available for explicit review.

## Verification

- `node --experimental-strip-types --test lib/signals/*.test.ts`
- Targeted ESLint for new Signals files and API routes.
- Production build.
- Isolated browser fixtures for desktop and 390px mobile, type filtering, same-screen selection, read vs review, next-brand selection, email draft, Tap History, Timeline and deferred-task empty state. Fixtures are intercepted in the test browser only and are never saved as real events.

The repository has pre-existing TypeScript errors outside this change. Track these separately; the Signals files should introduce no additional type errors.
