// Production releases keep Pay hidden while payroll is being tested locally.
export const payrollEnabled = import.meta.env.DEV && import.meta.env.VITE_PAYROLL_ENABLED === 'true'
