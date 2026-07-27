const ExcelJS = require('exceljs')
const { normalizeDateOnly } = require('./philippineHolidayService')

const HEADER_FILL = 'FF1F2937'
const HEADER_TEXT = 'FFFFFFFF'
const BORDER_COLOR = 'FFD1D5DB'
const ALTERNATE_ROW_FILL = 'FFF9FAFB'

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asExcelDate(value) {
  const normalized = normalizeDateOnly(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function styleWorksheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  }

  const headerRow = sheet.getRow(1)
  headerRow.height = 24
  headerRow.font = { bold: true, color: { argb: HEADER_TEXT } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  })

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    row.alignment = { vertical: 'middle' }
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALTERNATE_ROW_FILL } }
      })
    }
    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: BORDER_COLOR } },
      }
    })
  }
}

function buildEmployeeSummaries(rows) {
  const summaries = new Map()

  rows.forEach((row) => {
    const key = String(row.employee_id || row.employee_code || row.employee_name || '')
    const current = summaries.get(key) || {
      employee_code: row.employee_code || '',
      employee: row.employee_name || row.employee_id || '',
      department: row.department || '-',
      approved_paid_days: 0,
      approved_unpaid_days: 0,
      deduct_salary_days: 0,
      request_count: 0,
    }
    current.approved_paid_days += asNumber(row.paid_days)
    current.approved_unpaid_days += asNumber(row.unpaid_days)
    current.deduct_salary_days += asNumber(row.unpaid_days)
    current.request_count += 1
    summaries.set(key, current)
  })

  return [...summaries.values()].sort((left, right) =>
    String(left.employee).localeCompare(String(right.employee))
  )
}

function addDetailSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Payroll Leave Detail')
  sheet.columns = [
    { header: 'Employee code', key: 'employee_code', width: 15 },
    { header: 'Employee', key: 'employee', width: 28 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Leave type', key: 'leave_type', width: 22 },
    { header: 'Leave start', key: 'leave_start', width: 15 },
    { header: 'Leave end', key: 'leave_end', width: 15 },
    { header: 'Working days', key: 'working_days', width: 14 },
    { header: 'Paid days', key: 'paid_days', width: 12 },
    { header: 'Unpaid days', key: 'unpaid_days', width: 13 },
    { header: 'Salary deduction days', key: 'deduct_salary_days', width: 21 },
    { header: 'Pay treatment', key: 'pay_treatment', width: 16 },
  ]

  rows.forEach((row) => {
    sheet.addRow({
      employee_code: row.employee_code || '',
      employee: row.employee_name || row.employee_id || '',
      department: row.department || '-',
      leave_type: row.leave_type_name || row.leave_type_id || '',
      leave_start: asExcelDate(row.start_date),
      leave_end: asExcelDate(row.end_date),
      working_days: asNumber(row.leave_days),
      paid_days: asNumber(row.paid_days),
      unpaid_days: asNumber(row.unpaid_days),
      deduct_salary_days: asNumber(row.unpaid_days),
      pay_treatment: String(row.leave_pay_type || 'unpaid').toUpperCase(),
    })
  })

  sheet.getColumn('leave_start').numFmt = 'mmm d, yyyy'
  sheet.getColumn('leave_end').numFmt = 'mmm d, yyyy'
  styleWorksheet(sheet)
}

function addSummarySheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Employee Summary')
  sheet.columns = [
    { header: 'Employee code', key: 'employee_code', width: 15 },
    { header: 'Employee', key: 'employee', width: 28 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Approved paid days', key: 'approved_paid_days', width: 19 },
    { header: 'Approved unpaid days', key: 'approved_unpaid_days', width: 21 },
    { header: 'Salary deduction days', key: 'deduct_salary_days', width: 21 },
    { header: 'Request count', key: 'request_count', width: 14 },
  ]

  buildEmployeeSummaries(rows).forEach((summary) => sheet.addRow(summary))
  styleWorksheet(sheet)
}

function buildLeavePayrollWorkbook(rows) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Joyno HR'
  workbook.created = new Date()
  addDetailSheet(workbook, rows)
  addSummarySheet(workbook, rows)
  return workbook
}

module.exports = {
  buildEmployeeSummaries,
  buildLeavePayrollWorkbook,
}
