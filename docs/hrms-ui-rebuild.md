# HRMS UI rebuild — before the October 15 trial

Implemented locally on October 12, 2026, following `E:/Enzizy/rebuild md.md` and the decision to improve navigation and layouts now, then merge employee setup and pay runs after the trial.

## Changes available now

| Area | Where HR goes | Changes |
| --- | --- | --- |
| Employee setup | Employees → Directory / Pay & schedules | Shared section navigation, employee-specific pay setup link, bounded employee picker, setup filters, separate salary, contribution and schedule sections, collapsed history. |
| Payroll | Payroll → Paydays → a shift's pay run | Clearer next payday card, attendance dates distinct from payment date, visible stages, responsive stage navigation, direct employee setup and reports links. Day and Night remain separate runs during the trial. |
| Reports | Reports → Leave / Payroll / Attendance | One reports entry, month/shift/status filters, existing register, contribution, payment and confirmed DTR exports. Payroll register includes saved 13th-month accrual. |
| Settings | Settings → Leave policy / Accounts / Audit log | Shared section navigation and an overview with direct links. Payroll rates remain in the current code pending the later settings work. |
| Employee navigation | Home, Leave, My payslips, My tasks, Announcements, Profile | Management-only reports, setup and settings remain restricted. |

The employee profile merge, Day/Night run merge, CRM deletion, practice-run removal, backend refactor and product rename are deferred. Existing CRM routes and data remain available; no data was deleted. Existing salary, COLA, attendance, overtime, night differential and 13th-month formulas were preserved.

## Government IDs pending — additional requested feature

In **Employees → Pay & schedules**, select the employee and find **Government contributions**. Each agency has a checkbox and a visible status:

- Checked: **ID ready**, include its contributions in a month-end draft.
- Unchecked: **ID pending**, exclude its employee and employer contributions. Pending SSS also excludes employer EC.
- For an employee with only Pag-IBIG, leave Pag-IBIG checked and untick SSS and PhilHealth. Save, then recalculate an existing month-end draft.

All existing profiles default to all three enabled to preserve prior behavior. HR must set each person's actual status; no employee was individually marked pending during implementation. These controls store readiness, not the actual government ID numbers. Manually entered loan payments remain separate from contribution switches.

Contribution settings follow the existing pay profile save/history rules. The current release still uses the newest configured profile for a draft's entire cutoff. Salary/schedule changes or a newly dated profile can require reopening and reconfirming attendance under the existing safeguards. A same-date contribution-only edit does not invalidate attendance, but approval checks the saved contribution snapshot and requires recalculation if it changed.

Draft lines save their contribution settings alongside the calculated amounts. Manual earnings, charges and first-cutoff SSS corrections use that saved snapshot. Recalculation uses the latest setup and keeps existing manual earnings and charges. An SSS correction is unavailable when SSS is pending. Approved and closed payroll retain their saved amounts and exports.

Migration `031_employee_government_contribution_settings.sql` adds a validated JSONB column to `payroll_employee_profiles`. The migration was created with Supabase CLI and adapted to the repository's numbered runner. It was applied to the configured database after a private backup outside Git. All 55 existing profiles retained enabled defaults; payroll row contents and database access restrictions were verified unchanged. The deployed API/frontend still need the normal release before the new controls work there.

## Suggested next work after the trial

1. **One employee profile:** merge Details, Schedule & pay, Leave, Login and History. Keep shift and working hours together, government contributions beside pay, and show unsaved changes before switching employees.
2. **One payday workspace:** combine Day/Night as filters within one run while retaining separate source uploads. Compare the combined totals and per-employee payslips with a second workbook payday before release.
3. **Versioned payroll policy:** expose contribution schedules, cutoff rules and fixed break/divisor settings with an effective date, validation and an audit trail. Keep the policy used by approved payroll immutable.
4. **Consolidated reporting:** add a dedicated monthly/yearly 13th-month summary and remittance reconciliation rather than duplicating deduction editing in Reports.
5. **Cleanup with evidence:** export CRM data before removal; remove practice flows only after HR can complete the live process; split server routes by business area while preserving existing permissions and response behavior.

The supplied document's embedded six-phase roadmap was not present in the Markdown text. These are recommended work packages, not a reconstruction of missing phase definitions.

## Validation

- Backend suite: 181 passed, 3 opt-in integration tests skipped, no failures.
- Isolated database workflow: passed separately, with all fixture writes rolled back. Covers saving/inheriting settings, pending agency amounts and employer shares, draft adjustments, recalculation, stale-setup approval rejection, re-enabling contributions and unchanged approved pay.
- Frontend utilities: 27 passed. Production build passed.
- Browser checks: management navigation, employee selection, government checkbox states, light/dark colors, Settings sections, report filters, payroll register download and phone-sized payday/stage layouts. No real salary, contribution status, attendance or payroll approval was changed for browser verification.

Frontend and backend changes remain local and uncommitted. The additive database migration has already been applied as described above.
