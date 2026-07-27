const test = require('node:test')
const assert = require('node:assert/strict')
const {
  buildEmployeeSummaries,
  buildLeavePayrollWorkbook,
} = require('./services/leavePayrollWorkbookService')
const { normalizeDateOnly } = require('./services/philippineHolidayService')

const rows = [
  {
    employee_id: 1,
    employee_code: 'E-001',
    employee_name: 'Sample Employee',
    department: 'Operations',
    leave_type_name: 'Sick Leave',
    start_date: '2026-07-27',
    end_date: '2026-07-27',
    leave_days: 1,
    paid_days: 1,
    unpaid_days: 0,
    leave_pay_type: 'paid',
  },
  {
    employee_id: 1,
    employee_code: 'E-001',
    employee_name: 'Sample Employee',
    department: 'Operations',
    leave_type_name: 'Vacation Leave',
    start_date: '2026-08-03',
    end_date: '2026-08-04',
    leave_days: 2,
    paid_days: 1,
    unpaid_days: 1,
    leave_pay_type: 'partial_paid',
  },
]

test('builds employee payroll totals from detailed leave rows', () => {
  const summaries = buildEmployeeSummaries(rows)
  assert.deepEqual(summaries, [{
    employee_code: 'E-001',
    employee: 'Sample Employee',
    department: 'Operations',
    approved_paid_days: 2,
    approved_unpaid_days: 1,
    deduct_salary_days: 1,
    request_count: 2,
  }])
})

test('creates payroll detail and employee summary worksheets', () => {
  const workbook = buildLeavePayrollWorkbook(rows)
  const detail = workbook.getWorksheet('Payroll Leave Detail')
  const summary = workbook.getWorksheet('Employee Summary')

  assert.equal(detail.rowCount, 3)
  assert.equal(detail.getRow(2).getCell(4).value, 'Sick Leave')
  assert.equal(normalizeDateOnly(detail.getRow(2).getCell(5).value), '2026-07-27')
  assert.equal(summary.rowCount, 2)
  assert.equal(summary.getRow(2).getCell(7).value, 2)
})
