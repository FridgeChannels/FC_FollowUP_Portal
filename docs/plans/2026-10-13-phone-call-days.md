# Phone call records grouped by date

Scope: the Call results / Call details list within each Phone task's current or historical review round. Keep task and review-round attribution intact.

Revised list requirement: sort the outer Phone task cards by their displayed scheduled time (dueAt), newest first, across all statuses. Keep undated tasks last with a stable ID tie-breaker. Date groups and calls within each review round also sort newest first.

Use a date accordion rather than a flat list or tabs: it keeps all dates visible, makes the chronological order clear, and needs no extra navigation. Date headers show YYYY-MM-DD, weekday, call count, and a Latest marker for the newest dated group. Older days start collapsed and show result counts; the newest day starts expanded. Every date can be independently toggled. Undated records remain visible in an Unknown date group.

Group using the existing display timezone and conversation createdAt, matching the timestamp already shown by the Phone board. Sort both dates and calls from newest to oldest by their actual timestamps, placing undated records last. The first dated group is Latest and defaults to expanded. Show only the time and timezone in each call header; retain the full timestamp as the title and in Quo details. Emphasize Connected with a green status badge. Keep all existing Quo tabs, refresh actions, call selection, caller notes, and review decisions.

Use real buttons, aria-expanded / aria-controls, visible keyboard focus, and hidden panels. Preserve an explicit user toggle through refreshes; open a date containing a newly highlighted call. Empty call lists retain their existing message. Quo loading and unavailable-data states stay within the existing panel.

Validation: timezone midnight/year boundaries, DST repeated times, stable chronological order, invalid dates retained, original array unmodified; type and lint checks; browser checks for defaults, independent toggles, keyboard access, and all Quo tabs.

Initial validation: 25 relevant tests passed and lint passed for the changed source/test files. Browser verification with representative sample records confirmed date defaults, keyboard collapse, preserved Recording/Summary/Transcript panels, and selecting an older Connected call for review. At 390px the page has no horizontal overflow. Full-project type checking reports existing errors outside the changed files. The supplied brand URL initially returned Brand not found, so visual verification used a temporary preview route, removed after testing. Initial screenshots under artifacts/phone-call-days-desktop.png and artifacts/phone-call-days-mobile.png show the original ascending order; the current behavior follows the user's revised requirement for descending order.
