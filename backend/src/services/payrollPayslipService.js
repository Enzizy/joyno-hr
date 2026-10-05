const { PDFDocument } = require('pdfkit')
const { dateKey } = require('./payrollAttendanceService')
const { CHARGE_TYPES, summarizeCharges } = require('./payrollChargesService')

const LABELS = Object.freeze({
  overtime: 'Approved overtime',
  special_holiday_pay: 'Legacy full holiday pay - review',
  holiday_premium: 'WSH/RD premium (30%)',
  other: 'Other earnings',
})

function amount(value) {
  return Number(value || 0)
}

function money(value) {
  return `PHP ${amount(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function payrollBreakdown(line) {
  const earnings = Array.isArray(line.details?.manualEarnings) ? line.details.manualEarnings : []
  const manualTotal = earnings.reduce((total, entry) => total + amount(entry.amount), 0)
  const charges = Array.isArray(line.details?.charges) ? line.details.charges : []
  const chargeTotals = summarizeCharges(charges)
  const chargeEarnings = charges.filter((entry) => entry.amount > 0 && CHARGE_TYPES[entry.type]?.direction !== 'deduction')
  const chargeDeductions = charges.filter((entry) => entry.amount < 0 || CHARGE_TYPES[entry.type]?.direction === 'deduction')
  const deductions = [
    ['Absence / unpaid leave', line.absence_deduction],
    ['Late', line.late_deduction],
    ['Undertime', line.undertime_deduction],
    ['SSS contribution', line.employee_sss],
    ['PhilHealth contribution', line.employee_philhealth],
    ['Pag-IBIG contribution', line.employee_pagibig],
    ...chargeDeductions.map((entry) => [`${CHARGE_TYPES[entry.type].label}: ${entry.note}`, Math.abs(amount(entry.amount))]),
  ]
  const totalDeductions = deductions.reduce((total, [, value]) => total + amount(value), 0)
  return { earnings, chargeEarnings, deductions,
    totalEarnings: amount(line.gross_salary) + amount(line.cola_pay) + manualTotal + chargeTotals.earnings,
    totalDeductions }
}

function payslipFilename(run, line) {
  const code = String(line.employee_code || line.employee_id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  const date = dateKey(run.payday)
  return `payslip-${code}-${date}.pdf`
}

async function renderPayslipPdf({ run, line }) {
  const breakdown = payrollBreakdown(line)
  const isDraft = run.status === 'draft'
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Payslip ${dateKey(run.payday)}`, Author: 'Joyno HR' } })
  const chunks = []
  const finished = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  const x = 96
  const width = 403
  const right = x + width - 19
  let y = 72
  const drawPage = (continued = false) => {
    y = 72
    doc.rect(x, y, width, 690).lineWidth(1).stroke('#2d3748')
    doc.rect(x + 1, y + 1, width - 2, 45).fill('#087db0')
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14)
      .text('JOYNO SOLUTIONS LTD.', x + 18, y + 10, { width: width - 36, align: 'center' })
    doc.font('Helvetica').fontSize(8)
      .text(isDraft ? 'DRAFT PAYSLIP - NOT FOR DISTRIBUTION' : continued ? 'PAYSLIP (CONTINUED)' : 'PAYSLIP',
        x + 18, y + 29, { width: width - 36, align: 'center' })
    if (isDraft) {
      doc.save().fillColor('#b91c1c').opacity(0.09).font('Helvetica-Bold').fontSize(48)
        .rotate(-34, { origin: [300, 430] }).text('DRAFT', 150, 415, { width: 320, align: 'center' }).restore()
    }
    y += 62
  }
  drawPage()
  const ensureRoom = (height) => {
    if (y + height <= 690) return
    doc.addPage()
    drawPage(true)
  }
  doc.fillColor('#1f2937').font('Helvetica').fontSize(9)
  const field = (label, value) => {
    doc.font('Helvetica-Bold').text(label, x + 18, y)
    doc.font('Helvetica').text(String(value || '—'), x + 103, y, { width: width - 127, ellipsis: true })
    y += 17
  }
  field('Employee no.', line.employee_code)
  field('Name', line.employee_name)
  field('Period', `${dateKey(run.period_start)} to ${dateKey(run.period_end)}`)
  field('Pay date', dateKey(run.payday))
  y += 9
  doc.moveTo(x + 16, y).lineTo(x + width - 16, y).stroke('#cbd5e1')
  y += 13
  const section = (label) => {
    ensureRoom(42)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#087db0').text(label, x + 18, y)
    y += 21
  }
  const row = (label, value) => {
    ensureRoom(20)
    doc.font('Helvetica').fontSize(9).fillColor('#1f2937').text(label, x + 18, y, { width: 255, height: 15, ellipsis: true })
    doc.font('Helvetica').text(money(value), right - 104, y, { width: 104, align: 'right' })
    y += 18
  }
  section('EARNINGS')
  row('Semi-monthly basic salary', line.gross_salary)
  if (amount(line.cola_pay)) row('COLA (non-taxable)', line.cola_pay)
  for (const earning of breakdown.earnings) row(`${LABELS[earning.type] || 'Other earnings'}: ${earning.note}`, earning.amount)
  for (const earning of breakdown.chargeEarnings) row(`${CHARGE_TYPES[earning.type].label}: ${earning.note}`, earning.amount)
  y += 5
  ensureRoom(30)
  doc.moveTo(x + 18, y).lineTo(right, y).stroke('#cbd5e1')
  y += 10
  row('Total earnings', breakdown.totalEarnings)
  y += 8
  section('DEDUCTIONS')
  for (const [label, value] of breakdown.deductions) row(label, value)
  y += 5
  ensureRoom(30)
  doc.moveTo(x + 18, y).lineTo(right, y).stroke('#cbd5e1')
  y += 10
  row('Total deductions', breakdown.totalDeductions)
  y += 15
  ensureRoom(65)
  doc.rect(x + 16, y, width - 32, 39).fill('#e6f5f2')
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(12).text('NET PAY', x + 29, y + 12)
  doc.text(money(line.net_pay), right - 154, y + 12, { width: 141, align: 'right' })
  doc.fillColor('#64748b').font('Helvetica').fontSize(8)
    .text('Travel fare is paid separately. 13th-month accrual is not part of this payout.', x + 18, 713, { width: width - 36, align: 'center' })
  doc.end()
  return finished
}

module.exports = { payrollBreakdown, payslipFilename, renderPayslipPdf }
