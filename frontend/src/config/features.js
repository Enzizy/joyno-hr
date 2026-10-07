// Payroll is live in production. Local development follows the .env flags, so it can be switched off there.
export const payrollEnabled = !import.meta.env.DEV || import.meta.env.VITE_PAYROLL_ENABLED === 'true'
export const payrollFinalizationEnabled = payrollEnabled && (!import.meta.env.DEV || import.meta.env.VITE_PAYROLL_FINALIZATION_ENABLED === 'true')
