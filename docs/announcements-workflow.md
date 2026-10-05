# Announcements

Available locally at `http://localhost:5174/announcements`, with a dedicated sidebar entry for every role.

## Create an update

1. **Message:** title, plain-text message and standard/important priority.
2. **Audience:** both shifts, Day or Night; department; name or Employee ID search. Choose individual employees or **Select all matching**. Deselect matching only removes the current filtered group. Other selected departments/shifts stay selected and their count is shown. The active employee roster includes employees on leave. The temporary day-only payroll flag does not affect announcements.
3. **Review:** preview the message, exact selected employees, day/night counts and departments. Save a private draft or publish. Closing unsaved work offers Keep editing / Discard changes.

Published audiences are a fixed list of employee IDs; later hires and department/shift changes do not silently add recipients. No-login employees are clearly marked and can read an addressed announcement once a user account is linked. Publishing sends an in-app notification to currently linked user accounts. This version does not send announcement email.

HR/Admin/CEO can manage all announcements, including each other's drafts. Employees can access only published/archived announcements addressed to their employee record. Opening an announcement records its first-read time; management can inspect read counts and individual read status. Employee responses never include the audience or other employees' read receipts.

## Page and retention

Published, Drafts, Archived and All views for management; Latest and Archive for employees. Search title/message and, for management, filter recipient shift/department together. Pagination keeps the page manageable. Notification links open the exact announcement. Published messages cannot be edited; archive retains their message, recipients and read history. A correction is a new announcement.

Saving drafts checks active recipients again. Publishing checks them once more, uses optimistic draft versions, and runs the state change, notification inserts and audit event in one transaction. A repeated save with the same key and unchanged payload returns the original draft; a changed payload requires editing that draft. Repeated publish does not duplicate notifications.

## Local database and validation

Migration `026_announcements.sql` adds `announcements` and `announcement_recipients`; existing employee, leave, task and payroll records are unchanged. Both new tables enable RLS and revoke public, anon and authenticated direct Data API access. The existing authenticated backend handles role and recipient authorization. Indexes cover author, status/date and recipient employee lookups.

Migration applied to the shared database after recording the pre-change migration list and record counts in the private backup `C:\Users\joynoinc\.codex\backups\hr-system\announcements-before-026-2026-10-05T08-17-30-126Z.json`. The additive schema update creates no announcements or notifications by itself. Production frontend/backend code has not been deployed or pushed.

Validation: backend suite 138 passing / three opt-in database tests skipped; frontend utility suite 11 passing; production frontend build passes. Announcement database integration runs separately in an isolated schema and rolls back every fixture. It verifies private drafts, transaction rollback, versions, retry deduplication, audience filters, exact recipient authorization, read timestamps/counts, no-login/inactive recipients, retained archive and private table grants. Browser checks cover required message validation, Day + IT filtering, selection retained when switching to Night, bulk deselection, Employee ID search, final 9 day / 3 night recipient review, and cancellation without saving. No real test announcement or notification was created.

To run the database check: set `RUN_ANNOUNCEMENT_DATABASE_TEST=true` and run `node --test src/announcements.integration.test.js` from the backend directory. It requires the configured database connection and does not retain its test schema.


## Audience scrolling refinement

Audience uses an opt-in contained modal body: its step indicator, shift/department/search controls, recipient count and Back/Review navigation stay visible. The employee list fills the remaining height and owns the only scrollbar; it no longer has a fixed 256px height inside a second scrolling modal. Wheel scrolling stays in the list. Message and Review retain normal body scrolling, and expanding selected employees in Review does not create another nested scrollbar. Other modals keep the existing default behavior.

Browser verification at the current narrow viewport reproduced Day + IT, scrolled the employee list to its fully visible last employee without scrolling the main modal, selected all nine employees, checked Review (9 Day / 0 Night), and returned to Audience with all selections retained. The unsaved preview was discarded. Frontend production build passed; no database changes or publishing were required.
