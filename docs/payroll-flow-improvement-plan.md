# Payroll flow improvement plan

12 October 2026 · Implemented locally; verification recorded below

## Goal and scope

Make a payday easy to complete without repeated information, unclear states, or unnecessary navigation. Keep the four stages, current payroll formulas, HR/Admin/CEO permissions, and separate Day and Night runs. Employee-profile merging and merging shift runs remain after the October 15 trial, as previously agreed.

This plan follows a read-only walkthrough of the September 30 Day run and inspection of the upload, calculation, approval, payment, closing and payslip logic. That run currently requires an attendance recheck. No attendance decisions, financial approvals, payments, or emails were submitted during the review. Later paid/closed states were inspected in the implementation rather than produced by changing the run.

## What currently causes friction

| Area | Finding | Consequence |
| --- | --- | --- |
| Stage navigation | Later stages look disabled but their buttons still open them. | HR reaches screens that cannot yet be completed. |
| Readiness | The Attendance stage reports Needs recheck, but Review pay still offers Continue to approval. | The next action contradicts the actual blocker. |
| Recovery | Approval's attendance blocker offers Open Review pay. | HR follows a detour before reaching Attendance. |
| Repeated context | Payday, shift and work dates appear in the run header and again in stage content. | Extra text pushes useful content down. |
| Review pay | Seven summary boxes, another net total, and a wide table split extra earnings from charge earnings. | HR must understand storage categories rather than simply earnings and deductions. |
| Finalization | A second three-part tracker sits inside the third stage, with another employee list. | The same payroll looks like multiple workflows. |
| Payslips | Real-run wording alternately says Close releases payslips and Send publishes them. | HR cannot tell when employees gain access. |
| Payslip actions | Bulk and individual Print/Save/Send controls repeat; Print and Save remain generic before anyone is selected. | The target and purpose of each action are unclear. |
| Page transitions | Each stage mounts another view and reloads overlapping payroll/attendance data. | Switching stages can flash Loading and briefly show inconsistent information. |
| Help | Some notices still refer to Earnings or Charges although editing now uses Adjust pay. | Instructions disagree with visible controls. |

## Shared layout and navigation

Keep a single run header: payday title, Day/Night shift, and work dates. Show contribution details in the pay breakdown where they matter. The shift switch returns to the other shift's saved position, without carrying the current shift's employee selection or batch.

Use four stage labels: **Attendance → Review pay → Finalize payroll → Payslips**. Finalize payroll is clearer than Approve & pay because the app records an external payment; it does not transfer funds.

Each stage has one status and one primary next action. Completed stages remain accessible. Later stages that cannot be used stay unavailable, with an adjacent prerequisite explanation rather than a disabled button whose meaning requires a tooltip. An existing stale draft can be inspected as read-only, labelled Outdated; its only next action is to correct its source. Draft payslip preview belongs in Review pay, so the final Payslips stage does not need to open early.

Place a single short action area after the main content. Use sticky placement only when needed on long pages, with content clearance and no duplicate notice/action above it. If the page already has an inline blocker and its action, suppress the action bar. Do not cover the final employee row or require two scroll areas to reach its controls.

Retain the loaded run context while moving between stages. Refresh affected information after an actual change. Show an initial checking state until readiness has been verified, rather than briefly showing Confirmed from the import list before the detailed check finishes.

## 1. Attendance

**HR's job:** establish which days were worked, on leave, absent or missing a scan.

### Proposed screen

Before upload, show one upload area with files, the inherited work dates and employee count. Do not ask for the payday or shift again. Keep the existing preview confirmation before saving an import. For a first cutoff crossing months, ask for the two monthly exports only when applicable.

After upload, show two filters: **Needs review (N)** and **All employees**. Default to unresolved decisions; recorded lateness/undertime and already resolved days can be inspected under All employees. Do not count every deduction as an unresolved decision.

Open the first employee needing a decision. Within that employee, show date, time-in, time-out and the issue with clear choices such as Verified absence, Recorded leave, Missing punch, or Worked offsite. Show official leave beside the relevant day. Keep the ability to record leave filed directly with HR; missing scans alone must not become confirmed absences.

Keep source file, scan-reader interpretation, import history and replacing files behind contextual details/More. Existing scans, resolved decisions and source files are retained.

### Main action and recovery

- When decisions remain: show the count and **Review next employee**.
- When attendance is ready: **Confirm & calculate pay** confirms the review, calculates a saved draft once and opens Review pay.
- On failure between confirmation and calculation: show Attendance confirmed; pay calculation failed, with **Retry calculation**. Do not re-import or create a duplicate draft on retry.
- When confirmed attendance becomes stale: show one **Recheck attendance** action. It should reopen and reload the source as one user action, retain unaffected decisions, and show only the days requiring renewed review. HR still confirms the result; there is no automatic confirmation of changed absence/leave decisions.

## 2. Review pay

**HR's job:** verify what each employee earns, what is deducted, and the resulting net pay.

### Proposed screen

Use three totals: **Earnings, Deductions, Net pay**. Each can expand into the existing breakdown; COLA, overtime, ND and allowance details remain distinguishable there. Employer contributions are excluded from employee deductions and shown under agency remittances in finalization.

Use a searchable table with **Employee, Earnings, Deductions, Net pay, Actions**. On narrow screens, show employee and net pay with an expandable breakdown instead of forcing the full table into horizontal scrolling.

Keep **Adjust pay** as the single editing entry point and **Preview payslip** as a secondary check. The optional previous-pay correction stays collapsed inside Adjust pay. Basic salary and normal first-cutoff pay remain automatic. Holiday/OT attendance corrections go directly to that employee/day in Attendance rather than becoming competing manual entry routes.

Show actual blockers and unusual amounts with an issue filter. Use one readiness summary rather than a green check for every routine condition. Keep detailed explanations beside the relevant amount, and calculations/history behind View breakdown.

Rename Charge earnings to Allowances/other earnings in the breakdown, Charges to Other deductions, and use Adjust pay consistently in guidance. Do not merge or change the underlying calculation categories.

### Main action and recovery

- Current draft: **Continue to finalization**.
- Confirmed attendance changed: **Recalculate pay**, preserving existing manual earnings, charges and the previous-pay correction.
- Attendance still needs review: **Go to Attendance**; continuing forward is unavailable. The draft may still be inspected as outdated.
- Employee setup problems: open the affected employee's existing Pay & schedules page, retaining payday, shift and return location.

## 3. Finalize payroll

**HR's job:** approve the checked amounts, record payment and close the run.

### Proposed screen

Show employee count and approved employee net total. Keep agency remittances in a separate collapsible summary, since they are paid separately. The full employee register stays in Review pay; a View pay breakdown link returns there. Remove the repeated Who gets paid table from this stage.

Replace the nested three-card progress tracker with one current action card. Completed actions are a compact history showing actor, date and payment reference.

The sequence remains:

1. **Approve payroll** — freezes the checked amounts, with the total and employee count visible.
2. **Record payment** — opens the existing payment-date/reference form after HR makes the bank payment. Keep a concise explanation that the app records payment and does not move money.
3. **Finish payroll & open payslips** — closes the paid run and opens the last stage. Preserve the existing separate approve/payment/close operations and their audit history; do not silently approve or record payment on navigation.

Only the current action is offered. Blockers link straight to their source: Attendance, Adjust pay for the named employee, or employee setup. Do not use Open Review pay as the universal recovery action. HR/Admin/CEO retain their existing permissions; no new second-person approval requirement is introduced.

## 4. Payslips

**HR's job:** inspect final payslips, print/save copies, and optionally email them.

### Actual release behavior to preserve

For real payroll, a closed run with a payment record makes its payslips available in the employee portal. Email is an additional action and can fail independently of portal availability. For practice payroll, employee visibility is restricted to the test payslips sent to selected employees, until removed. Keep practice wording separate.

### Proposed screen

Show one final state: **Payroll complete · payslips available** for real payroll. Replace generic Sent status with separate **Available in My payslips** and **Email sent / Not emailed / Email issue**. Email sent means the email service accepted the message; do not promise inbox delivery or claim the employee opened it.

Keep a searchable employee list with a preview. On mobile, open one preview at a time with a clear Back to employees action; avoid a cramped list/PDF split.

Use filters **All, Not emailed, Email issues**. Select all clearly means all currently matching employees and shows the selected count. Keep selection separate from whichever employee is being previewed, and preserve selected employees when changing the filter.

Use one primary **Email selected (N)** action and secondary **Print selected / Download PDF** actions. Single-employee print/download can live in the preview's More menu. Label one-copy employee PDFs versus two-copy signing sheets where HR chooses the format.

Email review shows the recipients/count, missing or ambiguous account emails, and already emailed employees. Successful sends are skipped on retry. Retain failures so HR can retry only unsuccessful recipients; email problems do not reopen completed payroll. Do not auto-select all recipients or auto-email on finishing payroll.

## Changes and their destinations

| Change | What HR should see | Where to act |
| --- | --- | --- |
| Missing/incorrect attendance or changed leave | Attendance needs recheck; saved draft marked Outdated | Affected attendance employee/day |
| Reconfirmed attendance differs from the calculated version | Draft needs recalculation | Review pay |
| Salary, COLA or government contribution settings changed | Draft calculation needs updating; explain whose setup changed when evidence is available | Pay & schedules, then the existing required recheck/recalculation path |
| Optional prior-cutoff correction | Updated month-end SSS/net after Save | Adjust pay |
| Amounts approved | Read-only register; payment is the next action | Finalize payroll |
| Payroll paid and closed | Payslips available, email optional | Payslips |
| Email failed or missing account email | Payroll remains complete; an email issue is shown | Affected payslip/email setup |

Do not infer the exact employee/field that changed from a hash mismatch alone. A named change summary needs saved source comparison or event data. Before the trial, preserve the current backend recheck rules. After the trial, consider separating attendance-relevant changes (schedules, identity, leave) from calculation-only changes (salary/COLA/contribution settings), so pay setup updates require recalculation without unnecessary repeat attendance review. This needs snapshot/approval validation tests and is not a cosmetic change.

## Implementation order

1. **Readiness and navigation:** agree on statuses/labels; one blocker and recovery action; prevent dead-end forward navigation; remove contradictory wording and duplicate action bars.
2. **Attendance:** issue-first review, employee/day recovery, confirm-and-calculate handoff and retry behavior.
3. **Review pay:** simplify totals/table, use one adjustment entry point, improve mobile breakdown and recalculate/recovery paths.
4. **Finalize and payslips:** one current finalization action, remove repeated register/tracker, clarify portal access versus email, simplify selection and recipient recovery.
5. **Verify the full flow:** correct attendance, missing punches/paper leave, stale attendance, pay-only corrections, each agency pending, missing 15th records, payment recording, closing, failed emails, reload/back navigation, both shifts, light/dark modes and narrow screens. Finalization tests use isolated fixtures/practice data rather than modifying real employees' payroll.

Start with labels/layout/navigation while protecting the October 15 trial. Changes that combine server actions, alter readiness/snapshot rules, or change employee visibility require the full regression checks before trial use. Keep the planned employee-profile and shift-run merges for after the trial.

## Acceptance criteria

- Every stage answers: what is HR checking, what remains, and what is the next action?
- There is one primary forward action, and no duplicated warning/action for the same issue.
- A page never offers continuation while its own prerequisite is known to be incomplete.
- Blockers return directly to the employee/day or setting needing attention.
- Returning/reloading keeps the correct payday, shift, batch and saved work; pending edits are not silently lost.
- Recalculation preserves manual adjustments and does not duplicate drafts or overwrite approved pay.
- Nothing is marked paid or emailed merely by continuing through the stages.
- Real portal availability, email acceptance and practice visibility use accurate separate labels.
- Final employee rows and all primary actions remain reachable on desktop and mobile.
- Workbook sample calculations and approved payroll amounts remain unchanged.

## Implementation and verification · 12 October 2026

The four-stage UI is implemented: Attendance → Review pay → Finalize payroll → Payslips. Later stages respect readiness; saved outdated drafts remain inspectable without adjustment/continuation controls. Attendance defaults to pending decisions, preserves employee/day recovery, and hands confirmed work directly to calculation. Reopening and refreshing remain separate server operations invoked by one recheck action; HR still confirms the refreshed review.

Review pay now uses three totals (Earnings, Deductions, Net pay), a searchable register, expandable breakdowns and phone cards. Adjust pay remains the single editor, with unsaved navigation/reload protection. Payment-date changes remain under More. Finalization presents only the current approval/payment/finish action, with agency remittances and completed actions collapsed. Finishing opens Payslips; navigation never approves, records payment or emails anyone automatically.

Payslips separates portal availability from email acceptance, preserves selections across filters, retries failed recipients and offers one-copy/two-copy PDF formats. Email-provider failures are recorded in the existing audit table and restored on status reload; successful sends remain idempotent. Browser verification also exposed an existing adjustment payload mismatch: ordinary deductions must be positive in the API payload, while basic-pay corrections remain signed. The serializer now follows that contract; payroll formulas were not changed for this UI work.

Verification:

- Production frontend build passed; 31 frontend utility tests passed.
- Backend regression suite: 184 passed, 3 optional integration tests skipped.
- The isolated database workflow test was run explicitly and passed using a temporary schema/rollback, covering attendance confirmation, official leave, recalculation and payment release.
- An in-memory browser fixture completed all four stages, including a simulated calculation outage/retry, cash-advance deduction, approval, payment recording, closing and failed-recipient-only email retry. Its API uses fictional employees and cannot connect to the database or an email provider.
- Light/dark layouts and a 390px phone viewport were checked. Mobile employee rows and payslip previews remain reachable without horizontal page overflow. No browser warnings/errors appeared in the final fixture walkthrough.

No actual attendance decisions, approvals, payments or emails were submitted during browser verification. The working tree remains uncommitted and these changes have not been deployed. Existing salary/leave snapshot recheck rules are retained; the previously identified real stale draft still requires HR review. Employee-profile merging, shift-run merging, and separating attendance-only from pay-only snapshot invalidation remain after the October 15 trial.

For repeatable UI verification, `frontend/tests/payrollFlowMock.cjs` starts an in-memory API on `127.0.0.1:3301`. Run a separate Vite process on `127.0.0.1:5175` with process-only `VITE_API_BASE_URL=http://127.0.0.1:3301`, `VITE_PAYROLL_ENABLED=true` and `VITE_PAYROLL_FINALIZATION_ENABLED=true`. Keep this fixture separate from the normal app/API; it is not a real payroll source.
