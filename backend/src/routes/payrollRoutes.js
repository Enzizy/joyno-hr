const express = require('express')
const multer = require('multer')
const { MANAGEMENT_ROLES } = require('../constants/roles')
const { payslipFilename, renderPayslipPdf } = require('../services/payrollPayslipService')
const { dateKey } = require('../services/payrollAttendanceService')
const { parseAttendanceCsv, decodeAttendanceCsv, isAttendanceScan, parseManilaTimestamp, manilaDateParts, listWeekdays, computeDailyAttendance } = require('../services/payrollAttendanceService')
const { calculatePayrollLine, calculateSssAssessablePay, calculateWorkedSpecialHoliday } = require('../services/payrollCalculationService')
const { validatePayrollPeriod } = require('../services/payrollScheduleService')

const CSV_MAX_BYTES = 10 * 1024 * 1024

function positiveId(value) {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function createPayrollRouter({ db, payrollService, authRequired, requireRole, addAuditLog, deliverPayslipEmail }) {
  if (!payrollService) throw new Error('Payroll routes require payrollService')
  const router = express.Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CSV_MAX_BYTES, files: 1 },
  })

  const uploadCsv = (req, res, next) => upload.single('file')(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'CSV file exceeds 10 MB' })
    return res.status(400).json({ message: error.message || 'Invalid file upload' })
  })

  function readTestCsv(req) {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.csv') || req.file.buffer.includes(0)) {
      throw Object.assign(new Error('Upload a valid biometric CSV file'), { statusCode: 415 })
    }
    return parseAttendanceCsv(decodeAttendanceCsv(req.file.buffer))
  }

  router.post('/api/payroll/test/inspect-csv', authRequired, requireRole(MANAGEMENT_ROLES), uploadCsv, async (req, res) => {
    try {
      const records = readTestCsv(req)
      const people = new Map()
      const usableDates = new Set()
      let firstDate = null
      let lastDate = null
      for (const record of records) {
        const date = manilaDateParts(parseManilaTimestamp(record.timestamp)).date
        if (!firstDate || date < firstDate) firstDate = date
        if (!lastDate || date > lastDate) lastDate = date
        if (isAttendanceScan(record.eventType)) usableDates.add(date)
        const key = `${record.identifierType}:${record.employeeCode}`
        const person = people.get(key) || { personId: record.employeeCode, identifierType: record.identifierType,
          name: String(record.raw.Name || '').trim().slice(0, 150), scans: 0 }
        person.scans += 1
        people.set(key, person)
      }
      return res.json({ people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)), firstDate, lastDate,
        usableDates: [...usableDates].sort() })
    } catch (error) { return handlePayrollError(error, res) }
  })

  router.post('/api/payroll/test/employee-preview', authRequired, requireRole(MANAGEMENT_ROLES), uploadCsv, async (req, res) => {
    const employeeId = positiveId(req.body?.employeeId)
    const monthlyBasicSalary = Number(req.body?.monthlyBasicSalary)
    const monthlyCola = Number(req.body?.monthlyCola ?? 0)
    const firstCutoffPayInput = req.body?.firstCutoffPay
    const firstCutoffPay = firstCutoffPayInput === undefined || firstCutoffPayInput === ''
      ? Math.round(monthlyBasicSalary / 2 * 100) / 100 : Number(firstCutoffPayInput)
    const biometricPersonId = String(req.body?.biometricPersonId || '').trim()
    const workedSpecialHolidayDays = Number(req.body?.workedSpecialHolidayDays || 0)
    const workedSpecialHolidayHours = req.body?.workedSpecialHolidayHours === undefined
      ? workedSpecialHolidayDays * 8 : Number(req.body.workedSpecialHolidayHours)
    const specialHolidayOvertimeHours = Number(req.body?.specialHolidayOvertimeHours || 0)
    const periodStart = req.body?.periodStart
    const periodEnd = req.body?.periodEnd
    const payday = req.body?.payday
    const cutoff = req.body?.cutoff
    if (!employeeId || !validDate(periodStart) || !validDate(periodEnd) || !validDate(payday) ||
        !['first', 'second'].includes(cutoff) || !biometricPersonId || biometricPersonId.length > 80 ||
        !Number.isFinite(monthlyBasicSalary) || monthlyBasicSalary < 0 || monthlyBasicSalary > 10000000 ||
        !Number.isFinite(monthlyCola) || monthlyCola < 0 || monthlyCola > 10000000 ||
        Math.abs(monthlyCola * 100 - Math.round(monthlyCola * 100)) > 0.000001 ||
        !Number.isFinite(firstCutoffPay) || firstCutoffPay < 0 || firstCutoffPay > 10000000 ||
        Math.abs(firstCutoffPay * 100 - Math.round(firstCutoffPay * 100)) > 0.000001) {
      return res.status(400).json({ message: 'Enter a valid employee, biometric ID, dates, and monthly salary' })
    }
    try {
      validatePayrollPeriod(periodStart, periodEnd, cutoff)
      if (payday <= periodEnd) throw new RangeError('Pay date must follow the attendance cutoff')
      const scheduledDays = listWeekdays(periodStart, periodEnd)
      if (!Number.isFinite(workedSpecialHolidayHours) || workedSpecialHolidayHours < 0 ||
          workedSpecialHolidayHours > scheduledDays.length * 8) {
        throw new RangeError('Approved special-holiday hours cannot exceed eight per scheduled weekday')
      }
      if (!Number.isFinite(specialHolidayOvertimeHours) || specialHolidayOvertimeHours < 0 ||
          specialHolidayOvertimeHours > Math.ceil(workedSpecialHolidayHours / 8) * 24) {
        throw new RangeError('Holiday overtime needs approved holiday work and cannot exceed 24 hours per worked day')
      }
      const specialHoliday = calculateWorkedSpecialHoliday({
        monthlyBasicSalary, workedHours: workedSpecialHolidayHours, overtimeHours: specialHolidayOvertimeHours,
      })
      const employees = await db.query('SELECT id, employee_code, first_name, last_name FROM employees WHERE id = $1', [employeeId])
      const employee = employees.rows[0]
      if (!employee) return res.status(404).json({ message: 'Employee not found' })
      const records = readTestCsv(req)
      const matching = records.filter((record) => record.employeeCode === biometricPersonId &&
        (record.identifierType === 'person_id' || biometricPersonId === employee.employee_code))
      if (!matching.length) return res.status(422).json({ message: 'No scans match this biometric Person ID in the CSV' })
      const employeeName = `${employee.first_name} ${employee.last_name}`.trim()
      const csvName = String(matching.find((record) => record.raw.Name)?.raw.Name || '').trim()
      const normalizeName = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
      const identityWarning = csvName && normalizeName(csvName) !== normalizeName(employeeName)
        ? `CSV name (${csvName}) differs from the selected employee (${employeeName}). Verify the biometric ID before comparing pay.`
        : null
      const eventsByDay = new Map()
      for (const record of matching) {
        const occurredAt = parseManilaTimestamp(record.timestamp)
        const date = manilaDateParts(occurredAt).date
        if (date < periodStart || date > periodEnd) continue
        const events = eventsByDay.get(date) || []
        events.push({ occurredAt, eventType: record.eventType })
        eventsByDay.set(date, events)
      }
      const days = scheduledDays.map((date) => computeDailyAttendance({
        date, events: eventsByDay.get(date) || [],
        profile: { work_start_time: '09:00', work_end_time: '18:00', unpaid_break_minutes: 60, workdays: [1, 2, 3, 4, 5] },
      }))
      const manualEarnings = [
        ...(specialHoliday.holidayPremium ? [{ type: 'holiday_premium', amount: specialHoliday.holidayPremium,
          note: `${workedSpecialHolidayHours} approved holiday hour(s) / 8, extra 30% only (test)`,
          approvedHours: workedSpecialHolidayHours }] : []),
        ...(specialHoliday.overtimePay ? [{ type: 'overtime', amount: specialHoliday.overtimePay,
          note: `${specialHolidayOvertimeHours} special-holiday overtime hour(s) at 130% x 130% (test)` }] : []),
      ]
      const base = calculatePayrollLine({ monthlyBasicSalary, monthlyCola, cutoff, attendance: days })
      const sssAssessment = cutoff === 'second' ? calculateSssAssessablePay({
        firstCutoffPay, grossSalary: base.grossSalary, absenceDeduction: base.absenceDeduction,
        lateDeduction: base.lateDeduction, undertimeDeduction: base.undertimeDeduction, manualEarnings,
      }) : null
      const calculated = cutoff === 'second'
        ? calculatePayrollLine({ monthlyBasicSalary, monthlyCola, cutoff, includeContributions: true, attendance: days,
          sssCompensation: sssAssessment.monthlyCompensation }) : base
      const extraTotal = specialHoliday.total
      const line = {
        employee_id: employee.id, employee_code: employee.employee_code,
        employee_name: employeeName,
        monthly_basic_salary: calculated.monthlyBasicSalary, daily_rate: calculated.dailyRate,
        gross_salary: calculated.grossSalary, cola_pay: calculated.colaPay,
        absence_deduction: calculated.absenceDeduction,
        late_minutes: calculated.lateMinutes, late_deduction: calculated.lateDeduction,
        undertime_minutes: calculated.undertimeMinutes, undertime_deduction: calculated.undertimeDeduction,
        employee_sss: calculated.employeeSss, employee_philhealth: calculated.employeePhilhealth,
        employee_pagibig: calculated.employeePagibig,
        net_pay: Math.round(Math.max(0, calculated.grossSalary + calculated.colaPay + extraTotal - calculated.employeeDeductions) * 100) / 100,
        details: { manualEarnings, contributionBasis: calculated.contributionBasis,
          sssAssessment: sssAssessment ? { ...sssAssessment,
            firstCutoffSource: firstCutoffPayInput === undefined || firstCutoffPayInput === '' ? 'assumed-half-basic' : 'entered' } : null },
      }
      const run = { period_start: periodStart, period_end: periodEnd, payday, cutoff, status: 'draft' }
      const pdf = await renderPayslipPdf({ run, line })
      return res.json({ run, line, days, specialHoliday, sssAssessment: line.details.sssAssessment,
        pdfBase64: pdf.toString('base64'), identityWarning,
        warnings: days.filter((day) => day.status === 'exception').map((day) => ({ date: day.date, reason: day.exceptionReason })) })
    } catch (error) { return handlePayrollError(error, res) }
  })

  router.get('/api/payroll/profiles', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    try {
      return res.json(await payrollService.listProfiles({}))
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.put('/api/payroll/profiles/:employeeId', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const employeeId = positiveId(req.params.employeeId)
    if (!employeeId) return res.status(400).json({ message: 'Invalid employee ID' })
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: 'A profile object is required' })
    }
    try {
      const profileInput = {
        monthlyBasicSalary: req.body.monthlyBasicSalary,
        monthlyCola: req.body.monthlyCola,
        dailyFareRate: req.body.dailyFareRate,
        biometricPersonId: req.body.biometricPersonId,
        effectiveFrom: req.body.effectiveFrom,
      }
      for (const key of Object.keys(profileInput)) {
        if (profileInput[key] === undefined) delete profileInput[key]
      }
      const salaryInput = profileInput.monthlyBasicSalary
      if ((typeof salaryInput !== 'number' && typeof salaryInput !== 'string') ||
          (typeof salaryInput === 'string' && !salaryInput.trim()) ||
          !Number.isFinite(Number(salaryInput)) || Number(salaryInput) < 0) {
        return res.status(400).json({ message: 'A non-negative monthlyBasicSalary is required' })
      }
      if (!validDate(profileInput.effectiveFrom)) {
        return res.status(400).json({ message: 'A valid effectiveFrom YYYY-MM-DD date is required' })
      }
      if (profileInput.monthlyCola !== undefined &&
          ((typeof profileInput.monthlyCola !== 'number' && typeof profileInput.monthlyCola !== 'string') ||
          (typeof profileInput.monthlyCola === 'string' && !profileInput.monthlyCola.trim()) ||
          !Number.isFinite(Number(profileInput.monthlyCola)) || Number(profileInput.monthlyCola) < 0 ||
          Number(profileInput.monthlyCola) > 10000000 ||
          Math.abs(Number(profileInput.monthlyCola) * 100 - Math.round(Number(profileInput.monthlyCola) * 100)) > 0.000001)) {
        return res.status(400).json({ message: 'monthlyCola must be a non-negative peso amount' })
      }
      if (profileInput.biometricPersonId != null &&
          (typeof profileInput.biometricPersonId !== 'string' || profileInput.biometricPersonId.length > 80)) {
        return res.status(400).json({ message: 'biometricPersonId must be a string of at most 80 characters' })
      }
      const profile = await payrollService.upsertProfile({ employeeId, ...profileInput }, req.user)
      return res.json(profile)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.post('/api/payroll/attendance/import', authRequired, requireRole(MANAGEMENT_ROLES), (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (!error) return next()
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'CSV file exceeds 10 MB' })
      return res.status(400).json({ message: error.message || 'Invalid file upload' })
    })
  }, async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required in the file field' })
    if (!req.file.originalname.toLowerCase().endsWith('.csv') || req.file.buffer.includes(0)) {
      return res.status(415).json({ message: 'Upload a valid CSV file' })
    }
    if (!validDate(req.body.periodStart) || !validDate(req.body.periodEnd) || req.body.periodEnd < req.body.periodStart) {
      return res.status(400).json({ message: 'A valid attendance periodStart and periodEnd are required' })
    }
    try {
      const result = await payrollService.importAttendance({
        fileName: req.file.originalname,
        csvText: decodeAttendanceCsv(req.file.buffer),
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        importedBy: req.user,
      })
      await addAuditLog(req.user.id, 'import_payroll_attendance', 'payroll_attendance_batches', result.id)
      return res.status(201).json(result)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.get('/api/payroll/attendance/batches/:id', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid batch ID' })
    try {
      const batch = await payrollService.getAttendanceBatch(id)
      if (!batch) return res.status(404).json({ message: 'Attendance batch not found' })
      return res.json(batch)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.patch('/api/payroll/attendance/days/:id', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const dailyAttendanceId = positiveId(req.params.id)
    if (!dailyAttendanceId) return res.status(400).json({ message: 'Invalid attendance day ID' })
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: 'Attendance correction details are required' })
    }
    const { timeIn, timeOut, status, reason, lateMinutes, undertimeMinutes, adjustmentType } = req.body
    if (timeIn !== undefined && timeIn !== null && (typeof timeIn !== 'string' || timeIn.length > 64)) {
      return res.status(400).json({ message: 'timeIn must be a timestamp or null' })
    }
    if (timeOut !== undefined && timeOut !== null && (typeof timeOut !== 'string' || timeOut.length > 64)) {
      return res.status(400).json({ message: 'timeOut must be a timestamp or null' })
    }
    if (status !== undefined && (typeof status !== 'string' || !status.trim() || status.length > 32)) {
      return res.status(400).json({ message: 'Invalid attendance status' })
    }
    for (const [field, value] of [['lateMinutes', lateMinutes], ['undertimeMinutes', undertimeMinutes]]) {
      if (value !== undefined && value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1440)) {
        return res.status(400).json({ message: `${field} must be between 0 and 1440` })
      }
    }
    if (adjustmentType !== undefined && (typeof adjustmentType !== 'string' || adjustmentType.length > 40)) {
      return res.status(400).json({ message: 'Invalid adjustmentType' })
    }
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 500) {
      return res.status(400).json({ message: 'A correction reason of 3 to 500 characters is required' })
    }
    if (timeIn === undefined && timeOut === undefined && status === undefined) {
      return res.status(400).json({ message: 'At least one attendance field must be corrected' })
    }
    try {
      const result = await payrollService.resolveAttendanceException({
        dailyAttendanceId,
        timeIn,
        timeOut,
        status,
        lateMinutes,
        undertimeMinutes,
        adjustmentType,
        reason: reason.trim(),
      }, req.user)
      return res.json(result)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.get('/api/payroll/runs', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    try {
      return res.json(await payrollService.listRuns(req.query))
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.get('/api/payroll/runs/:id', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid payroll run ID' })
    try {
      const run = await payrollService.getRun(id)
      if (!run) return res.status(404).json({ message: 'Payroll run not found' })
      return res.json(run)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.put('/api/payroll/runs/:id/lines/:lineId/earnings', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    const lineId = positiveId(req.params.lineId)
    if (!id || !lineId) return res.status(400).json({ message: 'Invalid payroll run or line ID' })
    try {
      const line = await payrollService.updateManualEarnings(id, lineId, req.body?.earnings, req.user)
      if (!line) return res.status(404).json({ message: 'Payroll line not found' })
      return res.json(line)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.put('/api/payroll/runs/:id/lines/:lineId/charges', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    const lineId = positiveId(req.params.lineId)
    if (!id || !lineId) return res.status(400).json({ message: 'Invalid payroll run or line ID' })
    try {
      const line = await payrollService.updateCharges(id, lineId, req.body?.charges, req.user)
      if (!line) return res.status(404).json({ message: 'Payroll line not found' })
      return res.json(line)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.put('/api/payroll/runs/:id/lines/:lineId/first-cutoff-pay', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    const lineId = positiveId(req.params.lineId)
    if (!id || !lineId) return res.status(400).json({ message: 'Invalid payroll run or line ID' })
    try {
      const line = await payrollService.overrideFirstCutoffPay(id, lineId,
        req.body?.firstCutoffPay, req.body?.reason, req.user)
      if (!line) return res.status(404).json({ message: 'Payroll line not found' })
      return res.json(line)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  async function findPayslip(queryable, lineId, runId = null, employeeId = null) {
    const { rows } = await queryable.query(
      `SELECT line.*, run.period_start, run.period_end, run.payday, run.cutoff, run.status,
              run.id AS run_id
       FROM payroll_run_lines line
       JOIN payroll_runs run ON run.id = line.payroll_run_id
       WHERE line.id = $1 AND ($2::integer IS NULL OR run.id = $2)
         AND ($3::integer IS NULL OR (line.employee_id = $3 AND run.status IN ('approved', 'locked')))` ,
      [lineId, runId, employeeId]
    )
    if (!rows[0]) return null
    const line = rows[0]
    return { run: { id: line.run_id, period_start: line.period_start, period_end: line.period_end,
      payday: line.payday, cutoff: line.cutoff, status: line.status }, line }
  }

  async function servePdf(req, res, employeeId = null) {
    const lineId = positiveId(req.params.lineId)
    const runId = req.params.id === undefined ? null : positiveId(req.params.id)
    if (!lineId || (req.params.id !== undefined && !runId)) return res.status(400).json({ message: 'Invalid payslip ID' })
    try {
      const payslip = await findPayslip(db, lineId, runId, employeeId)
      if (!payslip) return res.status(404).json({ message: 'Payslip not found' })
      const pdf = await renderPayslipPdf(payslip)
      res.set('Cache-Control', 'private, no-store')
      res.set('Content-Type', 'application/pdf')
      res.set('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${payslipFilename(payslip.run, payslip.line)}"`)
      return res.send(pdf)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  }

  router.get('/api/payroll/runs/:id/payslips/:lineId.pdf', authRequired, requireRole(MANAGEMENT_ROLES), (req, res) => servePdf(req, res))
  router.get('/api/payroll/my-payslips/:lineId.pdf', authRequired, (req, res) => {
    const employeeId = positiveId(req.user.employee_id)
    if (!employeeId) return res.status(403).json({ message: 'No employee profile is linked to this account' })
    return servePdf(req, res, employeeId)
  })

  router.post('/api/payroll/runs/:id/payslips/:lineId/send', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const runId = positiveId(req.params.id)
    const lineId = positiveId(req.params.lineId)
    if (!runId || !lineId) return res.status(400).json({ message: 'Invalid payslip ID' })
    if (process.env.PAYROLL_FINALIZATION_ENABLED !== 'true') {
      return res.status(403).json({ message: 'Payslip email is disabled until payroll calculations are verified and approval is enabled' })
    }
    if (typeof deliverPayslipEmail !== 'function') return res.status(503).json({ message: 'Email delivery is unavailable' })
    try {
      const result = await db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1, $2)', [716211, lineId])
        const payslip = await findPayslip(tx, lineId, runId)
        if (!payslip) return { status: 'not_found' }
        if (!['approved', 'locked'].includes(payslip.run.status)) {
          throw Object.assign(new Error('Only approved payslips can be emailed'), { statusCode: 409 })
        }
        const sent = await tx.query(
          `SELECT 1 FROM payroll_run_events
           WHERE payroll_run_id = $1 AND action = 'payslip_emailed' AND metadata->>'lineId' = $2 LIMIT 1`,
          [runId, String(lineId)]
        )
        if (sent.rows.length) return { status: 'already_sent' }
        const recipients = await tx.query(
          `SELECT DISTINCT LOWER(TRIM(email)) AS email FROM users
           WHERE employee_id = $1 AND NULLIF(TRIM(email), '') IS NOT NULL`,
          [payslip.line.employee_id]
        )
        if (recipients.rows.length !== 1) {
          throw Object.assign(new Error(recipients.rows.length ? 'Employee has multiple account emails; resolve before sending' : 'Employee has no account email'), { statusCode: 422 })
        }
        const pdf = await renderPayslipPdf(payslip)
        await deliverPayslipEmail({
          to: recipients.rows[0].email,
          subject: `Payslip for ${dateKey(payslip.run.payday)}`,
          text: `Your payslip for ${dateKey(payslip.run.period_start)} to ${dateKey(payslip.run.period_end)} is attached. Please contact HR if you notice a discrepancy.`,
          attachments: [{ filename: payslipFilename(payslip.run, payslip.line), content: pdf, contentType: 'application/pdf' }],
          requireDelivery: true,
        })
        await tx.query(
          `INSERT INTO payroll_run_events (payroll_run_id, action, actor_user_id, actor_role, actor_name, metadata)
           VALUES ($1, 'payslip_emailed', $2, $3, $4, $5::jsonb)`,
          [runId, req.user.id, req.user.role, req.user.name || null,
            JSON.stringify({ lineId, employeeId: payslip.line.employee_id, recipient: recipients.rows[0].email })]
        )
        return { status: 'sent' }
      })
      if (result.status === 'not_found') return res.status(404).json({ message: 'Payslip not found' })
      return res.json(result)
    } catch (error) {
      if (error?.message === 'Email delivery is not configured') {
        return res.status(503).json({ message: 'Email delivery is not configured' })
      }
      return handlePayrollError(error, res)
    }
  })

  router.post('/api/payroll/runs/preview', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ message: 'Payroll period details are required' })
    }
    try {
      const { periodStart, periodEnd, attendanceBatchId, cutoff, payday, includeContributions } = req.body
      if (!validDate(periodStart) || !validDate(periodEnd) || periodEnd < periodStart || !validDate(payday)) {
        return res.status(400).json({ message: 'Valid periodStart, periodEnd, and payday dates are required' })
      }
      return res.json(await payrollService.previewRun({
        periodStart,
        periodEnd,
        attendanceBatchId,
        cutoff,
        payday,
        includeContributions,
      }, req.user))
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.post('/api/payroll/runs/:id/approve', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid payroll run ID' })
    try {
      const run = await payrollService.approveRun(id, req.user)
      if (!run) return res.status(404).json({ message: 'Payroll run not found' })
      return res.json(run)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.post('/api/payroll/runs/:id/lock', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = positiveId(req.params.id)
    if (!id) return res.status(400).json({ message: 'Invalid payroll run ID' })
    try {
      const run = await payrollService.lockRun(id, req.user)
      if (!run) return res.status(404).json({ message: 'Payroll run not found' })
      return res.json(run)
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  router.get('/api/payroll/my-lines', authRequired, async (req, res) => {
    const employeeId = positiveId(req.user.employee_id)
    if (!employeeId) return res.status(403).json({ message: 'No employee profile is linked to this account' })
    try {
      const runId = req.query.runId === undefined ? undefined : positiveId(req.query.runId)
      if (req.query.runId !== undefined && !runId) return res.status(400).json({ message: 'Invalid payroll run ID' })
      const lines = await payrollService.listMyLines({ runId, employeeId })
      return res.json(Array.isArray(lines) ? lines : lines ? [lines] : [])
    } catch (error) {
      return handlePayrollError(error, res)
    }
  })

  return router
}

function handlePayrollError(error, res) {
  const status = error?.statusCode || error?.status
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ message: error.message })
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return res.status(400).json({ message: error.message })
  }
  if (error?.code === '23505') {
    return res.status(409).json({ message: 'This payroll value is already assigned to another record' })
  }
  const message = String(error?.message || '')
  if (/\bnot found\b/i.test(message)) return res.status(404).json({ message })
  if (/\b(already exists|only .* can be|unresolved exception|resolve .* before|does not cover|missing effective payroll profile)\b/i.test(message)) {
    return res.status(409).json({ message })
  }
  console.error('Payroll request failed', error)
  return res.status(500).json({ message: 'Payroll request failed' })
}

module.exports = { createPayrollRouter }
