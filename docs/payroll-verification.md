# Payroll and biometric DTR verification

Verified 5 October 2026 against the current local working files, the user-supplied admin workbook, and the biometric CSV. This records verification results, not a payroll release or a completed employee setup.

## Conclusion

Most core payroll functions are already implemented in the local application. The door-reader mapping and daily endpoint selection follow the user's stated rule, including New Bio endpoints. Core workbook examples reproduce correctly. The missing COLA schema update has now been applied and 29 of the 30 CSV identities are mapped. Salary profiles still need the user's manual setup before saved payroll calculations can cover the export dates.

The initial verification used read-only database checks. After the user requested database setup, migration 022 and confirmed biometric identities were applied in transactions with backups. No supplied attendance records were imported, no salary amounts were assigned, and payroll was not released. Email delivery was exercised only by existing mocked tests; no employee message was sent.

## DTR rule confirmed by the user

| Raw checkpoint | Meaning | Daily selection |
| --- | --- | --- |
| Main_Door_Out_Door1_Entrance Card Reader1 | Time in | Earliest matching scan for the employee on that local day. |
| Main_Door_IN_Door1_Entrance Card Reader1 | Time out | Latest matching scan for the employee on that local day. |
| New Bio_New Office Biometrics_Entrance Card Reader1 | Either daily endpoint | Can provide the earliest arrival or latest departure. Intermediate scans do not change endpoints. |

The importer uses Person ID rather than assuming a biometric identifier is the HR employee number. It strips the leading apostrophe but preserves leading zeroes. HR maintains an explicit, unique employee-to-Person-ID map.

Dates such as `09/01/26 8:46` are interpreted as 1 September 2026 at 08:46 in Asia/Manila (UTC+08:00). Grouping is by employee and local calendar day. Intermediate arrivals/departures do not become separate work periods or additional absence deductions. Repeated identical timestamp/direction events are deduplicated. The first recognized arrival and last recognized departure remain the DTR endpoints.

An incomplete pair, or a departure that is not after arrival, becomes an exception for HR review. No scans is also an exception unless an approved leave record supplies the classification. The code does not silently turn a missing punch into an absence. Default paid time is Monday–Friday, 09:00–18:00 with a 13:00–14:00 unpaid break; effective employee profiles control the schedule inputs. This same-day algorithm does not establish overnight-shift support.

Primary implementation: `backend/src/services/payrollAttendanceService.js` (checkpointDirection, parseAttendanceCsv, parseManilaTimestamp, computeDailyAttendance) and `backend/src/services/payrollService.js` (importAttendance and attendance corrections).

## Real-export verification

Source: `Original Records Report.csv`.

- 4,857 records, 30 distinct Person IDs, and 509 employee/calendar-day groups, covering 1–25 September 2026.
- Main Door Out: 2,223 scans. Main Door IN: 2,345 scans. New Bio / New Office Biometrics: 289 scans.
- No invalid timestamps found. 476 groups contain more than two scans. There are 216 repeated timestamp/direction rows after grouping by employee.
- An independent Python CSV parser calculated the expected reader-specific endpoints; the actual JavaScript parser and DTR function matched all 509 groups, including endpoints, completeness status, and deduplicated scan counts.
- 90 groups would differ if the system simply chose the first/last scan irrespective of direction. Main Door direction still matters.

Including New Bio endpoints gives 485 complete pairs and 24 incomplete groups across all calendar days. Of those incomplete groups, 22 lack a recognized time-out and two have endpoints that are not ordered as a complete pair. With the app's default Monday–Friday schedule, there are 505 scanned employee-days and 22 incomplete weekdays; the four weekend groups are not scheduled DTR rows. Before New Bio support, this file had 467 complete pairs and 42 incomplete calendar-day groups.

For example, Person ID `00000060` on 1 September has 17 scans. The system correctly produces **08:46 time in and 18:15 time out**. It does not use the lunchtime movements as the day's endpoints.

The user confirmed that New Bio must count when it provides the first time-in or last time-out. It is represented as an endpoint candidate rather than being assigned a fixed direction. A single scan cannot become a complete pair, even when repeated. Tests cover New Bio-only pairs, mixed-reader endpoints, interior scans, duplicates, and unknown readers.

The export uses Windows-1252 rather than valid UTF-8. Uploads now decode valid UTF-8 first and fall back to Windows-1252 so accented names remain intact. CSV inspection, preview, and saved import share this decoder.

## Payroll implementation coverage

| Function | Current implementation and verification | Limit |
| --- | --- | --- |
| Employee compensation setup | Effective-dated salary, monthly COLA, biometric identity mapping, and schedule inputs. Missing COLA migration applied; 29 identities mapped. | User will enter salaries and effective-dated profiles manually. |
| CSV/DTR workflow | Header aliases, reader direction, New Bio endpoints, Manila dates, duplicate handling, cutoff filtering, unmapped-ID errors, incomplete-day review, and manual corrections with reasons. | Profiles and mappings are prerequisites. Jhonpaul's employee record is pending user creation. |
| Basic and missed-time pay | Semi-monthly basic, 261-day divisor, eight-hour day, absence/unpaid/partial leave, lateness and undertime, and approved paid-leave treatment. | Calculator is salary-based; it does not expose the workbook's complete PD pay-type branch. |
| COLA, loans, and adjustments | COLA split across cutoffs; SSS/Pag-IBIG loan categories, MP2, cash advances, other charges, non-taxable earnings, and signed basic adjustments. Saved draft changes update net pay without adding duplicates. | Basic adjustment does not refresh 13th-month accrual. |
| OT and holiday earnings | Approved overtime amounts and a calculated 30% special-holiday premium using paid hours ÷ 8. Special-holiday overtime uses 130% × 130%. | All workbook holiday/OT code combinations are not automatic calculators; other approved amounts are manual. |
| Contributions | Employee/employer SSS, EC, PhilHealth and Pag-IBIG; approved first-cutoff source/HR override; SSS recalculation after relevant draft changes. | Workbook's membership/switch/1,500 threshold and some PhilHealth boundaries differ. Current SSS basis has no distinct ND earnings treatment. |
| Net pay and accrual | Payroll lines, deductions, net pay, and cutoff 13th-month accrual are calculated and saved. | Annual accrual payout and adjustment-driven accrual parity are not complete. |
| Review outputs | Saved payroll register, payslip preview, PDF download/print, employee/employer remittance preview and totals. | A workbook-style RFP, bank disbursement export, and complete government submission files were not found in this review. |
| Finalization/distribution | Approval, locking, employee payslip access, and email code exist, with role/status controls and duplicate-send protection. | Finalization is intentionally disabled in the current local environment. No actual email or approval was performed. |
| Tax and night differential | Other earnings can be entered manually. | No automatic withholding/MWE/tax-shield engine or full night-differential calculation was found. The UI explicitly states tax withholding is not enabled. |

The current implementation is broader than a basic net-pay calculator: it already provides setup, import, review, draft payroll, charges, outputs, and controlled distribution. It is not a complete literal replacement for every workbook formula/branch.

## Calculation evidence

The three payroll test files ran successfully: **44 tests passed, zero failures**. Coverage includes New Bio endpoints and New Bio-only import/inspection, Windows-1252 and UTF-8 names, door mapping, intermediate scans, duplicate/incomplete punches, explicit biometric identity mapping, cutoff periods, pay/contribution calculations, paid leave, charges, first-cutoff corrections, payslip PDFs, access controls, and mocked email behavior.

Using the workbook's ten populated employee examples, actual application calculation functions reproduced:

- All ten net-pay amounts.
- Their employee SSS, calculated other-holiday premiums, and unadjusted 13th-month accruals.
- The combined net-pay total of **72,725.27**.

These checks use the workbook's attendance totals, supplied first-cutoff amounts, and approved overtime amounts. Paid leave is normalized so a workbook absence/add-back pair becomes a paid day in the app. The comparison does not assert that the raw biometric CSV alone determines the workbook's manual overtime, leave, or adjustment decisions. All ten examples are SM employees, have no ND pay, and have zero withholding; they do not establish the unsupported branch results.

An additional in-memory check confirmed the accrual gap: adding a 300 basic adjustment to a 7,500 cutoff basic updates net pay/SSS but leaves accrual at 625. The workbook's basic-adjustment rule would make accrual 650. The updateCharges SQL does not update the accrual column. No actual payroll record was altered for that check.

## Connected database readiness

Setup used the database configured in the local backend, which is a shared hosted database. Before each mutation, employee/identity/profile/run-line data and schema/access metadata were backed up privately under `C:/Users/joynoinc/.codex/backups/hr-system/`. Existing salary profiles were preserved; COLA defaults to zero until explicitly configured. No unrelated migrations were run.

| Check | Observed result |
| --- | --- |
| Payroll tables | Biometric identities, pay profiles, and daily attendance tables exist. |
| Payroll migrations recorded | 020, 021, and the newly applied 022 COLA/charges migration are recorded. |
| COLA columns | payroll_employee_profiles.monthly_cola and payroll_run_lines.cola_pay now exist. |
| Actual profile read | createPayrollService.listProfiles succeeds and lists 42 employees. |
| CSV identity coverage | 29 of the 30 Person IDs map to active employees. The user will add the remaining new employee and enter his Person ID. |
| Client database access | Profiles, run lines, and identity mappings have RLS enabled and no SELECT/INSERT/UPDATE/DELETE access for anon/authenticated roles. Backend access verified. |
| Profile coverage | Two pay profiles exist; both start 1 October 2026 in Manila time. Neither mapped person has a profile covering the September CSV dates. |
| Local flags | Payroll enabled; payroll finalization disabled. |

Database schema and all currently identifiable CSV employees are now set up. The user confirmed the two differing names and will create the one missing employee. The user will enter actual salaries manually because the workbook amounts belong to sample names. Valid effective-dated profiles must cover the intended attendance dates before a saved import/payroll calculation can be considered ready.

## Remaining decisions

1. User entry of salary profiles and creation of the one missing employee.
2. Current company contribution/withholding rules where the workbook and app differ.
3. Whether PD pay, automated ND, every holiday-code combination, annual accruals, and RFP/bank outputs are in the next payroll scope.
4. Correct 13th-month accrual refresh for basic adjustments.
5. Complete September profile coverage and review the 22 incomplete scanned weekdays before evaluating a saved payroll run.
