# HRMS implementation

Authorized 5 October 2026. Development branch: `codex/hrms-workflow`. Production payroll stays disabled; actual salary amounts remain the user's responsibility.

- [x] Attendance preview, staged review, official offline leave integration, confirmation and payroll gates.
- [x] Dedicated Attendance area and employee compensation/schedule history with separate identifiers.
- [x] Equal HR/Admin/CEO authority and distinct payment confirmation.
- [x] Calculation corrections, manual approved earnings/deductions, exports and action dashboard.
- [x] Integration tests, local browser verification, migration verification and handover.

Implemented locally; no production frontend/backend deployment in this turn. Migrations 024 and 025 were applied to the existing shared database after a private backup. Local preview/draft operations therefore use the shared database, rather than a separate test tenant.

## Workflow available

1. **People → Employees / Pay & schedules:** maintain Employee ID, hire date, last working date, effective compensation and work schedules. Attendance ID is a separate explicit mapping. Salaries remain blank until HR enters real values. Existing effective dates used by finalized payroll cannot be overwritten.
2. **Attendance:** choose a payroll month and cutoff; work dates are filled automatically and explained separately from payday. Payroll carries its selected cutoff directly into the import or unfinished review. Opening an older review restores its own dates, while previous imports stay in a collapsed history list. Other work dates remain available for a custom review. Open a read-only CSV preview, then cancel, save for HR review, or confirm a clean review. Every missing record, incomplete punch, late/undertime or leave conflict requires a recorded HR decision. All expected employees are included, even with no CSV rows. Legacy imports require a new preview from the original CSV.
3. **Official leave:** record offline requests using the existing policy engine. Half-day leave stores its actual coverage and consumes at most half a credit; missing punches can be corrected while retaining that leave coverage. Reconcile mixed paid/unpaid leave by date, within official totals. Incorrect approved leave can be cancelled with a reason and re-recorded; the original record remains, eligible current-year credits are refunded once, and finalized payroll blocks cancellation. Attendance never deducts leave credits again. HR reasons, source CSV, before/after decisions, and confirmations are retained.
4. **Payroll:** preparation uses one screen instead of four wizard steps. It shows the selected work dates, payment date, employee setup and a direct attendance action. The newest confirmed attendance covering the whole cutoff is selected automatically; a different confirmed file can be chosen when more than one exists. Missing attendance offers upload, resume or legacy re-upload rather than an empty dropdown. Only confirmed, current attendance supplies a draft. Recalculation keeps manual earnings, deductions and verified first-cutoff amounts, while requiring renewed verification of any cutoff proration. Monthly salary calculations stay in place; ordinary scheduled night differential is calculated automatically; overtime, holiday/rest-day multipliers and tax remain manually verified entries. Basic adjustments now update 13th-month basic accrual. Reports export DTR, payroll register, contribution shares, and approved payment register.
5. **Approval → actual payment → close/release:** the same HR/Admin/CEO user may perform all steps. Payment requires a reference, actual date, and verification of approved net total. Recording payment does not move money. Closing a paid run releases employee payslips; approved unpaid runs remain private. Email is an explicit action after release.

## Verification

- Backend suite: 127 passing, zero failing; two opt-in database tests skipped in the normal command.
- HRMS database integration explicitly run and passed separately. It creates a private schema within a transaction and rolls it back. Checks cover preview without writes, duplicate save, optimistic versions, stale leave context, audited official-leave cancellation and single credit refund, mixed allocation budgets, immutable confirmation/audit, retained manual adjustments, 13th-month accrual, same-user approval, payment gate/idempotence, payslip release and finalized compensation protection.
- Frontend production build and JavaScript syntax checks pass.
- Seven frontend tests pass, including automatic/override earnings and night-review approval gates. The five cutoff checks cover: cross-year 15th payroll, leap-year February, whole-range coverage, newest confirmed-file selection and custom dates surviving refresh. Browser checks covered the direct payroll/attendance handoff, older-review dates, missing-attendance calculation gate, custom-date refresh and the supplied CSV's read-only preview; the preview was cancelled without importing.
- Browser: local Attendance loads, supplied CSV opens the confirmation modal, confirmation is disabled for unresolved setup, cancellation returns to the page without importing; employee compensation page loads with separate IDs. Payroll and dashboard checked locally.
- Applied migration 024 using one pinned database transaction. RLS enabled and anonymous/authenticated direct table access revoked for attendance sources/reviews, payroll runs/events, and payments.
- Backup: `C:\Users\joynoinc\.codex\backups\hr-system\hrms-before-024-2026-10-05T04-11-44-232Z.json`. This private file contains sensitive company records and is outside Git.

## Test locally

Open `http://localhost:5174/compensation`, enter an actual salary, Attendance ID and the date those values truly took effect. Then use `http://localhost:5174/attendance` to preview the CSV. The supplied export for 11–25 September produced 42 employees / 462 scheduled employee-days, including 88 late/undertime, 183 no-record and 11 incomplete-punch days. These categories overlap and remain unconfirmed. The unmapped ID `00000254` belongs to Jhonpaul, whose employee record the user will create.

The current local configuration keeps `PAYROLL_FINALIZATION_ENABLED=false` and `VITE_PAYROLL_FINALIZATION_ENABLED=false`. Actual approval/payment/email release remain disabled while HR fills real salary data and reviews payroll. The complete approval/payment flow was verified in the isolated integration test with the flag enabled. Changing both flags to true and restarting the local API/frontend enables those actions when the company is ready. Production payroll remains hidden and disabled.

## Boundaries

- Eight paid hours per shift with a fixed one-hour unpaid break: day 09:00–18:00 / break 13:00–14:00, night 21:00–06:00 next day / break 01:00–02:00. Employee Management shift selects defaults when a pay profile is missing; existing effective schedules remain intact until HR explicitly saves a change. Daily-paid calculations remain unsupported. Leave-day eligibility retains the company's existing Monday–Friday/Philippine-holiday calendar.
- Company policy for hires, departures and salary changes within a cutoff is not invented: affected lines require HR to enter any needed basic/COLA adjustments and record a policy/calculation reference before approval.
- Automatic tax, bank transfers and government remittance submissions are not performed. CSV payment/contribution registers are review/export artifacts, not evidence of transfer or remittance.
- Approved payroll is retained. Corrections after approval use a future, reasoned adjustment; the application does not reopen approved runs.

## Night-shift update — 5 October 2026

User confirmed 21:00–06:00, with the opposite of the day break (01:00–02:00), and 10% night differential for actual paid work between 22:00 and 06:00.

- Morning clock-outs are assigned to the shift-start work date, including the morning after the cutoff ends and an employee's last working date. New Bio can extend either endpoint. Late/undertime and half-day paper leave reconcile against the overnight schedule. For a night export, include the following morning's clock-outs; a missing final checkout still needs HR review.
- Automatic night pay excludes the unpaid break, leave and work outside the scheduled paid hours. A complete standard night shift has seven eligible hours. Calculation uses each work date's effective basic salary at monthly basic × 12 ÷ divisor ÷ 8, accumulates unrounded amounts, then rounds the cutoff total to centavos. Ordinary full-precision rates are retained in the draft details.
- Holiday night work, night overtime outside scheduled hours, and work verified without actual punches require HR to enter one reasoned total ND override before approval. It replaces automatic ND, including when zero; deleting the override restores the automatic amount and any required gate. Rest-day work remains an approved manual workflow rather than an automatically inferred extra employee-day.
- Effective ND flows through register/PDF/on-screen payslip, payroll export, net pay and the existing workbook SSS assessable-pay calculation. Recalculation preserves overrides without duplication. Existing rule-version-4 drafts must be recalculated before approval. Contribution basis retains the existing workbook assumptions; this test release is not a statutory-compliance certification.
- Migration 025 changes only the identified end-after-start restriction to permit an overnight end; all three saved profiles were verified unchanged. Private backup: `C:\Users\joynoinc\.codex\backups\hr-system\payroll-before-025-2026-10-05T07-23-14-271Z.json`. Integration fixtures use an isolated schema and roll back; night checks cover profile saving, following-morning clock-outs, automatic pay, SSS, override deduplication/removal, recalculation and approval.

Browser verification: Mark Joshua Abejo (Employee ID 206) displays Night from Employee Management, starts 21:00 and ends 06:00 next day. No actual salary/profile/Attendance ID was fabricated or saved for him. HR must enter the actual salary, Attendance ID and effective date before his attendance can be confirmed. Local API was restarted; payroll finalization remains disabled and no production code was pushed.


## Temporary day-only payroll testing — 5 October 2026

The user supplied a day-shift DTR and requested that night-shift payroll be hidden while testing. Local `PAYROLL_DAY_SHIFT_ONLY=true` now excludes employees classified Night and employees with overnight effective schedules from Pay & schedules, single-employee test selection, new attendance previews, setup counts, and new payroll calculations. Missing day-shift salaries, Attendance IDs and scans still require HR setup/review. Employee records, compensation history, prior payroll and the night calculation feature are retained.

The scope is included in attendance context validation and payroll rule snapshots. Existing draft attendance needs **Refresh setup and leave** to apply the day-only scope; legacy imports require re-uploading the original CSV. Earlier confirmed reviews remain immutable and cannot be automatically selected for a payroll using a different scope. Save, refresh and confirmation record the scope in the existing attendance audit events. To restore both shifts, set `PAYROLL_DAY_SHIFT_ONLY=false` in the local backend environment and restart the API, then prepare attendance for the restored scope. The example configuration defaults to false. No database migration is needed for this setting.

Verification: 134 backend tests and eight frontend tests passed; two opt-in database tests are skipped in the normal backend command. The isolated HRMS database workflow verifies day-only attendance confirmation and a one-employee draft with expected net pay, exclusion of night profiles, rejection of earlier confirmed night attendance, and review-history scope metadata. Frontend production build passed. Browser verification shows the day-only banner and a compensation list excluding Mark Joshua Abejo. Pay still requires setup for 30 day-shift employees and reviewed attendance for a full draft; **Test a calculation** remains available for individual testing. Local API restarted; finalization remains disabled. No code pushed or production deployment performed.
