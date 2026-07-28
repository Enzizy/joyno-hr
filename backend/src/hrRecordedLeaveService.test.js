const test = require('node:test')
const assert = require('node:assert/strict')
const { createHrRecordedLeave } = require('./services/hrRecordedLeaveService')

function createDependencies({ overlap = false } = {}) {
  const calls = []
  const tx = {
    async query(sql, params) {
      calls.push({ sql, params })
      if (sql.includes('FROM employees')) {
        return {
          rows: [{
            id: 7,
            employee_code: 'E-007',
            first_name: 'Test',
            last_name: 'Employee',
            date_hired: '2024-01-01',
            leave_credits: 8,
          }],
        }
      }
      if (sql.includes('SELECT id FROM leave_requests')) {
        return { rows: overlap ? [{ id: 99 }] : [] }
      }
      if (sql.includes('INSERT INTO leave_requests')) return { rows: [{ id: 42 }] }
      return { rows: [] }
    },
  }

  return {
    calls,
    dependencies: {
      db: { transaction: (callback) => callback(tx) },
      entry: {
        employee_id: 7,
        leave_type_name: 'Vacation Leave',
        start_date: '2026-08-03',
        end_date: '2026-08-03',
        description: 'Submitted by written letter.',
        supporting_document_received: false,
      },
      user: { id: 3, email: 'hr@example.test', role: 'hr' },
      employeeColumns: 'id, employee_code, first_name, last_name, date_hired, leave_credits',
      resolveLeaveType: async () => ({ id: 'vacation_leave', name: 'Vacation Leave' }),
      resolveEffectiveLeaveType: async (leaveType) => leaveType,
      calculateTenureMonths: () => 24,
      resolveLeaveCompensation: async () => ({
        leavePayType: 'paid',
        leaveDays: 1,
        paidDays: 1,
        unpaidDays: 0,
        creditsDeducted: 1,
        note: '1 paid day',
      }),
    },
  }
}

test('records an HR-entered leave as approved and deducts paid credits transactionally', async () => {
  const { calls, dependencies } = createDependencies()
  const result = await createHrRecordedLeave(dependencies)

  assert.equal(result.id, 42)
  assert.equal(result.source, 'hr_recorded')
  assert.equal(result.compensation.creditsDeducted, 1)
  assert.ok(calls.some(({ sql }) => sql.includes("'approved'")))
  assert.ok(calls.some(({ sql }) => sql.includes('leave_credits = GREATEST')))
})

test('rejects an HR-entered leave that overlaps an existing request', async () => {
  const { dependencies } = createDependencies({ overlap: true })

  await assert.rejects(
    () => createHrRecordedLeave(dependencies),
    (error) => error.status === 400 && error.message.includes('already has')
  )
})
