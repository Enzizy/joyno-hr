# Admin payroll workbook reference

Reviewed 5 October 2026. Source: `FOR TESTING.xlsm`, supplied by the user as the company's admin payroll workflow.

Source SHA-256: `4a8e2157e32ccd469d58b7c6988e8f4b13559ffc305a28d15b5a721f6c4abd91`.

This is a record of what the workbook does, including its exceptions and defects. It is not a decision to implement every formula literally. The original workbook was read without saving changes or executing VBA. No payroll application logic or production deployment was changed in this review. Employee names, contact details, bank accounts, and government identifiers are omitted here.

## Workflow

The calculation flow is employee information and pay rates, plus admin-entered timekeeping and charges, into a payroll register. The register and remittance schedules exchange the relevant gross-pay and deduction components. Payslip templates and a request for payment consume the finished amounts.

| Sheet | Admin inputs and purpose | Downstream use |
| --- | --- | --- |
| MASTERFILE | Employee number, identity, hire date, position, department/area, pay type, monthly/daily rate, COLA, ATM flag, minimum-wage flag, tax shield, and government IDs. | Rates and employee details throughout the workbook. |
| CHARGES | Loan deductions, cash advances, descriptions, allowances, and two adjustment amounts with reasons. Global switches control statutory deductions and some loan deductions. | Register allowances, adjustments, and loans; payslip descriptions. |
| TIMEKEEPING | Period, payday, cutoff, working/holiday days, paid leave, absence days, tardiness/undertime minutes, overtime hours, night hours, and premium codes/factors. | Register earnings and missed-time deductions. |
| PAYROLL REGISTER | Calculates per-employee payroll. Employee numbers and some bank/payment fields are manual. Includes additional columns for 13th-month accrual. | Payslips, remittances, totals, and payment request. |
| Remittance | First-cutoff SSS compensation is manually entered. Calculates current-cutoff compensation, employee/employer contributions, and withholding tax. | Register statutory deductions and remittance summaries. |
| RANGES | SSS bracket schedule and lists of cutoff/day-type codes. | Contribution lookups and timekeeping dropdowns. |
| PAYSLIP01 | Large repeated payslip layout. | Batch-style presentation, with many damaged references. |
| PAYSLIP02 | Employee-name selector and a duplicate printable payslip. | PDF export, printing, and Outlook draft macros. |
| PAYSLIP SUMMARY | Employee-number selector and a detailed earnings/deductions breakdown. | Individual review, including separate overtime and night components. |
| RFP | Payee selector and current request date. | Request for payment linked to the register's net-pay total. |

The workbook contains 31,004 formula cells and 10 populated employee records. Template capacity differs: MASTERFILE reaches row 212, TIMEKEEPING row 210, CHARGES row 209, Remittance row 204, and the register table row 80. Do not assume these capacities define one reliable employee list.

The supplied example covers 11–25 September 2026, with payday 30 September and cutoff `2nd` (`TIMEKEEPING!I2`, `N2`, `R2`, `R4`). Dates and cutoff are manual inputs. The workbook alone does not establish every first-cutoff date convention. The current app separately uses previous-month 26th through current-month 10th for its first cutoff.

## Rates and basic pay

`MASTERFILE!J9` selects `SM` or `PD`. All ten populated examples use `SM`; the per-day branch is present but is not exercised by these samples.

| Calculation | Observed formula/rule | Representative source |
| --- | --- | --- |
| Daily rate for monthly-paid staff | Monthly rate × 12 ÷ 261. Keep full precision until the amount being paid/deducted is rounded. | MASTERFILE!L9 |
| Hourly rate | Daily rate ÷ 8. | PAYROLL REGISTER!G8, K8 |
| SM cutoff basic salary | Monthly rate ÷ 2, rounded to two decimals. | PAYROLL REGISTER!E8 |
| PD cutoff basic salary | Regular working days × daily rate, rounded to two decimals. | PAYROLL REGISTER!D8:E8 |
| Absence deduction | Absence days × daily rate, rounded to two decimals. | PAYROLL REGISTER!F8 |
| Tardiness/undertime | Combined missed minutes ÷ 60 × daily rate ÷ 8, rounded once. | PAYROLL REGISTER!G8 |
| Paid-leave add-back | Paid-leave days × daily rate, rounded to two decimals. | PAYROLL REGISTER!I8 |
| Net basic salary | Basic − absence deduction − missed-time deduction + paid-leave add-back. | PAYROLL REGISTER!J8 |

Paid leave is entered manually in `TIMEKEEPING!AL`. It is not an eligibility/leave-balance engine. In one populated example, one absence deduction is canceled by one paid-leave add-back. When connecting the app's approved leave, ensure the same paid day is not both exempted from deduction and added again. The user's newer three-month leave eligibility and separate SIL policy remain authoritative.

The last three MASTERFILE template rows instead derive monthly rate from daily rate × 26.0833333333333 (`K210:K212`). This is not the inverse of × 12 ÷ 261. Confirm the intended PD salary convention before implementing it.

`PAYROLL REGISTER!H8` calculates actual-worked-days pay, but that column is not added to `J8` or gross pay. Its label alone must not be interpreted as an additional earning.

## Overtime, holidays, and night pay

Regular overtime is hourly rate × 1.25 × regular OT hours. Three other OT slots feed weighted hours into the same rounded OT total (`TIMEKEEPING!S/V/Y`, `PAYROLL REGISTER!K8`).

| Day code | OT multiplier in first slot | Observed exception |
| --- | --- | --- |
| WRH | 2 | Second and third slots use 2 × 1.3 instead. This inconsistency needs confirmation. |
| WSH/RD | 1.3 × 1.3 | Consistent across the three slots. |
| WSH+RD | 1.5 × 1.3 | |
| WSH+RD+RH | 3 × 1.3 | |
| WRD/SH+RH | 2.6 × 1.3 | |
| WRH2 | 3 × 1.3 | |
| WRH2+RD | 3.9 × 1.3 | |
| WSH2 | 1.69 × 1.3 | Duplicate WSH2 branch in the second slot. |

The dedicated worked-day columns separately calculate regular-holiday days × 2 × daily rate, rest-day days × 1.3 × daily rate, and special-holiday days × 1.3 × daily rate (`M8:O8`). Another premium column uses manually entered factor × day fraction × daily rate (`P8`). These four amounts sum into `Q8`.

The populated SM holiday examples use the **other-premium** fields, with factor 0.30. A fraction of 0.875 represents seven paid hours out of eight. This adds only the 30% premium because semi-monthly basic pay is already present. Do not add the dedicated full holiday amount and the other-premium amount for the same work without confirming the pay model.

Night differential (`L8`) sums these components before rounding:

| Night category | Multiplier on hourly rate × hours |
| --- | --- |
| Regular ND | 0.10 |
| Regular ND overtime | 0.10 × 1.25 |
| Regular-holiday ND | 0.10 × 2 |
| Regular-holiday ND overtime | 0.10 × 1.3 × 2 |
| Special-holiday/rest-day ND | 0.10 × 1.3 |
| Special-holiday/rest-day ND overtime | 0.10 × 1.3 × 1.3 |
| Other ND and other ND OT | Day-code factors from TIMEKEEPING!AI/AJ. |

`TIMEKEEPING!Z10` defaults regular night hours to 7 × actual worked days, even though the sample register is labeled Dayshift. `AK10` totals only regular ND hours, while the register amount includes all night categories. Confirm whether the default applies to any real shift. The ten populated samples have no ND amount, so they do not validate the nonzero ND branches.

## COLA, charges, gross pay, and net pay

`CHARGES!K11` pulls monthly COLA ÷ 2. For SM staff this becomes the register allowance. The PD branch also adds a days-based COLA expression (`PAYROLL REGISTER!R8`). Its double-holiday nested term includes COLA inside an expression multiplied by COLA again; the PD branch needs separate verification.

`CHARGES!G4` controls the SSS salary/calamity and Pag-IBIG MPL/calamity loan columns. MP2 and the two advances columns are added independently of that switch. All six calculated deduction categories sum into CHARGES column Q. `G2` independently controls government contributions through register column V. Do not merge these two switches.

Both CHARGES adjustment amounts, M and O, are combined into register column S. Only M is separately brought into the register's 13th-month basic-pay build. The headings distinguish basic adjustment from a second adjustment, so their contribution/accrual treatment must be confirmed rather than flattened into one category.

Gross pay is net basic + OT + ND + holiday/rest-day subtotal + allowance + adjustments, rounded to two decimals (`T8`). Statutory deductions, withholding tax, and CHARGES loan total sum into AA. Net pay is gross minus those deductions, rounded to two decimals (`AB8`). The workbook does not clamp this formula to zero.

Totals use SUBTOTAL(9, ...), which responds to filtering. A funding total must explicitly identify its employee population rather than inherit an incidental screen filter.

## Remittance and withholding

The following describe this workbook's literal formulas. Their current legal or company-policy validity was not established by this review.

**SSS:** manually entered first-cutoff compensation (`Remittance!F9`) plus current net basic + OT + ND + both adjustments (`G9`) forms the bracket basis. COLA and the separate holiday/rest-day premium are excluded. The basis is enabled only when the contribution switch is YES, an SSS number exists, and the current-cutoff basis exceeds 1,500 (`H9`). This condition applies to the current-cutoff amount, not the combined monthly amount.

`RANGES!A4:A64` supplies approximate lower-bound bracket matching. Regular SS salary credit rises to 20,000; MPF supplies the additional credit up to a combined 35,000. Employee and employer amounts are separate regular-SS/MPF columns, with an additional employer EC amount. The register deducts employee regular SS plus MPF; employer amounts stay in the remittance report.

**PhilHealth:** the basis is MASTERFILE monthly rate, subject to the same contribution switch/current-basis >1,500 condition and an existing PhilHealth number. Each share is 200 below 10,001, monthly rate × 5% ÷ 2 below 80,000, and 1,600 at or above 80,000 (`AA9:AB9`). This creates a decrease at 80,000. It differs from the local app's current floor/cap schedule and needs a decision before implementation.

**Pag-IBIG:** employee share is a fixed 200 when enabled, a membership ID exists, and the current-cutoff basis exceeds 1,500. Employer share equals the employee share (`AI9:AJ9`).

**Tax:** MWE status forces taxable pay to zero. Otherwise, taxable pay is gross − employee SSS − employee PhilHealth − employee Pag-IBIG − MASTERFILE tax shield − CHARGES allowance (`AR9`). Tax goes into the register only when a TIN is present.

| Taxable cutoff pay | Literal tax expression in Remittance!AS9 |
| --- | --- |
| ≤ 10,417 | 0 |
| ≤ 16,666 | (pay − 10,417) × 15% |
| ≤ 33,332 | 937.5 + (pay − 16,667) × 20% |
| ≤ 83,332 | 4,270.7 + (pay − 33,333) × 25% |
| ≤ 333,332 | 16,770.7 + (pay − 83,333) × 30% |
| ≥ 333,333 | 91,770.7 + (pay − 333,333) × 35% |

There is no specified numeric branch between 333,332 and 333,333; the final IF falls back to FALSE. Other thresholds also have differing subtraction bases. Preserve these as findings, not accepted requirements. Tax itself is not explicitly rounded in AS9. All ten populated examples have zero withholding, so they do not verify positive-tax behavior.

## 13th-month accrual

The additional register build in AJ:BC separates pay type, basic rate, days, holidays, basic adjustment, paid leave, and absences. `BB8` adds basic salary + its regular/special holiday components + CHARGES M basic adjustment + paid-leave add-back − absences. It excludes the missed-minute deduction, COLA, OT, ND, and the separate rest-day/other premium. `BC8` rounds that cutoff base ÷ 12 to two decimals.

This is an accrual per payroll line. The supplied workbook does not itself show a complete annual accrual ledger or SIL cash conversion workflow.

## VBA workflow

Source code was extracted and read statically. No PDF was created, no printer was used, and no message was sent.

| Procedure/module | Observed behavior |
| --- | --- |
| updatepayreg / updateremittance | Filter Table8/Table9 to nonblank calculated status in column 2. |
| RESETPAYSLIP | Restore the employee lookup in PAYSLIP02!F13 after a batch operation. |
| SavePayslips | Loop register employee numbers; overwrite F13; export A7:U62 to PDF; restore the lookup afterward. The selected save path is stored but not used in its export filename. |
| PrintSalarySlips | Loop the same register rows and print the first page, then restore F13. |
| SendAllPaySlips | Export A7:J62 to PDF and prepare an Outlook message with an attachment. Uses .Display, not .Send. Recipient comes from W54, which is blank in this supplied file. The source does not restore F13 afterward. |
| Module1 | SpellNumber and helpers turn an amount into peso text. No worksheet formula using SpellNumber was found in the extracted formula inventory. |
| updatepayslipcount | Copies the current selection; its name does not describe a count calculation. |

Batch loops use the count in PAYSLIP02!AA4 but fetch consecutive physical register rows. They do not explicitly iterate a validated set of selected employees. The saved count is 12, while MASTERFILE has 10 populated employees. This mismatch needs examination before relying on batch output.

Empty/stub form event procedures also exist. Their runtime/compile behavior was not tested.

## Verification and defects

Independent decimal arithmetic reproduced **170 component results across all ten populated SM payroll rows**, including basic pay, absence and missed-minute deductions, leave add-backs, OT, other holiday premium, allowance, adjustments, employee contributions, loans, gross/net pay, and 13th-month accrual. All matched saved results within a very small floating-point tolerance. SSS lookup used the supplied schedule, not an externally verified contribution schedule.

The ten net-pay amounts sum to **72,725.27**, matching `PAYROLL REGISTER!AB81` and `RFP!F12` to the cent. This is reconciliation against saved workbook results, not proof of live Excel recalculation after arbitrary input changes. PD, nonzero tax, nonzero ND, and most holiday-code branches remain unexercised by the ten examples.

Confirmed formula/reference problems include:

- `TIMEKEEPING!C21` is `=#REF!`; later cutoff cells propagate it. `AM24` also directly references a deleted MASTERFILE cell.
- `PAYROLL REGISTER!AT29` has a broken reference in its PD holiday-day branch. Saved errors also occur at AX28/AZ28 where day counts divide by a missing/zero rate.
- PAYSLIP01 contains 401 formulas with literal broken references and many additional saved lookup/value errors. Its repeated layout cannot be assumed to be the working output.
- Several extended timekeeping dropdowns point at RANGES column T, although the populated source lists are in O/P. Validation definitions differ across row blocks.
- PAYSLIP SUMMARY adjustment-description formula A35 matches against C3 rather than the employee selector B3. Some other payslip detail labels use the wrong hours/days source or approximate matching.

Saved cell errors by sheet/type: TIMEKEEPING 189 #REF!; PAYROLL REGISTER two #DIV/0!; PAYSLIP01 1,125 #REF!, 944 #N/A, and four #VALUE!. Many are in unused template areas. Do not infer that all populated payroll rows are broken from this count; the ten populated register rows reconciled.

## Implications for the local payroll app

Follow-up verification on 5 October is recorded in `payroll-verification.md`. It confirms the existing remittance preview, PDF/print, and controlled email/finalization code, reproduces the ten workbook net-pay examples using actual application functions, and identifies current database setup blockers. The original workbook mapping below should be read alongside that implementation check.

Existing local calculation code already covers semi-monthly basic salary, the 261 divisor, an eight-hour paid day, combined missed-time rounding, COLA, charges, first-cutoff SSS input, selected holiday premiums, and basic 13th-month accrual. The workbook adds detail that is not yet faithfully represented:

| Area | Difference requiring later work/decision |
| --- | --- |
| Pay types | Workbook contains PD and SM branches; current calculator takes monthly basic salary. PD behavior needs samples. |
| SSS basis | Workbook includes ND and both adjustments; current calculateSssAssessablePay includes OT and basic-pay adjustments, but has no separate ND/second-adjustment basis. |
| Contribution eligibility | Workbook has global switches, membership-ID checks, and a current-cutoff >1,500 condition. Current calculation is principally gated by cutoff/includeContributions. |
| PhilHealth | Workbook's literal 200/80,000/1,600 rules differ from the local app's 5% schedule using a 10,000 floor and 100,000 cap. |
| Taxes | No withholding/MWE/tax-shield calculation was found in the current local payroll calculation/charge services. |
| OT and ND | Workbook has three coded OT slots and a full ND breakdown. Current app supports selected manually approved earnings and a limited special-holiday calculator. |
| Paid leave | Workbook adds paid-leave pay back against attendance deductions. The app already knows paid/unpaid leave; integration must avoid a double payment. |
| Adjustments/accrual | Workbook distinguishes two adjustments but includes only one in its accrual build. Current app needs explicit classification if both are introduced. |
| Outputs | Workbook has remittance schedules, several payslip formats, filters, PDF/print loops, and a payment request. These are separate admin tasks, not just a net-pay calculator. |

Before implementation, settle the current contribution/tax schedules, intended holiday and night rules, which adjustment affects each basis, and which payslip/remittance outputs the admin actually relies on. Obtain PD, positive-tax, and nonzero-ND examples to cover branches missing from this sample. Payroll remains hidden in production pending that work.
