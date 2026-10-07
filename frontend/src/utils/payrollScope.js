export const payrollShift = value => value === 'night' ? 'night' : 'day'
export const reviewScope = review => review?.payroll_scope || review?.payrollScope || 'all'
export const runScope = run => run?.rule_snapshot?.payrollScope || 'all'
export const shiftLabel = shift => shift === 'night' ? 'Night shift' : shift === 'day' ? 'Day shift' : 'Both shifts · older run'
