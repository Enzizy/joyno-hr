const test = require('node:test')
const assert = require('node:assert/strict')
const { rescheduleLeave } = require('./services/leaveRescheduleService')

// Judy Ann's sick leave plotted on Sep 28–Oct 2 (5 paid days, 5 credits taken), moved by HR.
function setup({ leave = {}, finalized = null, overlap = null, credits = 3 } = {}) {
  const state = { credits, leave: { id: 86, employee_id: 7, status: 'approved', start_date: '2026-09-28', end_date: '2026-10-02',
    leave_type_name: 'Sick Leave', leave_pay_type: 'paid', leave_days: 5, paid_days: 5, unpaid_days: 0, credits_deducted: 5, day_fraction: 1, ...leave } }
  const calls = []
  const tx = { async query(sql, params = []) {
    calls.push(sql)
    if (sql.startsWith('SELECT * FROM leave_requests')) return { rows: [{ ...state.leave }] }
    if (sql.includes('FROM payroll_runs')) return { rows: finalized ? [finalized] : [] }
    if (sql.includes('SELECT id FROM leave_requests')) return { rows: overlap ? [overlap] : [] }
    if (sql.startsWith('UPDATE employees SET leave_credits = leave_credits +')) { state.credits += params[0]; return { rows: [] } }
    if (sql.startsWith('UPDATE employees SET leave_credits = GREATEST')) { state.credits = Math.max(0, state.credits - params[0]); return { rows: [] } }
    if (sql.includes('FROM employees')) return { rows: [{ id: 7, date_hired: '2025-01-10', leave_credits: state.credits }] }
    if (sql.startsWith('UPDATE leave_requests')) { Object.assign(state.leave, { start_date: params[0], end_date: params[1], leave_type_name: params[2], paid_days: params[5], credits_deducted: params[7] }); return { rows: [] } }
    throw new Error(`Unexpected query: ${sql}`)
  } }
  const deps = { db: { transaction: cb => cb(tx) }, employeeColumns: '*', user: { id: 1, role: 'hr' },
    resolveLeaveType: async name => ({ id: 'sick', name, paid_days_per_year: 5 }),
    resolveEffectiveLeaveType: async type => type,
    resolveLeaveCompensation: async (employee, type, start, end, doc, queryDb, options) => {
      if (options.dayFraction < 1 && start !== end) throw new TypeError('Half-day leave requires a single date')
      assert.equal(options.excludeRequestId, 86)
      const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1
      return { leaveDays: days, paidDays: days, unpaidDays: 0, leavePayType: 'paid', creditsDeducted: days, note: `All ${days} day(s) are paid.` }
    } }
  return { state, calls, run: input => rescheduleLeave({ ...deps, id: 86, input }) }
}

test('moving a leave gives back its credits and charges the new dates', async () => {
  const { state, run } = setup()
  const result = await run({ start_date: '2026-10-28', end_date: '2026-10-29' })
  assert.equal(state.leave.start_date, '2026-10-28')
  assert.equal(state.leave.end_date, '2026-10-29')
  assert.equal(state.leave.credits_deducted, 2)
  assert.equal(state.credits, 3 + 5 - 2)
  assert.deepEqual(result.before, { start_date: '2026-09-28', end_date: '2026-10-02', leave_type_name: 'Sick Leave', paid_days: 5, unpaid_days: 0 })
  assert.equal(result.after.paid_days, 2)
})

test('a leave cannot move onto another leave, into finalized payroll, or off a single half-day', async () => {
  await assert.rejects(setup({ overlap: { id: 90 } }).run({ start_date: '2026-10-28', end_date: '2026-10-29' }), /another leave on these dates/)
  await assert.rejects(setup({ finalized: { payday: '2026-10-15', status: 'approved' } }).run({ start_date: '2026-10-28', end_date: '2026-10-29' }),
    /2026-10-15 payroll covering these dates is approved. Undo its approval first/)
  await assert.rejects(setup({ leave: { day_fraction: 0.5, start_date: '2026-09-28', end_date: '2026-09-28' } }).run({ start_date: '2026-10-28', end_date: '2026-10-29' }),
    /half-day leave stays on a single date/)
  await assert.rejects(setup({ leave: { status: 'rejected' } }).run({ start_date: '2026-10-28', end_date: '2026-10-29' }), /Only pending or approved/)
  await assert.rejects(setup().run({ start_date: '2026-10-29', end_date: '2026-10-28' }), /valid start and end date/)
  await assert.rejects(setup().run({ start_date: '2026-09-28', end_date: '2026-10-02' }), /Nothing changed/)
})

test('a pending leave moves without touching credits', async () => {
  const { state, run } = setup({ leave: { status: 'pending', credits_deducted: 0 } })
  await run({ start_date: '2026-11-02', end_date: '2026-11-03' })
  assert.equal(state.credits, 3)
  assert.equal(state.leave.credits_deducted, 0)
})
