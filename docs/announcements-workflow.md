# Announcements

Available locally at `http://localhost:5174/announcements`, with a dedicated sidebar entry for every role.

## Create an update

1. **Message:** title, plain-text message, standard/important priority and optional **Notify CEO by email** (off by default).
2. **Audience:** both shifts, Day or Night; department; name or Employee ID search. Choose individual employees or **Select all matching**. Deselect matching only removes the current filtered group. Other selected departments/shifts stay selected and their count is shown. The active employee roster includes employees on leave. The temporary day-only payroll flag does not affect announcements.
3. **Review:** preview the message, exact selected employees, day/night counts and departments. Verify or change the CEO notification choice, then save a private draft or publish. Closing unsaved work offers Keep editing / Discard changes.

Published audiences are a fixed list of employee IDs; later hires and department/shift changes do not silently add recipients. No-login employees are clearly marked and can read an addressed announcement once a user account is linked. Publishing sends an in-app notification and schedules an email to currently linked user accounts with an email address. When **Notify CEO by email** is checked, CEO accounts also receive an in-app notice and an email copy, even if their employee records are outside the selected audience. A CEO already selected receives only one in-app notice; email addresses are deduplicated without regard to case. The email includes the title, message, priority, publisher and announcement link, using the same branded email helper as Tasks & meetings and System email preferences (immediate/daily/off). CEO management access already allows opening that link.

The choice is retained in drafts; saving does not notify anyone. Email scheduling starts only after the publication transaction commits. Repeating a successful publish does not schedule another copy. Delivery is best effort through the existing mail transport; provider failures are logged and do not roll back a published announcement. `announcementEmailService` resolves saved employee recipients and optional CEO contacts and calls the existing `sendEmailNotification` helper. That helper uses Brevo when `BREVO_API_KEY` and `BREVO_FROM_EMAIL` are configured, otherwise the existing SMTP transport. No new provider credentials or integration are introduced. Local email configuration is currently absent, so actual email delivery has not been tested locally.

HR/Admin/CEO can manage all announcements, including each other's drafts. Employees can access only published/archived announcements addressed to their employee record. Opening an announcement records its first-read time; management can inspect read counts and individual read status. Employee responses never include the audience or other employees' read receipts.

## Page and retention

Published, Drafts, Archived and All views for management; Latest and Archive for employees. Search title/message and, for management, filter recipient shift/department together. Pagination keeps the page manageable. Notification links open the exact announcement. Published messages cannot be edited; archive retains their message, recipients and read history. A correction is a new announcement.

Saving drafts checks active recipients again. Publishing checks them once more, uses optimistic draft versions, and runs the state change, notification inserts and audit event in one transaction. A repeated save with the same key and unchanged payload returns the original draft; a changed payload requires editing that draft. Repeated publish does not duplicate notifications.

## Local database and validation

Migration `026_announcements.sql` adds `announcements` and `announcement_recipients`; existing employee, leave, task and payroll records are unchanged. Both new tables enable RLS and revoke public, anon and authenticated direct Data API access. The existing authenticated backend handles role and recipient authorization. Indexes cover author, status/date and recipient employee lookups.

Migration applied to the shared database after recording the pre-change migration list and record counts in the private backup `C:\Users\joynoinc\.codex\backups\hr-system\announcements-before-026-2026-10-05T08-17-30-126Z.json`. The additive schema update creates no announcements or notifications by itself. The announcement feature and audience scrolling refinement have been pushed to `codex/hrms-workflow`; production deployment remains separate.

Validation: backend suite 141 passing / three opt-in database tests skipped; frontend utility suite 11 passing; production frontend build passes. Announcement database integration runs separately in an isolated schema and rolls back every fixture. It verifies private drafts, transaction rollback, versions, retry deduplication, audience filters, exact recipient authorization, read timestamps/counts, no-login/inactive recipients, retained archive and private table grants. Email tests cover default-off CEO behavior, selected employee delivery, no email for drafts or failed publication, retained draft settings, explicit boolean validation, post-transaction scheduling, retry deduplication, matching announcement links and deduplication when a CEO is also selected. The final email helper is simulated. Browser checks cover required message validation, Day + IT filtering, selection retained when switching to Night, bulk deselection, Employee ID search, final recipient review, the CEO checkbox's default and persistence, and cancellation without saving. No real test announcement, notification or email was created.

Migration `027_announcement_ceo_notification.sql` adds the non-null `notify_ceo` boolean with default false. It was applied after exporting announcement rows, schema metadata and the migration list to `C:\Users\joynoinc\.codex\backups\hr-system\announcements-before-027-2026-10-05T08-57-01-726Z.json`. Existing row counts were verified unchanged with all previous announcements defaulting to off. The local API was restarted with automatic migrations and background jobs disabled. The CEO notification change is included on `codex/hrms-workflow` and ready for local testing; production backend deployment remains separate.

To run the database check: set `RUN_ANNOUNCEMENT_DATABASE_TEST=true` and run `node --test src/announcements.integration.test.js` from the backend directory. It requires the configured database connection and does not retain its test schema.


## Audience scrolling refinement

Audience uses an opt-in contained modal body: its step indicator, shift/department/search controls, recipient count and Back/Review navigation stay visible. The employee list fills the remaining height and owns the only scrollbar; it no longer has a fixed 256px height inside a second scrolling modal. Wheel scrolling stays in the list. Message and Review retain normal body scrolling, and expanding selected employees in Review does not create another nested scrollbar. Other modals keep the existing default behavior.

Browser verification at the current narrow viewport reproduced Day + IT, scrolled the employee list to its fully visible last employee without scrolling the main modal, selected all nine employees, checked Review (9 Day / 0 Night), and returned to Audience with all selections retained. The unsaved preview was discarded. Frontend production build passed; no database changes or publishing were required.
