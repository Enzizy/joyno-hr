const { effectiveEarnings } = require('./payrollNightDifferentialService')
const { PDFDocument } = require('pdfkit')
const { dateKey } = require('./payrollAttendanceService')
const { CHARGE_TYPES, summarizeCharges } = require('./payrollChargesService')
const { escapeHtml } = require('./emailTemplateService')

const COMPANY_NAME = process.env.PAYSLIP_COMPANY_NAME || 'JOYNO INC'

// Payslips an employee can see: the run is closed and paid. A practice run's test payslip shows only
// for the people HR sent it to, until HR removes the test payslips. Expects the run and line aliased as run and line.
const RELEASED_PAYSLIP_SQL = `run.status = 'locked'
  AND EXISTS(SELECT 1 FROM payroll_payments payment WHERE payment.payroll_run_id = run.id)
  AND (COALESCE(run.rule_snapshot->>'isTest','false') <> 'true' OR (
    EXISTS(SELECT 1 FROM payroll_run_events sent WHERE sent.payroll_run_id = run.id
      AND sent.action = 'payslip_emailed' AND sent.metadata->>'lineId' = line.id::text)
    AND NOT EXISTS(SELECT 1 FROM payroll_run_events removed WHERE removed.payroll_run_id = run.id AND removed.action = 'test_payslips_removed')))`

function amount(value) {
  return Number(value || 0)
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function payrollBreakdown(line) {
  const earnings = effectiveEarnings(line.details)
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

// The rows of the workbook's PAYSLIP01/02 layout. Paid leave is shown as the workbook does:
// included in ABSENCE and added back under LEAVE, so gross pay is unchanged.
function payslipSections(line) {
  const daily = amount(line.daily_rate) || amount(line.monthly_basic_salary) * 12 / 261
  const charges = Array.isArray(line.details?.charges) ? line.details.charges : []
  const earnings = effectiveEarnings(line.details)
  const manualTypes = new Set((line.details?.manualEarnings || []).map((entry) => entry.type))
  const total = (list) => roundMoney(list.reduce((sum, entry) => sum + amount(entry.amount), 0))
  const ofType = (list, ...types) => list.filter((entry) => types.includes(entry.type))
  const notes = (list) => [...new Set(list.map((entry) => String(entry.note || '').trim()).filter(Boolean))].join(', ')
  const count = (value, suffix = '') => value ? `(${Number(value).toFixed(2).replace(/^0(?=\.)/, '')}${suffix})` : ''
  // label/qty follow the workbook for the PDF; name/unit are plain words for the email and the employee's page.
  const units = (value, one, many = `${one}s`) => value ? `${Math.round(Number(value) * 100) / 100} ${Number(value) === 1 ? one : many}` : ''

  const leaveDays = amount(line.paid_leave_days)
  const leave = roundMoney(leaveDays * daily)
  const absenceDays = amount(line.absence_days) + amount(line.unpaid_leave_days) + leaveDays
  const absence = roundMoney(amount(line.absence_deduction) + leave)
  const missedMinutes = amount(line.late_minutes) + amount(line.undertime_minutes)
  const utLate = roundMoney(amount(line.late_deduction) + amount(line.undertime_deduction))
  const approved = line.details?.approvedWork || {}
  const night = line.details?.nightDifferential || {}
  const overtime = total(ofType(earnings, 'overtime'))
  const nightPay = total(ofType(earnings, 'night_differential'))
  const holiday = total(ofType(earnings, 'holiday_premium', 'special_holiday_pay'))
  const allowance = roundMoney(amount(line.cola_pay) + total(ofType(charges, 'other_non_taxable_earning')))
  const adjustmentItems = [...ofType(charges, 'basic_pay_adjustment'), ...ofType(earnings, 'other')]
  const cashItems = ofType(charges, 'cash_advance', 'other_charge')

  const overtimeHours = manualTypes.has('overtime') ? 0 : amount(approved.overtimeHours)
  const nightHours = manualTypes.has('night_differential') ? 0 : amount(night.paidMinutes) / 60
  const holidayDays = manualTypes.has('holiday_premium') ? 0 : amount(approved.premiumHours) / 8
  const additions = [
    { label: 'OVERTIME', name: 'Overtime', qty: count(overtimeHours), unit: units(overtimeHours, 'h', 'h'), amount: overtime },
    { label: 'NIGHT DIFF.', name: 'Night differential', qty: count(nightHours), unit: units(nightHours, 'h', 'h'), amount: nightPay },
    { label: 'REST DAY', name: 'Rest day', amount: 0 },
    { label: 'SPECIAL HOLIDAY', name: 'Special holiday', amount: 0 },
    { label: 'REGULAR HOLIDAY', name: 'Regular holiday', amount: 0 },
    { label: holiday ? 'OTHER (HOL.): WSH/RD' : 'OTHER (HOL.)', name: 'Holiday / rest day premium', qty: count(holidayDays), unit: units(holidayDays, 'day'), amount: holiday },
    { label: 'LEAVE', name: 'Paid leave', qty: count(leaveDays), unit: units(leaveDays, 'day'), amount: leave },
    { label: 'ALLOWANCE / COLA', name: 'Allowance / COLA', amount: allowance },
    { label: 'ADJUSTMENT:', name: 'Adjustment', amount: total(adjustmentItems), note: notes(adjustmentItems) },
  ]
  const deductions = [
    { label: 'WITHHOLDING TAX', name: 'Withholding tax', amount: total(ofType(charges, 'tax_withholding')) },
    { label: 'SSS CONTRIBUTION', name: 'SSS', amount: amount(line.employee_sss) },
    { label: 'PHIC CONTRIBUTION', name: 'PhilHealth', amount: amount(line.employee_philhealth) },
    { label: 'PAG-IBIG CONTRIBUTION', name: 'Pag-IBIG', amount: amount(line.employee_pagibig) },
    { label: 'SALARY LOAN', name: 'SSS salary loan', amount: total(ofType(charges, 'sss_salary_loan')) },
    { label: 'SSS CALAMITY LOAN', name: 'SSS calamity loan', amount: total(ofType(charges, 'sss_calamity_loan')) },
    { label: 'MPL', name: 'Pag-IBIG MPL', amount: total(ofType(charges, 'pagibig_mpl')) },
    { label: 'PAG-IBIG CALAMITY LOAN', name: 'Pag-IBIG calamity loan', amount: total(ofType(charges, 'pagibig_calamity')) },
    { label: 'MP2', name: 'Pag-IBIG MP2', amount: total(ofType(charges, 'pagibig_mp2')) },
    { label: 'CASH ADVANCE / OTHERS:', name: 'Cash advance / others', amount: total(cashItems), note: notes(cashItems) },
  ]
  const basic = amount(line.gross_salary)
  const gross = roundMoney(basic - absence - utLate + additions.reduce((sum, row) => sum + row.amount, 0))
  const totalDeduction = roundMoney(deductions.reduce((sum, row) => sum + row.amount, 0))
  return {
    basic, gross, totalDeduction, net: roundMoney(gross - totalDeduction),
    less: [
      { label: 'ABSENCE', name: 'Absences', qty: count(absenceDays), unit: units(absenceDays, 'day'), amount: absence },
      { label: 'UT/LATE', name: 'Late / undertime', qty: missedMinutes ? `(${missedMinutes} min.)` : '', unit: missedMinutes ? `${missedMinutes} min` : '', amount: utLate },
    ],
    additions, deductions,
  }
}

// Same wording as the workbook's SpellNumber macro: "... & 45/100 Pesos Only".
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function hundreds(value) {
  const words = []
  if (value >= 100) words.push(`${ONES[Math.floor(value / 100)]} Hundred`)
  const rest = value % 100
  if (rest >= 20) words.push([TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join(' '))
  else if (rest) words.push(ONES[rest])
  return words.join(' ')
}
function amountInWords(value) {
  const cents = Math.round(Math.abs(Number(value || 0)) * 100)
  let pesos = Math.floor(cents / 100)
  const parts = []
  for (const scale of ['', ' Thousand', ' Million', ' Billion']) {
    const chunk = pesos % 1000
    if (chunk) parts.unshift(`${hundreds(chunk)}${scale}`)
    pesos = Math.floor(pesos / 1000)
    if (!pesos) break
  }
  const words = parts.join(' ') || 'Zero'
  const fraction = cents % 100
  return fraction ? `${words} & ${String(fraction).padStart(2, '0')}/100 Pesos Only` : `${words} Pesos Only`
}

// The payslip email: the payslip itself in the message (net pay first, then the non-zero rows),
// a link to the employee's payslips page, and the PDF attached for saving or printing.
function payslipEmail({ run, line, payslipsUrl = '' }) {
  const s = payslipSections(line)
  const isTest = run.rule_snapshot?.isTest === true
  const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const short = (value) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dateKey(value)}T00:00:00Z`))
  const firstName = String(line.employee_name || '').trim().split(/\s+/)[0] || ''
  const greetingName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : ''
  const workDates = `${short(run.period_start)} – ${short(run.period_end)}`
  const earnings = [{ name: 'Basic salary', amount: s.basic }, ...s.less.filter((row) => row.amount).map((row) => ({ ...row, amount: -row.amount })),
    ...s.additions.filter((row) => row.amount)]
  const deductions = s.deductions.filter((row) => row.amount).map((row) => ({ ...row, amount: -row.amount }))
  const signed = (value) => `${value < 0 ? '−' : ''}${peso(Math.abs(value))}`

  const cell = 'padding:7px 0;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;'
  const rowsHtml = (rows) => rows.map((row) => `<tr><td style="${cell}">${escapeHtml(row.name)}${row.unit ? ` <span style="color:#9ca3af;font-size:12px;">· ${escapeHtml(row.unit)}</span>` : ''}${row.note ? `<div style="color:#9ca3af;font-size:12px;">${escapeHtml(row.note)}</div>` : ''}</td><td align="right" style="${cell}white-space:nowrap;${row.amount < 0 ? 'color:#b91c1c;' : ''}">${signed(row.amount)}</td></tr>`).join('')
  const totalRow = (label, value) => `<tr><td style="padding:9px 0 14px;font-size:14px;font-weight:700;color:#111827;">${label}</td><td align="right" style="padding:9px 0 14px;font-size:14px;font-weight:700;color:#111827;white-space:nowrap;">${signed(value)}</td></tr>`
  const heading = (label) => `<tr><td colspan="2" style="padding:6px 0 4px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6b7280;">${label}</td></tr>`
  const html = `${isTest ? '<p style="margin:0 0 14px;padding:9px 12px;border-radius:8px;background:#fef2f2;color:#991b1b;font-size:13px;font-weight:700;">Test payslip — no payment was made.</p>' : ''}
<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">Hi ${escapeHtml(greetingName)}, your payslip for the ${escapeHtml(short(run.payday))} payday is ready.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;">
  <tr><td style="padding:16px 18px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#047857;">Net pay</div>
    <div style="margin-top:4px;font-size:30px;font-weight:700;color:#065f46;">${peso(line.net_pay)}</div>
    <div style="margin-top:4px;font-size:13px;color:#047857;">Work dates ${escapeHtml(workDates)} · Payday ${escapeHtml(short(run.payday))}</div>
  </td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;border-collapse:collapse;">
  ${heading('Earnings')}${rowsHtml(earnings)}${totalRow('Gross pay', s.gross)}
  ${heading('Deductions')}${deductions.length ? rowsHtml(deductions) : `<tr><td colspan="2" style="${cell}color:#9ca3af;">None</td></tr>`}${totalRow('Total deductions', -s.totalDeduction)}
  <tr><td style="padding:12px 0;font-size:16px;font-weight:700;color:#065f46;border-top:2px solid #111827;">Net pay</td><td align="right" style="padding:12px 0;font-size:16px;font-weight:700;color:#065f46;border-top:2px solid #111827;white-space:nowrap;">${peso(line.net_pay)}</td></tr>
</table>
${payslipsUrl ? `<p style="margin:18px 0 6px;"><a href="${escapeHtml(payslipsUrl)}" style="display:inline-block;background:#111827;color:#fbbf24;text-decoration:none;font-size:14px;font-weight:700;padding:11px 18px;border-radius:8px;">View my payslips</a></p>` : ''}
<p style="margin:14px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">The PDF copy is attached to this email for saving or printing. Please contact HR if something looks wrong.</p>`
  const text = [
    isTest ? 'This is a test payslip. No payment was made.\n' : '',
    `Your payslip for ${dateKey(run.period_start)} to ${dateKey(run.period_end)} is attached. Please contact HR if you notice a discrepancy.`,
    `Net pay: ${peso(line.net_pay)} (payday ${dateKey(run.payday)})`,
    ...earnings.map((row) => `${row.name}${row.unit ? ` (${row.unit})` : ''}: ${signed(row.amount)}`), `Gross pay: ${peso(s.gross)}`,
    ...deductions.map((row) => `${row.name}: ${signed(row.amount)}`), `Total deductions: ${signed(-s.totalDeduction)}`,
    payslipsUrl ? `View your payslips: ${payslipsUrl}` : '',
  ].filter(Boolean).join('\n')
  return { html, text }
}

function payslipFilename(run, line) {
  const code = String(line.employee_code || line.employee_id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  const date = dateKey(run.payday)
  return `${run.rule_snapshot?.isTest?'TEST-ONLY-':''}payslip-${code}-${date}.pdf`
}

const figure = (value) => value ? Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
const slash = (value) => { const [y, m, d] = dateKey(value).split('-'); return `${m}/${d}/${y}` }
const longDate = (value) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${dateKey(value)}T00:00:00Z`))

const COPY_WIDTH = 262
const COPY_HEIGHT = 520

// Draws one payslip copy in a COPY_WIDTH x COPY_HEIGHT box at (x, y).
function drawCopy(doc, { run, line }, x, y, copyLabel = '') {
  const s = payslipSections(line)
  const isDraft = run.status === 'draft'
  const isTest = run.rule_snapshot?.isTest === true
  const w = COPY_WIDTH
  const left = x + 14, item = x + 46, qtyRight = x + 182, right = x + w - 14
  doc.lineWidth(0.8).rect(x, y, w, COPY_HEIGHT).stroke('#111111')
  let cy = y + 16
  doc.rect(x + 14, cy, w - 28, 14).fill('#00b0f0')
  doc.fillColor('#000000').font('Helvetica-BoldOblique').fontSize(7.5).text(COMPANY_NAME, x + 14, cy + 4, { width: w - 28, align: 'center' })
  cy += 20
  if (isTest || isDraft) {
    doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(6.5)
      .text(isTest ? 'TEST PAYSLIP — NOT AN ACTUAL PAYMENT' : 'DRAFT — NOT FOR DISTRIBUTION', x + 14, cy, { width: w - 28, align: 'center' })
  }
  cy += 12
  const field = (label, value, font = 'Helvetica', size = 7.5) => {
    doc.fillColor('#111111').font('Helvetica').fontSize(7.5).text(label, x + 28, cy)
    doc.text(':', x + 82, cy)
    doc.font(font).fontSize(size).text(String(value || ''), x + 90, cy - (size - 7.5) / 2, { width: w - 104, height: 12, ellipsis: true })
    cy += 11
  }
  field('EMP NO', line.employee_code)
  field('NAME', line.employee_name, 'Helvetica-Bold', 8.5)
  field('PERIOD', `${slash(run.period_start)} - ${slash(run.period_end)}`, 'Helvetica-Oblique')
  field('PAY DATE', longDate(run.payday), 'Helvetica-Bold')
  cy += 4
  doc.moveTo(x + 14, cy).lineTo(right, cy).lineWidth(0.8).stroke('#111111')
  cy += 14

  // Grouped rows (LESS, ADD, deductions) are indented under their heading; totals start at the left.
  const row = (label, value, { lead = '', qty = '', indent = false, note = '' } = {}) => {
    doc.fillColor('#111111').font('Helvetica').fontSize(6.8)
    if (lead) doc.text(lead, left, cy)
    doc.text(label, indent ? item : left, cy, { width: 130, height: 9, ellipsis: true })
    if (qty) doc.text(qty, qtyRight - 60, cy, { width: 60, align: 'right' })
    doc.text(value, right - 70, cy, { width: 70, align: 'right' })
    cy += 9.5
    if (note) { doc.font('Helvetica-Oblique').fontSize(6).text(`(${note})`, item, cy, { width: right - item, height: 8, ellipsis: true, align: 'center' }); cy += 9 }
  }
  row('BASIC SALARY', figure(s.basic))
  s.less.forEach((entry, index) => row(entry.label, figure(entry.amount), { lead: index ? '' : 'LESS :', qty: entry.qty, indent: true }))
  cy += 4
  s.additions.forEach((entry, index) => row(entry.label, figure(entry.amount), { lead: index ? '' : 'ADD :', qty: entry.qty, note: entry.note, indent: true }))
  cy += 8
  doc.moveTo(right - 70, cy - 2).lineTo(right, cy - 2).lineWidth(0.6).stroke('#111111')
  row('GROSS PAY', figure(s.gross))
  doc.moveTo(right - 70, cy - 1).lineTo(right, cy - 1).stroke('#111111')
  cy += 5
  doc.font('Helvetica-Oblique').fontSize(6.8).text('LESS: DEDUCTIONS', left, cy); cy += 9.5
  s.deductions.forEach((entry) => row(entry.label, figure(entry.amount), { note: entry.note, indent: true }))
  cy += 10
  row('TOTAL DEDUCTION', figure(s.totalDeduction))
  cy += 4
  doc.moveTo(right - 70, cy - 2).lineTo(right, cy - 2).stroke('#111111')
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text('NET PAY', left + 14, cy + 1)
  doc.text(figure(line.net_pay), right - 80, cy + 1, { width: 80, align: 'right' })
  cy += 12
  doc.moveTo(right - 70, cy).lineTo(right, cy).moveTo(right - 70, cy + 2).lineTo(right, cy + 2).stroke('#111111')
  cy += 10
  doc.font('Helvetica').fontSize(7).text('************************', x, cy, { width: w, align: 'center' })
  cy += 12
  doc.font('Helvetica-Oblique').fontSize(6.8).text('Amount in words:', left, cy)
  doc.font('Helvetica').text(amountInWords(line.net_pay), left + 66, cy, { width: right - left - 66 })
  cy = Math.max(cy + 22, doc.y + 8)
  doc.font('Helvetica-Oblique').text('Received by:', left, cy)
  cy += 22
  doc.font('Helvetica-Bold').fontSize(7.5).text(line.employee_name || '', x + 30, cy, { width: w - 60, align: 'center' })
  cy += 10
  doc.moveTo(x + 30, cy).lineTo(x + w - 30, cy).lineWidth(0.8).stroke('#111111')
  doc.fillColor('#1d4ed8').font('Helvetica').fontSize(6).text('SIGNATURE OVER PRINTED NAME / DATE', x + 30, cy + 3, { width: w - 60, align: 'center' })
  if (copyLabel) doc.fillColor('#6b7280').fontSize(5.5).text(copyLabel, x, y + COPY_HEIGHT - 12, { width: w, align: 'center' })
  if (isDraft) {
    doc.save().fillColor('#b91c1c').opacity(0.07).font('Helvetica-Bold').fontSize(40)
      .rotate(-50, { origin: [x + w / 2, y + COPY_HEIGHT / 2] }).text('DRAFT', x, y + COPY_HEIGHT / 2 - 20, { width: w, align: 'center' }).restore()
  }
}

function pdfBuffer(options, draw) {
  const doc = new PDFDocument({ margin: 0, autoFirstPage: false, ...options })
  const chunks = []
  const finished = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  draw(doc)
  doc.end()
  return finished
}

// copies: 1 = one payslip per page (email and saving); 2 = the workbook's print sheet,
// two identical copies side by side on Legal paper, one for the employee and one for the company.
function renderPayslipsPdf(payslips, { copies = 1 } = {}) {
  const first = payslips[0]
  return pdfBuffer({ info: { Title: payslips.length === 1 ? `Payslip ${first.line.employee_code || first.line.employee_id} ${dateKey(first.run.payday)}` : `Payslips ${dateKey(first.run.payday)}`, Author: COMPANY_NAME } }, (doc) => {
    for (const payslip of payslips) {
      if (copies === 2) {
        doc.addPage({ size: 'LEGAL', margin: 0 })
        const gap = 24, x = (612 - COPY_WIDTH * 2 - gap) / 2
        drawCopy(doc, payslip, x, 40, "EMPLOYEE'S COPY")
        drawCopy(doc, payslip, x + COPY_WIDTH + gap, 40, "COMPANY'S COPY")
      } else {
        doc.addPage({ size: [COPY_WIDTH + 40, COPY_HEIGHT + 40], margin: 0 })
        drawCopy(doc, payslip, 20, 20)
      }
    }
  })
}
function renderPayslipPdf(payslip, options) {
  return renderPayslipsPdf([payslip], options)
}

module.exports = { RELEASED_PAYSLIP_SQL, payrollBreakdown, payslipSections, payslipEmail, amountInWords, payslipFilename, renderPayslipPdf, renderPayslipsPdf }
