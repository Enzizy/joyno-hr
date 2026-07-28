const test = require('node:test')
const assert = require('node:assert/strict')
const { getLeaveCalendarAccessPolicy } = require('./routes/leaveInsightsRoutes')

test('employees only receive approved department calendar entries without sensitive details', () => {
  const policy = getLeaveCalendarAccessPolicy({ role: 'employee', employee_id: 42 })

  assert.deepEqual(policy, {
    management: false,
    employeeId: 42,
    includePending: false,
    sameDepartmentOnly: true,
    discloseSensitiveDetails: false,
  })
})

test('management retains pending visibility and unrestricted calendar access', () => {
  const policy = getLeaveCalendarAccessPolicy({ role: 'hr', employee_id: 7 })

  assert.deepEqual(policy, {
    management: true,
    employeeId: null,
    includePending: true,
    sameDepartmentOnly: false,
    discloseSensitiveDetails: true,
  })
})
