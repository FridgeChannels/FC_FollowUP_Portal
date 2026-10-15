# Follow-up due-date evaluation

No production scheduler, cron secret, or notification integration is needed for
FollowUp due dates.

- A paused FollowUp remains paused and keeps its current Account Manager. Once
  its selected next-contact date has arrived, that AM sees **Follow-up due** in
  Brands → Needs Action after a refresh. The AM can resume it with a note,
  extend the pause, or complete it. Resuming does not require reassignment.
  Paused brands do not enter Admin's Needs Action queue, including through old
  assignment or reply signals. A pause without a date has no due reminder.
- A Mark as read reminder belongs to the Account Manager who marked that email
  read. Once its expiry arrives, refreshing that Account Manager's Brands list
  returns the corresponding email and Brand to their Needs Action queue.

`/api/cron/followup-reminders` remains a harmless compatibility endpoint for
old schedules; it does not change data or send notifications.
