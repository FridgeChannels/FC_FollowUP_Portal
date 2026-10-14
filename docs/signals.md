# Signals workspace

`/signals` is available to Account Managers and Admins under the existing brand permissions. Admins see unassigned brands and use the existing Brand Detail assignment flow. Callers cannot access the Signals API.

Sample events come from `sample_tap_visits`. Internal devices are excluded using both the event flag and the current internal-device list. All original visits remain in place; stable PostHog UUIDs identify events. Existing Sample notifications now link directly to the selected brand in Signals.

A magnet and device pair surfaces at most one fresh signal per 24 hours. Repeat taps from the same device stay in History under the first signal's read state, while a different device tapping the same magnet is a genuinely new signal. Visits with no device ID are grouped together.

The page polls a lightweight change token (`GET /api/signals/pulse`) every 5 seconds while the browser is visible and pulls the full payload only when that token moves, with a full refresh on window focus and every 60 seconds as a fallback. Existing Sample webhook ingestion supplies live events; the existing sync cron still supports historical backfill. LinkedIn is not scraped or monitored by this implementation. Email opens are tracked by the portal's own pixel (see below); LinkedIn shows a genuine empty state until an authorized upstream feed supplies events.

## Upstream event contract

Use the existing server-only `system_notifications` store. Each raw event must have its own stable provider event ID in `dedupe_key`, a Follow-up Client brand ID in `brand_id`, the real summary in `title`, and structured JSON in `body`. Use the existing insert helper's conflict-ignore mode; retries must never overwrite or duplicate raw history. Keep aggregate reminders separate from these event records.

For `email.opened`, `body` supports `subject`, `contactId`, `occurredAt`, `sourceUrl`, `evidence`, and `highPriority`. Missing subjects are explicitly labeled unavailable. Open detection does not establish that the recipient read the message.

### Email open tracking

Outbound email carries its own tracking pixel, so the portal needs no third-party open-tracking provider. `createOutboundConversation` appends a 1x1 image pointing at `GET /api/track/open/<token>` to every outbound Email body before it is stored — this is the single funnel for manual sends and OmniReach sends alike, so the pixel cannot be missed. Plain-text bodies are wrapped in a minimal HTML body first, because plain text cannot carry an image at all.

The token is a signed, self-describing payload (`brand`, `messageId`, `threadId`, `contactId`, subject) keyed by HMAC-SHA256, so the pixel route attributes an open without any CRM lookup. `EMAIL_TRACK_SECRET` signs it and falls back to `REPLY_INGEST_TOKEN`; with neither set, no pixel is injected and sends are unaffected. The route always answers `200 image/gif` and never reveals why a token was rejected.

A hit inserts one `email.opened` raw event via the same conflict-ignore helper as Sample taps: `dedupe_key = email.opened:{messageId}:{bucket}`, bucketed by `EMAIL_OPEN_DEDUPE_MINUTES` (default 30) so one open's burst of pixel fetches lands once. Riding along are `messageId`, `threadId`, `contactId`, optional `subject`, `occurredAt`, `evidence` and the client user agent. Because the classifier groups every open of a message into one signal, repeat opens stay in History under the first open's read state.

Two deliberate limits. The portal renders sent email in its own Timeline, so `GET /api/track/open/*` ignores requests that look like a same-origin preview (`Sec-Fetch-Site` or a portal `Referer`), and `EmailHtmlBody` strips the pixel before rendering. And a pixel hit proves an image was fetched, not that a human read the mail — mailbox providers prefetch remote images, so the UI keeps saying so.

For `linkedin.updated`, `body` must contain `relevant: true`, a valid `sourceUrl`, and `publishedAt`. `occurredAt` represents the signal update time; notification `created_at` represents the monitoring time. Supply only new relevant changes from a licensed API, authorized export, or another sustainable permitted provider, on the upstream provider's weekly schedule. Events without evidence, relevance or a valid publication date are rejected by the display adapter. The workspace groups newly received LinkedIn changes into one toast.

The current source labels indicate whether the store has received usable events. They do not independently verify provider health. Actual provider setup and health checks remain with the existing integration owners.

## Read-only preview

Review updates and message sending are disabled by default. Reading a signal is always saved as a compact read snapshot so its unread marker stays cleared across refreshes. The Signals API rejects review updates and sending while read-only mode is active. `SIGNALS_REVIEW_WRITES_ENABLED=true` is a server-only opt-in for those additional actions after write access is approved. Email drafts can be previewed. Existing CRM screens are unchanged.

## State and follow-up

`signals.read` and `signals.review` are compact snapshots in the existing notification store, with one dedupe key per brand and marker type. They always have `read_at` set, so they are not new unread notifications. They store stable event IDs, which means delayed or same-timestamp events reopen the queue correctly. Raw events are never removed or marked completed. No separate Signal Task system or notification center is created; no database migration is needed.

Viewing the review panel clears only unread. The mobile queue never mounts the review panel until a brand is selected. Mark Reviewed records an explicit review and advances the queue. Follow up later requires a real future scheduled Task belonging to the brand. The existing sending workflow can create that Task; existing task ownership is revalidated by the API before linking it.

The existing email composer, channel availability checks, messaging API, Quo dial action and communication Timeline are reused. Opening drafts or creating a queued outgoing message does not mark Handled. During the current review session, the page watches the created message or initiated call and marks Handled only after the server validates a Sent/Delivered outbound message or a connected call with an actual completion time after the signal. If the review workspace is closed, its watch stops; the brand remains available for explicit review.

## Verification

- `pnpm test:signals` — unit coverage for the classifier, adapter and open-token codecs.
- `pnpm simulate:email-open` — signs a real token, hits `GET /api/track/open/<token>`, then reads the store back to prove the `email.opened` row landed. This is the way to exercise the email signal end to end without sending anything; see `--help` for `--brand`, `--message`, `--base` and `--no-verify`.
- Targeted ESLint for new Signals files and API routes.
- Production build.
- Isolated browser fixtures for desktop and 390px mobile, type filtering, same-screen selection, read vs review, next-brand selection, email draft, Tap History, Timeline and deferred-task empty state. Fixtures are intercepted in the test browser only and are never saved as real events.

Verifying with a real email needs two things the simulator skips. `getPortalBaseUrl()` decides where the injected pixel points, so a local portal must set `PORTAL_BASE_URL` to an origin that actually serves `/api/track/open` — otherwise the body carries a pixel aimed at the wrong host and nothing is recorded. And the pixel only fires when a client loads the stored body: if the sending system re-renders the message instead of using the ConversationDB `Content` verbatim, the pixel must be injected on the sending side.

The repository has pre-existing TypeScript errors outside this change. Track these separately; the Signals files should introduce no additional type errors.
