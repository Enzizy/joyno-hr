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
  const insertCall = calls.find(({ sql }) => sql.includes('INSERT INTO leave_requests'))

  assert.equal(result.id, 42)
  assert.equal(result.source, 'hr_recorded')
  assert.equal(result.compensation.creditsDeducted, 1)
  assert.ok(insertCall.sql.includes("'approved'"))
  assert.ok(insertCall.sql.includes('$21::boolean'))
  assert.equal((insertCall.sql.match(/\$9(?!\d)/g) || []).length, 1)
  assert.equal(insertCall.params[17], dependencies.user.id)
  assert.equal(insertCall.params[20], false)
  assert.equal(insertCall.params[21], dependencies.user.id)
  assert.ok(calls.some(({ sql }) => sql.includes('leave_credits = GREATEST')))
})

test('records an offline supporting document without reusing the status SQL parameter', async () => {
  const { calls, dependencies } = createDependencies()
  dependencies.entry.leave_type_name = 'Sick Leave'
  dependencies.entry.supporting_document_received = true
  dependencies.resolveLeaveType = async () => ({
    id: 'sick_leave',
    name: 'Sick Leave',
    requires_attachment_for_paid: true,
  })

  await createHrRecordedLeave(dependencies)

  const insertCall = calls.find(({ sql }) => sql.includes('INSERT INTO leave_requests'))
  assert.equal(insertCall.params[17], dependencies.user.id)
  assert.equal(insertCall.params[18], true)
  assert.equal(insertCall.params[19], 'valid')
  assert.equal(insertCall.params[20], true)
  assert.equal(insertCall.params[21], dependencies.user.id)
  assert.doesNotMatch(insertCall.sql, /\$20\s*=\s*'valid'/)
})

test('rejects an HR-entered leave that overlaps an existing request', async () => {
  const { dependencies } = createDependencies({ overlap: true })

  await assert.rejects(
    () => createHrRecordedLeave(dependencies),
    (error) => error.status === 400 && error.message.includes('already has')
  )
})
