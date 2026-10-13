# Continuous follow-up: integration and operations

Existing brands, contacts, CPs, tasks and conversations stay in Notion. The additive migrations in `supabase/migrations/` provide the previously missing Round/Encounter/Assignment history in the existing Supabase project. All new tables use RLS and are accessible only by the server service role. No public database policies or new client-side secrets are needed.

## Super Exhibition contract

Use the existing integration credential: `Authorization: Bearer $REPLY_INGEST_TOKEN`. Signed-in Admin/AM requests use the existing brand permissions. Use the canonical master Client ID or existing Follow-up Brand ID, never a brand-name match. A missing or ambiguous match returns 404/409; synchronization never creates a duplicate Brand.

Read shared context:

```
GET /api/exhibitions/encounters?clientId=<master-client-notion-id>
```

Returns `brandId`, `clientId`, `currentRound`, `currentAM`, `previousRoundAM`, `currentCP`, `brandSummary`, source-linked `keyContext`, contact restrictions and full `history`. Current AM reflects the latest Round even if Completed; previous AM means the immediately preceding Round.

Record an Encounter:

```json
{
  "clientId": "existing-master-client-id",
  "action": "encounter",
  "encounter": {
    "id": "super-exhibition:stable-meeting-id",
    "exhibitionId": "existing-exhibition-notion-id",
    "meetingAt": "2026-10-13T10:00:00+08:00",
    "metBy": "Ella",
    "meetingNotes": "Original unmodified meeting notes.",
    "keyChanges": [{
      "type": "Interest",
      "text": "Customer tried the sample and requested product information.",
      "source": "super-exhibition:stable-meeting-id"
    }],
    "nextStep": "Send the product overview.",
    "meetingRecordUrl": "https://www.notion.so/original-meeting"
  }
}
```

- The stable Encounter ID is global. Replaying the same normalized payload returns 200 with `duplicate: true`; conflicting reuse returns 409. Original notes are immutable. Exhibition names come from the existing Exhibition database.
- Active/Paused Rounds automatically receive new Encounters; Paused stays Paused. Completed/unstarted brands receive an unassociated Encounter. No CP, AM or task is changed by recording an Encounter.
- Explicit historical imports set `historical: true`; no current-Round association is guessed from timestamps.
- `keyChanges` may be omitted to request AI extraction. Supplying `[]` explicitly says no material change. Categories are Contact, Interest, Objection, Commitment and Outcome.
- Original Encounter is committed before AI extraction. Provider failure returns `keyChangesPending`/`summaryPending`; retry the same stable payload to finish derived processing. Human-confirmed changes are never overwritten by extraction. Model configuration reuses `OPENAI_API_KEY`, `AI_BRAND_SUMMARY_MODEL` and the existing generation adapter.
- Material changes create a deduplicated `encounter.updated` notification in existing `system_notifications` for the assigned AM. Brand Details displays the unread count and opens the same History panel; ordinary meetings create no notification and no Signal type. Configured Slack delivery reuses the existing notification engine and can be disabled with `NOTIFY_ON_ENCOUNTER=false`.
- Next Step is recorded as source context. It is not guessed into a send task. An explicitly approved concrete action is scheduled through the existing task/message APIs, with their channel, contact, schedule and permission checks.

Explicitly start/resume from Super Exhibition:

```json
{"brandId":"existing-followup-brand-id","action":"start","expectedVersion":4,"ownerId":"existing-am-notion-id","originEncounterId":"super-exhibition:stable-meeting-id"}
```

```json
{"brandId":"existing-followup-brand-id","action":"resume","expectedVersion":4}
```

Only a Paused Round can resume. Active/Paused prevent starting another Round; Completed cannot reopen. Start creates the next number, defaults to the prior AM, and initializes CP as NONE through the existing empty CP relation. An origin Encounter must belong to the Brand and have no existing Round. Admin/trusted integration may change the new AM; human AMs retain the existing assignment permissions.

Portal uses `GET/POST /api/brands/:id/followup` with the same rules. Existing owner/CP/status PATCH operations also pass `expectedVersion` and `expectedRoundId` to reject stale changes. Completing/freezing a Round prevents editing its AM/CP; the next cycle uses Start New Round.

## Compatibility and recovery

- Brand reads lazily import evidenced existing In Progress/Paused/Completed/Terminated follow-up into Round 1. Unknown start/end dates and historical meeting associations remain absent. A brand created but not followed up has no fabricated Round.
- Original Notion meeting links and brand-level AM assignment records are available in the unified History panel as unverified associations. Relationship Origin keeps the earliest recorded meeting, with its original link.
- Tasks and new communications carry explicit Round metadata. Delayed results inherit the originating Task Round. Legacy unstamped tasks/messages stay unattributed, retaining their original timestamps and content; no date-based backfill is performed. The unfiltered Conversations view keeps them.
- All channels, attachment/provider payloads, CP display and review operations use existing components. History Round filtering operates on explicit attribution and includes all CPs in the selected Round. Channel counts reflect that filter.
- Round mutations serialize per Brand in Postgres. A partial unique index enforces one Active/Paused Round. Notion updates use a durable projection queue and a single database claim. Failed projections stay pending; brand reads and retried writes repair them. While pending, additional Round writes return 409. A crashed claim is reclaimable after five minutes.
- Relationship summary is stored independently of Round progress. Database compare-and-set rejects stale AI generations; starting a new Round does not clear it. Source-linked Key Changes remain independently available if AI is unavailable. Existing Do Not Contact/Unsubscribe data is never modified.
- Direct writes by other apps must use these integration APIs for AM/lifecycle/CP changes so the transactional Round and Notion projection remain consistent.

## Verification

```
node --experimental-strip-types --test lib/followup-history.test.ts lib/brand-access.test.ts lib/brand-assignment.test.ts lib/brand-ai-summary.test.ts lib/interaction-cp.test.ts lib/notion/reply-inbox.test.ts lib/notion/conversation-thread.test.ts lib/ai-meeting-links.test.ts lib/template-variables.test.ts
npm run build
```

`supabase/tests/followup_rounds.sql` exercises the database lifecycle, stable retries, independent AM history, unfinished uniqueness, stale writes and projector claims. It runs in a transaction and rolls back all fixtures.

Browser QA uses `tests/fixtures/followup-brand.json` with intercepted API responses, so no customer data is changed. Verified same-panel History/Back, expanded notes and AM handover, first relationship link, historical CP1 messages while current CP2, existing Signal History, and no horizontal overflow at 390px.

The production build and 61 focused regression tests passed. Focused lint has no errors (existing hook dependency warnings remain). The repository-wide TypeScript check still reports pre-existing errors in media, workspace/task code and framework types; it reports no new Round/Encounter/history implementation errors.

Full additive database inventory: `docs/followup-database-additions.md`. No further live database writes were performed after the user's additive-only clarification.
