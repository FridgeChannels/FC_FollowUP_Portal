# Follow-up due-date evaluation

No production scheduler, cron secret, or notification integration is needed for
FollowUp due dates.

- A paused FollowUp remains paused. Once its selected next-contact date has
  arrived, an Admin sees **Pause review due** in Brands → Needs Action after a
  refresh. The Admin can then review, resume, or reassign it.
- A Mark as read reminder belongs to the Account Manager who marked that email
  read. Once its expiry arrives, refreshing that Account Manager's Brands list
  returns the corresponding email and Brand to their Needs Action queue.

`/api/cron/followup-reminders` remains a harmless compatibility endpoint for
old schedules; it does not change data or send notifications.
