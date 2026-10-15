# Pause FollowUp returns to the current AM

- Keep the brand paused and keep its current owner when the next contact date arrives.
- On refresh, include the brand in the current AM's Needs Action as **Follow-up due**.
- Suppress paused brands in Admin Needs Action and suppress their old assignment/reply signals before the due date.
- Use the brand's current owner, even if the saved reminder names a previous owner.
- Let the assigned AM resume with a note without submitting an owner change. Keep permission checks for other AMs and assignment changes.
- Keep existing date, resolution, extension and history version checks. A pause without a date does not create a due reminder.

Validation: exercise the work endpoint with due, future, undated, resolved, extended, transferred and unassigned pauses; test AM resume permissions and owner preservation; run TypeScript checks and the relevant follow-up tests.
