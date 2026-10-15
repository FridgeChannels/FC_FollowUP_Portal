# Eastern business time implementation plan

**Goal:** Use America/New_York for operational dates, date filters, displays and scheduling. Preserve browser-local AI summaries, existing local tooltip hints, pause inputs and reminder inputs.

**Architecture:** One business timezone constant supplies display and scheduling. Civil date fields keep their selected date; timestamp boundaries use Eastern midnight with DST-aware conversion. Persisted UTC instants remain unchanged.

**Tech Stack:** TypeScript, Intl.DateTimeFormat, Node test runner.

1. Add `lib/time-zone.ts`; connect `lib/display-time.ts`, `lib/scheduling-engine/calendar.ts` and `vite.config.ts` to the same zone. Add civil-date-safe display formatting.
2. Convert `lib/performance/data.ts`, Caller dashboard today, Signals day/week windows, reply capacity dates and reply deadlines to Eastern boundaries. Reuse the existing scheduling converter and preserve seconds.
3. Update performance/history/template dates and task/brand date filtering. Leave local AI summary timestamps, hover hints and pause/reminder input parsing intact.
4. Update affected tests and add midnight, date-only and DST regressions. Run the affected suites and TypeScript checks; distinguish pre-existing errors from new errors.
