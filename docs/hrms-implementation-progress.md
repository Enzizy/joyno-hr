# HRMS implementation

Authorized 5 October 2026. Development branch: `codex/hrms-workflow`. Production payroll stays disabled; actual salary amounts remain the user's responsibility.

- [x] Attendance preview, staged review, official offline leave integration, confirmation and payroll gates.
- [x] Dedicated Attendance area and employee compensation/schedule history with separate identifiers.
- [x] Equal HR/Admin/CEO authority and distinct payment confirmation.
- [x] Calculation corrections, manual approved earnings/deductions, exports and action dashboard.
- [x] Integration tests, local browser verification, migration verification and handover.

Implemented locally; no production frontend/backend deployment in this turn. The additive migration 024 was applied to the existing shared database after a private backup. Local preview/draft operations therefore use the shared database, rather than a separate test tenant.

## Workflow available

1. **People → Employees / Pay & schedules:** maintain Employee ID, hire date, last working date, effective compensation and work schedules. Attendance ID is a separate explicit mapping. Salaries remain blank until HR enters real values. Existing effective dates used by finalized payroll cannot be overwritten.
2. **Attendance:** select dates and CSV, open a read-only preview, then cancel, save for HR review, or confirm a clean review. Every missing record, incomplete punch, late/undertime or leave conflict requires a recorded HR decision. All expected employees are included, even with no CSV rows. Legacy imports require a new preview from the original CSV.
3. **Official leave:** record offline requests using the existing policy engine. Half-day leave stores its actual coverage and consumes at most half a credit; missing punches can be corrected while retaining that leave coverage. Reconcile mixed paid/unpaid leave by date, within official totals. Incorrect approved leave can be cancelled with a reason and re-recorded; the original record remains, eligible current-year credits are refunded once, and finalized payroll blocks cancellation. Attendance never deducts leave credits again. HR reasons, source CSV, before/after decisions, and confirmations are retained.
4. **Payroll:** only confirmed, current attendance supplies a draft. Recalculation keeps manual earnings, deductions and verified first-cutoff amounts, while requiring renewed verification of any cutoff proration. Monthly salary calculations stay in place; overtime, night differential and tax remain manually verified entries. Basic adjustments now update 13th-month basic accrual. Reports export DTR, payroll register, contribution shares, and approved payment register.
5. **Approval → actual payment → close/release:** the same HR/Admin/CEO user may perform all steps. Payment requires a reference, actual date, and verification of approved net total. Recording payment does not move money. Closing a paid run releases employee payslips; approved unpaid runs remain private. Email is an explicit action after release.

## Verification

- Backend suite: 110 passing, zero failing; two opt-in database tests skipped in the normal command.
- HRMS database integration explicitly run and passed separately. It creates a private schema within a transaction and rolls it back. Checks cover preview without writes, duplicate save, optimistic versions, stale leave context, audited official-leave cancellation and single credit refund, mixed allocation budgets, immutable confirmation/audit, retained manual adjustments, 13th-month accrual, same-user approval, payment gate/idempotence, payslip release and finalized compensation protection.
- Frontend production build and JavaScript syntax checks pass.
- Browser: local Attendance loads, supplied CSV opens the confirmation modal, confirmation is disabled for unresolved setup, cancellation returns to the page without importing; employee compensation page loads with separate IDs. Payroll and dashboard checked locally.
- Applied migration 024 using one pinned database transaction. RLS enabled and anonymous/authenticated direct table access revoked for attendance sources/reviews, payroll runs/events, and payments.
- Backup: `C:\Users\joynoinc\.codex\backups\hr-system\hrms-before-024-2026-10-05T04-11-44-232Z.json`. This private file contains sensitive company records and is outside Git.

## Test locally

Open `http://localhost:5174/compensation`, enter an actual salary, Attendance ID and the date those values truly took effect. Then use `http://localhost:5174/attendance` to preview the CSV. The supplied export for 11–25 September produced 42 employees / 462 scheduled employee-days, including 88 late/undertime, 183 no-record and 11 incomplete-punch days. These categories overlap and remain unconfirmed. The unmapped ID `00000254` belongs to Jhonpaul, whose employee record the user will create.

The current local configuration keeps `PAYROLL_FINALIZATION_ENABLED=false` and `VITE_PAYROLL_FINALIZATION_ENABLED=false`. Actual approval/payment/email release remain disabled while HR fills real salary data and reviews payroll. The complete approval/payment flow was verified in the isolated integration test with the flag enabled. Changing both flags to true and restarting the local API/frontend enables those actions when the company is ready. Production payroll remains hidden and disabled.

## Boundaries

- Eight paid hours per same-day shift, with the unpaid break starting at 13:00; overnight and daily-paid calculations remain unsupported and block attendance confirmation. Leave-day eligibility retains the company's existing Monday–Friday/Philippine-holiday calendar.
- Company policy for hires, departures and salary changes within a cutoff is not invented: affected lines require HR to enter any needed basic/COLA adjustments and record a policy/calculation reference before approval.
- Automatic tax and night differential, bank transfers and government remittance submissions are not performed. CSV payment/contribution registers are review/export artifacts, not evidence of transfer or remittance.
- Approved payroll is retained. Corrections after approval use a future, reasoned adjustment; the application does not reopen approved runs.
