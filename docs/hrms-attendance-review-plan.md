# Attendance review before payroll

Proposed 5 October 2026. Requested by the user before proceeding with the broader HRMS plan. This document does not change application behavior or production data.

## Objective

Attendance uploads must produce a review preview before the user confirms attendance for payroll. A missing scan is evidence to investigate, not proof of absence. Leave submitted directly to HR must become an official leave record so payroll and leave credits stay consistent.

## Current implementation

- Company employee codes and biometric Person IDs are separate and linked explicitly.
- Import currently saves the batch immediately and displays review afterward.
- Missing punches and no-scan workdays become exceptions. Payroll approval has exception/import-error checks.
- Complete scan pairs can have lateness/undertime without an explicit HR review state.
- Official HR-recorded leave already applies eligibility, leave credits, overlap checks, paid/unpaid treatment, and audit history.
- Approved leave is currently applied on no-event days. Partial-day leave with scans needs explicit reconciliation.
- A manual attendance correction can label a day paid/unpaid leave without creating or linking an official leave record. The proposed normal workflow must use the official recorder rather than treating that label as sufficient.
- Existing import population is driven by effective payroll profiles and current active status. The proposed review must explicitly identify missing setup, examine employment dates, and respect each employee's actual schedule throughout the cutoff.

## Five-step user flow

1. Select cutoff and upload a CSV. Show the selected dates, file coverage, employees included, and both identifiers. Server calculates a read-only preview; changing the selected file/period invalidates it.
2. Open an attendance review modal. Summarize affected employees and employee-days separately. Use categories: late/undertime; no record and no approved leave; incomplete punches; leave conflicts or pending leave; mapping/setup/file-coverage issues. Do not call unverified missing records absences.
3. Resolve each flagged employee-day in a persistent review page or expanded modal. HR may confirm actual lateness/undertime, record official offline leave, enter supported punch corrections, confirm unpaid absence, or record a supported work/schedule exception. Every decision requires an actor, reason, and applicable evidence/reference.
4. Confirm attendance. Permit confirmation only after blocking issues are resolved and all flagged days have recorded decisions. Save an immutable source, its reviewed results, linked leave records, and an audit history. Acknowledge actual late/undertime values explicitly; they do not have to be reduced to zero.
5. Generate payroll from the confirmed attendance version. Approved payroll retains the inputs used to calculate it. New changes invalidate unapproved payroll drafts and require recalculation; approved periods require a controlled adjustment process.

## Modal and review page

Title: **Review attendance before confirming**

Summary should include period, source coverage, total employees, and unresolved issue count. Counts are employee-days unless labelled employees. Categories may overlap; the total must count distinct days rather than simply sum overlapping categories.

Each row shows employee name, Employee ID, Biometric Attendance ID, date, scheduled hours, first/last scans, late/undertime minutes, existing leave status, proposed classification, and HR decision. A provisional deduction can be shown only where setup is complete, labelled as unconfirmed and linked to its source.

Actions:

- **Cancel:** discard the unsaved preview; do not import or deduct anything.
- **Save for HR review:** explicitly save a provisional batch, with no final payroll effect, so HR can resume later.
- **Confirm attendance:** enabled only after review is complete and server validation passes.

Closing the modal must not implicitly confirm attendance. Large imports should open a full review page rather than force all work into a small modal. Filters and employee grouping support review without a generic "accept all absences" button. Clean days need no repetitive individual confirmation.

## HR decisions

| Finding | Available resolution | Payroll/leave treatment |
| --- | --- | --- |
| Late or undertime with valid punches | Confirm measured time; correct verified punches; link approved partial leave; record a permitted schedule/work exception | Apply the confirmed policy result. HR authorization alone does not automatically make missed time paid. Preserve raw scans. |
| Scheduled day without scans or approved leave | Record offline leave; confirm unpaid absence; record supported work/device/schedule exception; leave unresolved | No absence classification or deduction until HR confirms the reason. |
| Missing arrival or departure | Correct verified actual time, or record a supported exception | Never fabricate scheduled punches solely to clear a warning. |
| Pending leave, leave plus punches, or overlapping leave | Resolve the original leave approval and reconcile its coverage with attendance | Pending leave is not paid leave. Avoid charging both leave and absence/undertime for the same time. |
| Unmapped ID, missing salary/schedule, incomplete file coverage | Map the employee, complete applicable setup, or upload/validate the correct export | Block confirmation of the affected data; never silently omit the employee or infer mass absence from an incomplete export. |

Actual attendance and review status are separate: a valid confirmed day may still be absent or have undertime. Use review states such as **Pending review / Resolved / Confirmed**, not changes to measured attendance solely to indicate acknowledgement.

## Offline leave

From a flagged day, **Record leave received by HR** opens the existing official leave recorder with the employee and dates prefilled. HR selects the leave type, confirms date/time coverage and available documentation, and reviews paid/unpaid treatment.

The existing policy engine determines eligibility and credit usage, using the leave date. The reviewed attendance references the official leave record. On successful recording, refresh the relevant leave balance and attendance preview. Do not separately deduct credits through an attendance correction.

If a pending/approved request already exists, resolve or use it rather than duplicate it. Partial-day coverage must identify the covered time so approved leave does not erase unrelated lateness/undertime. Credits, paid/unpaid fractions, and attendance must reconcile without double deductions.

If HR confirms absence, classify it as an attendance absence without consuming leave credits or automatically assigning a disciplinary label.

## Population and coverage

Evaluate all employees expected to work in the selected period, including employees with no rows anywhere in the CSV. Respect employment start/end dates, schedule changes, rest days, nonworking holidays, and applicable approved leave. Missing setup is its own blocking issue rather than a reason to hide the employee.

Flag dates with no source scans for the entire expected population and exports that do not cover the selected period. These are coverage checks, not proof of a device failure or absence. Keep unsupported shift patterns visible as setup limitations; do not manufacture same-day results for an overnight shift.

## Integrity and payroll gate

- Preserve source scans; corrections are separate, audited decisions.
- Bind confirmation to the uploaded file, cutoff, roster, schedules, mapping, leave state, and review version. Recheck on the server; stale previews must be refreshed before confirmation.
- Prevent repeated confirmation/duplicate imports from duplicating reviewed attendance, leave credit deductions, or payroll charges. Replacements use explicit versions and retain history.
- Creating offline leave is a separate intentional save. Cancelling an attendance preview does not delete a leave record that HR already saved.
- Draft/review batches cannot supply a final payroll run. Confirmation, later changes, and payroll recalculation must preserve the chain of source versions.

## Acceptance criteria

1. Uploading or cancelling a preview creates no official attendance results, leave deductions, or payroll charges. Explicit save-for-review persists only a provisional batch.
2. A scheduled employee-day with no scans/no approved leave remains unresolved until HR decides. Employees absent from the CSV entirely remain visible; rest days and dates outside employment are not inferred absences.
3. Late/undertime days require acknowledgement or a justified resolution. Confirmed unpaid absence is permitted; absence itself is not an unresolved issue once correctly reviewed.
4. Offline leave recording updates the official leave record, credit balance, and reviewed attendance consistently, without duplicate credit usage or missed-time deductions.
5. Payroll uses only confirmed attendance; stale, duplicate, incomplete, and unreviewed batches are rejected by backend validation. Corrections retain source evidence, actor, reason, timestamp, and before/after values.

## Implementation order within the HRMS plan

First build the shared attendance preview and staged review flow, then integrate the official offline leave recorder, then add confirmation/version checks and payroll gates. After that, continue with the dedicated Attendance area, employee setup improvements, payroll permissions, calculation gaps, and the approval/payment workflow.
