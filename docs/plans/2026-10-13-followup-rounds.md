# Continuous Follow-up Implementation Plan

**Goal:** One permanent Brand, multiple Exhibition Encounters, at most one unfinished follow-up Round, with history in the existing right panel.

**Architecture:** Keep Notion brands, contacts, tasks, conversations and profiles. Add only missing round/encounter/assignment storage to the existing Supabase project. Database transactions serialize writes per brand, enforce lifecycle rules and deduplicate stable encounter IDs. Notion remains the operational projection for existing scheduling and AM assignment; durable pending projections can be retried after upstream failures.

**Tech Stack:** React, TypeScript, existing Notion REST adapter, Supabase Postgres REST/RPC, Node test runner.

1. Inspect existing BrandDetail, assignment, status, CP, meeting and conversation behavior. Preserve pre-existing local edits.
2. Add service-only database tables and transactional lifecycle/encounter RPC. Seed only evidenced ongoing/paused/completed legacy follow-up records; never invent missing historical encounter associations.
3. Add typed history service, canonical Client→Brand resolution for Exhibition synchronization, input validation, existing ACL checks and recoverable Notion projection.
4. Route existing owner/status/CP edits through round history. Explicit Resume retains ID/CP; Start New Round clears the previous completed CP via the existing NONE initialization.
5. Add Round/Status and a single View History entry to Follow-up details; show grouped expandable records in the same panel and filter the existing Conversations list by explicit round attribution.
6. Retain original meeting links separately when old associations are unknown. Preserve relationship origin and profile, original notes, conversations, tasks and contact restrictions.
7. Reuse existing AI summary generation with persistent prior context and source-linked key changes. Save encounters regardless of AI availability; notifications reuse system_notifications and do not create Signals or duplicate tasks.
8. Verify lifecycle/retry/validation/legacy scenarios, SQL constraints and privileges, TypeScript, focused lint, existing tests, production build and browser interactions. Document cross-app contract and migration requirements.
