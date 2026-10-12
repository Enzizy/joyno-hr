# Monthly contributions: HR clarification, 12 October 2026

SSS uses both paydays in the payroll month. Each cutoff contributes basic pay after absence, late and undertime deductions, plus overtime and night differential. Basic-pay corrections also count. COLA, other allowances and loan deductions do not enter this basis; the employee's take-home net pay is not the SSS basis.

The workbook confirms this in Remittance G9: current net basic (PAYROLL REGISTER J8) + overtime (K8) + night differential (L8) + basic adjustments (S8). Remittance F contains manually entered first-cutoff eligible pay; H adds F and G before the SSS bracket lookup. Employee SSS includes the ordinary EE and MPF-EE shares (Q).

The application already follows that calculation. An approved or closed 15th run supplies the actual first-cutoff eligible pay, including saved automatic/manual OT and ND. Real and practice runs use separate sources. Without a saved eligible run, the draft defaults to half the current monthly basic. HR can make an optional correction through Review pay → Adjust pay → Correct previous payroll amount. This section starts collapsed and shares the adjustment panel's Save button. The default remains a warning, not an approval blocker; check it against actual 15th records when attendance deductions or extra earnings changed that amount. Recalculate a month-end draft if the 15th payroll is approved afterward.

SSS, PhilHealth and Pag-IBIG deductions are applied only on the second/month-end cutoff when contributions are enabled. Each employee's saved government contribution settings determine which agencies apply. PhilHealth and Pag-IBIG continue using the salary-based rules already configured in the app, independently of the SSS monthly earnings basis.

All ten populated workbook Remittance employee SSS amounts match the application lookup. For example, F15 = 6,336.21 and G15 = 4,732.76, giving H15 = 11,068.97 and Q15 = 550.00. Treating the first cutoff as half a 15,000 monthly salary instead would yield 12,232.76 and 600.00 SSS: the actual first-cutoff amount matters.

This verifies the HR clarification, not every contribution boundary in the workbook. Its additional current-cutoff >1,500 gate and literal PhilHealth floor/cap differ from the app, as recorded in payroll-workbook-reference.md. These rules were not changed or treated as new company policy. The workbook's ten samples have zero ND, so an additional automated test covers nonzero ND and OT, missed-time deductions, and excluded allowances/personal charges in the saved-first-cutoff path.

No original workbook, employee payroll record, or approved payroll amount was changed by this verification.
