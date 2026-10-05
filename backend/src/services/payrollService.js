const {
  calculateContributions,
  calculatePayrollLine,
  calculateSssAssessablePay,
  calculateWorkedSpecialHoliday,
} = require('./payrollCalculationService')
const {
  addDays,
  computeDailyAttendance,
  dateKey,
  isAttendanceScan,
  listWeekdays,
  manilaDateParts,
  parseAttendanceCsv,
  parseManilaTimestamp,
} = require('./payrollAttendanceService')
const { validatePayrollPeriod } = require('./payrollScheduleService')
const { basicAdjustmentTotal, draftNetPay, normalizeCharges } = require('./payrollChargesService')

const MAX_IMPORT_DAYS = 62

function serviceError(message, statusCode) {
  const error = new Error(message)
  error.status = statusCode
  error.statusCode = statusCode
  return error
}

function actorFields(actor = {}) {
  const source = actor || {}
  return {
    userId: source.userId ?? source.user_id ?? source.id ?? null,
    role: source.role ?? source.actor_role ?? null,
    name: source.name ?? source.actor_name ?? null,
  }
}

function roundDateRange(start, end) {
  const periodStart = dateKey(start)
  const periodEnd = dateKey(end)
  const days = Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86400000) + 1
  if (days < 1) throw new RangeError('periodEnd must be on or after periodStart')
  if (days > MAX_IMPORT_DAYS) throw new RangeError(`Attendance imports are limited to ${MAX_IMPORT_DAYS} calendar days`)
  return { periodStart, periodEnd }
}

function normalizeProfile(row) {
  if (!row) return null
  return {
    ...row,
    effective_from: row.effective_from ? dateKey(row.effective_from) : null,
    effective_to: row.effective_to ? dateKey(row.effective_to) : null,
    employee_id: Number(row.employee_id),
    monthly_basic_salary: Number(row.monthly_basic_salary),
    monthly_cola: Number(row.monthly_cola ?? 0),
    daily_fare_rate: Number(row.daily_fare_rate),
    unpaid_break_minutes: Number(row.unpaid_break_minutes),
    daily_rate_divisor: Number(row.daily_rate_divisor),
    workdays: Array.isArray(row.workdays) ? row.workdays.map(Number) : [1, 2, 3, 4, 5],
  }
}

function normalizeDaily(row) {
  return {
    ...row,
    work_date: dateKey(row.work_date),
    employee_id: Number(row.employee_id),
    scan_count: Number(row.scan_count),
    late_minutes: Number(row.late_minutes),
    undertime_minutes: Number(row.undertime_minutes),
    leave_deduction_fraction: Number(row.leave_deduction_fraction ?? 1),
  }
}

function dateMinusOne(date) {
  return addDays(date, -1)
}

function profileFromRows(rows, employeeId, date) {
  return rows
    .filter((row) => {
      const effectiveFrom = dateKey(row.effective_from)
      const effectiveTo = row.effective_to ? dateKey(row.effective_to) : null
      return Number(row.employee_id) === Number(employeeId) && effectiveFrom <= date && (!effectiveTo || effectiveTo >= date)
    })
    .sort((left, right) => dateKey(right.effective_from).localeCompare(dateKey(left.effective_from)))
    .map(normalizeProfile)[0] || null
}

function parseCorrectionTimestamp(value, workDate) {
  const input = String(value ?? '').trim()
  if (!input) return null
  const timestamp = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(input)
    ? parseManilaTimestamp(`${workDate} ${input}`)
    : parseManilaTimestamp(input)
  return timestamp
}

async function withTransaction(db, callback) {
  if (typeof db.transaction === 'function') return db.transaction(callback)
  return callback(db)
}

async function appendAudit(db, actor, action, targetTable, targetId) {
  const fields = actorFields(actor)
  if (!fields.userId) return
  await db.query(
    `INSERT INTO audit_logs (user_id, action, target_table, target_id)
     VALUES ($1, $2, $3, $4)`,
    [fields.userId, action, targetTable, targetId]
  )
}

async function appendRunEvent(db, runId, action, actor, metadata = {}) {
  const fields = actorFields(actor)
  await db.query(
    `INSERT INTO payroll_run_events
       (payroll_run_id, action, actor_user_id, actor_role, actor_name, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [runId, action, fields.userId, fields.role, fields.name, JSON.stringify(metadata)]
  )
  await appendAudit(db, actor, `payroll_${action}`, 'payroll_runs', runId)
}

function approvedLeaveForDate(leaves, date) {
  return leaves.find((leave) => date >= dateKey(leave.start_date) && date <= dateKey(leave.end_date)) || null
}

function leaveAttendance(leave, date) {
  const leaveType = String(leave.leave_pay_type || 'unpaid').toLowerCase()
  const leaveDays = Number(leave.leave_days || 0)
  const unpaidDays = Number(leave.unpaid_days ?? leave.leave_days ?? 0)
  const fraction = leaveType === 'unpaid'
    ? 1
    : leaveType === 'partial_paid' && leaveDays > 0
      ? Math.max(0, Math.min(1, unpaidDays / leaveDays))
      : 0
  return {
    date,
    status: fraction <= 0 ? 'paid_leave' : fraction >= 1 ? 'unpaid_leave' : 'partial_leave',
    firstScanAt: null,
    lastScanAt: null,
    scanCount: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    exceptionReason: null,
    leaveDeductionFraction: fraction,
  }
}

function attendanceForCalculator(row) {
  return {
    date: dateKey(row.work_date ?? row.date),
    status: row.status,
    lateMinutes: Number(row.late_minutes ?? row.lateMinutes ?? 0),
    undertimeMinutes: Number(row.undertime_minutes ?? row.undertimeMinutes ?? 0),
    leaveDeductionFraction: Number(row.leave_deduction_fraction ?? row.leaveDeductionFraction ?? 1),
  }
}

function computeLineWithLeave(input) {
  const normalizedAttendance = (input.attendance || []).map(attendanceForCalculator)
  return calculatePayrollLine({ ...input, attendance: normalizedAttendance })
}

function createPayrollService({ db }) {
  if (!db || typeof db.query !== 'function') throw new TypeError('createPayrollService requires a database with query()')

  async function listProfiles({ employeeId } = {}) {
    const { rows } = await db.query(
      `SELECT e.id AS employee_id, e.employee_code, e.first_name, e.last_name, e.department,
              p.id AS profile_id, p.effective_from, p.effective_to, p.monthly_basic_salary, p.monthly_cola,
              p.daily_fare_rate, p.work_start_time, p.work_end_time, p.unpaid_break_minutes,
              p.workdays, p.daily_rate_divisor, bio.person_id AS biometric_person_id
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT profile.* FROM payroll_employee_profiles profile
         WHERE profile.employee_id = e.id
         ORDER BY profile.effective_from DESC, profile.id DESC
         LIMIT 1
       ) p ON TRUE
       LEFT JOIN payroll_biometric_identities bio ON bio.employee_id = e.id
       WHERE COALESCE(LOWER(e.status), 'active') IN ('active', 'on_leave')
         AND ($1::integer IS NULL OR e.id = $1)
       ORDER BY e.last_name, e.first_name, e.id`,
      [employeeId == null ? null : Number(employeeId)]
    )
    return rows.map((row) => ({
      ...row,
      employee_id: Number(row.employee_id),
      profile_id: row.profile_id == null ? null : Number(row.profile_id),
      monthly_basic_salary: row.monthly_basic_salary == null ? null : Number(row.monthly_basic_salary),
      monthly_cola: row.monthly_cola == null ? 0 : Number(row.monthly_cola),
      daily_fare_rate: row.daily_fare_rate == null ? null : Number(row.daily_fare_rate),
      unpaid_break_minutes: row.unpaid_break_minutes == null ? null : Number(row.unpaid_break_minutes),
      daily_rate_divisor: row.daily_rate_divisor == null ? null : Number(row.daily_rate_divisor),
      workdays: row.workdays == null ? [1, 2, 3, 4, 5] : row.workdays.map(Number),
    }))
  }

  async function upsertProfile(input, actor = {}) {
    const employeeId = Number(input.employeeId ?? input.employee_id)
    const effectiveFrom = dateKey(input.effectiveFrom ?? input.effective_from)
    const monthlySalary = Number(input.monthlyBasicSalary ?? input.monthly_basic_salary)
    const suppliedMonthlyCola = input.monthlyCola ?? input.monthly_cola
    const suppliedDailyFare = input.dailyFareRate ?? input.daily_fare_rate
    const biometricIdProvided = Object.hasOwn(input, 'biometricPersonId') || Object.hasOwn(input, 'biometric_person_id')
    const biometricPersonId = biometricIdProvided
      ? String(input.biometricPersonId ?? input.biometric_person_id ?? '').trim().replace(/^'/, '')
      : null
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new TypeError('employeeId must be a positive integer')
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0) throw new TypeError('monthlyBasicSalary must be non-negative')
    if (suppliedMonthlyCola != null && (!Number.isFinite(Number(suppliedMonthlyCola)) ||
        Number(suppliedMonthlyCola) < 0 || Number(suppliedMonthlyCola) > 10000000 ||
        Math.abs(Number(suppliedMonthlyCola) * 100 - Math.round(Number(suppliedMonthlyCola) * 100)) > 0.000001)) {
      throw new TypeError('monthlyCola must be a non-negative peso amount')
    }
    if (suppliedDailyFare != null && (!Number.isFinite(Number(suppliedDailyFare)) || Number(suppliedDailyFare) < 0)) {
      throw new TypeError('dailyFareRate must be non-negative')
    }
    if (biometricPersonId != null && biometricPersonId.length > 80) {
      throw new TypeError('biometricPersonId must be 80 characters or fewer')
    }

    const fields = actorFields(actor)
    return withTransaction(db, async (tx) => {
      const employeeResult = await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId])
      if (!employeeResult.rows[0]) throw serviceError('Employee was not found', 404)
      const { rows } = await tx.query(
        `SELECT id, effective_from, effective_to, monthly_cola, daily_fare_rate, daily_rate_divisor,
                workdays, work_start_time, work_end_time, unpaid_break_minutes
         FROM payroll_employee_profiles
         WHERE employee_id = $1
         ORDER BY effective_from
         FOR UPDATE`,
        [employeeId]
      )
      const sameDate = rows.find((row) => dateKey(row.effective_from) === effectiveFrom)
      const later = rows.find((row) => dateKey(row.effective_from) > effectiveFrom)
      const effectiveTo = later ? dateMinusOne(dateKey(later.effective_from)) : null
      const previousProfile = [...rows].reverse().find((row) => dateKey(row.effective_from) <= effectiveFrom)
      const inheritedProfile = sameDate || previousProfile
      const dailyFare = suppliedDailyFare == null
        ? Number(inheritedProfile?.daily_fare_rate ?? 0)
        : Number(suppliedDailyFare)
      const monthlyCola = suppliedMonthlyCola == null
        ? Number(inheritedProfile?.monthly_cola ?? 0)
        : Number(suppliedMonthlyCola)
      const dailyRateDivisor = Number(input.dailyRateDivisor ?? input.daily_rate_divisor ?? inheritedProfile?.daily_rate_divisor ?? 261)
      const workdays = (input.workdays ?? inheritedProfile?.workdays ?? [1, 2, 3, 4, 5]).map(Number)
      const workStart = String(input.workStartTime ?? input.work_start_time ?? inheritedProfile?.work_start_time ?? '09:00')
      const workEnd = String(input.workEndTime ?? input.work_end_time ?? inheritedProfile?.work_end_time ?? '18:00')
      const unpaidBreakMinutes = Number(input.unpaidBreakMinutes ?? input.unpaid_break_minutes ?? inheritedProfile?.unpaid_break_minutes ?? 60)
      if (!Number.isFinite(dailyRateDivisor) || dailyRateDivisor <= 0) throw new TypeError('dailyRateDivisor must be positive')
      if (!Number.isInteger(unpaidBreakMinutes) || unpaidBreakMinutes < 0) throw new TypeError('unpaidBreakMinutes must be a non-negative integer')
      if (!workdays.length || workdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new TypeError('workdays must contain weekday numbers from 0 to 6')
      }

      for (const previous of rows) {
        if (dateKey(previous.effective_from) < effectiveFrom && (!previous.effective_to || dateKey(previous.effective_to) >= effectiveFrom)) {
          await tx.query(
            `UPDATE payroll_employee_profiles SET effective_to = $1 WHERE id = $2`,
            [dateMinusOne(effectiveFrom), previous.id]
          )
        }
      }

      const profileResult = sameDate
        ? await tx.query(
          `UPDATE payroll_employee_profiles
           SET effective_to = $1, monthly_basic_salary = $2, daily_fare_rate = $3,
               work_start_time = $4, work_end_time = $5, unpaid_break_minutes = $6,
               workdays = $7::smallint[], daily_rate_divisor = $8, monthly_cola = $9
           WHERE id = $10
           RETURNING *`,
          [effectiveTo, monthlySalary, dailyFare, workStart, workEnd, unpaidBreakMinutes, workdays, dailyRateDivisor, monthlyCola, sameDate.id]
        )
        : await tx.query(
          `INSERT INTO payroll_employee_profiles
             (employee_id, effective_from, effective_to, monthly_basic_salary, daily_fare_rate,
              work_start_time, work_end_time, unpaid_break_minutes, workdays, daily_rate_divisor, monthly_cola, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::smallint[], $10, $11, $12)
           RETURNING *`,
          [employeeId, effectiveFrom, effectiveTo, monthlySalary, dailyFare, workStart, workEnd, unpaidBreakMinutes, workdays, dailyRateDivisor, monthlyCola, fields.userId]
        )
      if (biometricIdProvided) {
        if (biometricPersonId) {
          await tx.query(
            `INSERT INTO payroll_biometric_identities (employee_id, person_id, updated_by)
             VALUES ($1, $2, $3)
             ON CONFLICT (employee_id) DO UPDATE
             SET person_id = EXCLUDED.person_id, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
            [employeeId, biometricPersonId, fields.userId]
          )
        } else {
          await tx.query('DELETE FROM payroll_biometric_identities WHERE employee_id = $1', [employeeId])
        }
      }
      await appendAudit(tx, actor, sameDate ? 'payroll_profile_updated' : 'payroll_profile_created', 'payroll_employee_profiles', profileResult.rows[0].id)
      return { ...normalizeProfile(profileResult.rows[0]), biometric_person_id: biometricIdProvided ? biometricPersonId || null : undefined }
    })
  }

  async function importAttendance({ fileName = null, csvText, importedBy = null, periodStart, periodEnd }) {
    const { periodStart: start, periodEnd: end } = roundDateRange(periodStart, periodEnd)
    const records = parseAttendanceCsv(csvText)
    const scheduledDates = new Set(listWeekdays(start, end))
    let matchingScanCount = 0
    let latestScanDate = null
    for (const record of records) {
      try {
        const scanDate = manilaDateParts(parseManilaTimestamp(record.timestamp)).date
        if (!latestScanDate || scanDate > latestScanDate) latestScanDate = scanDate
        if (scheduledDates.has(scanDate) && isAttendanceScan(record.eventType)) matchingScanCount += 1
      } catch {
        // The normal import path reports invalid timestamps by source row.
      }
    }
    if (matchingScanCount === 0) {
      throw serviceError(`This CSV has no recognized scans on scheduled weekdays for the selected payroll. ${latestScanDate ? `Latest scan: ${latestScanDate}. ` : ''}Check the payroll month and payday before importing.`, 422)
    }
    const importedByUserId = actorFields(importedBy).userId
    return withTransaction(db, async (tx) => {
      const batchResult = await tx.query(
        `INSERT INTO payroll_attendance_import_batches (file_name, period_start, period_end, imported_by)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [fileName, start, end, importedByUserId]
      )
      const batch = batchResult.rows[0]
      const employeeResult = await tx.query(
        `SELECT employee.id, employee.employee_code, bio.person_id AS biometric_person_id
         FROM employees employee
         LEFT JOIN payroll_biometric_identities bio ON bio.employee_id = employee.id
         WHERE COALESCE(LOWER(employee.status), 'active') IN ('active', 'on_leave')`
      )
      const employeesByCode = new Map(employeeResult.rows.map((employee) => [String(employee.employee_code).trim().toLowerCase(), employee]))
      const employeesByPersonId = new Map(employeeResult.rows
        .filter((employee) => employee.biometric_person_id)
        .map((employee) => [String(employee.biometric_person_id).trim().toLowerCase(), employee]))
      const profileResult = await tx.query(
        `SELECT profile.*, employee.employee_code
         FROM payroll_employee_profiles profile
         JOIN employees employee ON employee.id = profile.employee_id
         WHERE COALESCE(LOWER(employee.status), 'active') IN ('active', 'on_leave')
           AND profile.effective_from <= $2
           AND COALESCE(profile.effective_to, 'infinity'::date) >= $1
         ORDER BY profile.employee_id, profile.effective_from`,
        [start, end]
      )
      const profileRows = profileResult.rows
      const holidayResult = await tx.query(
        `SELECT holiday_date FROM philippine_holidays
         WHERE holiday_date BETWEEN $1 AND $2 AND is_working_day = FALSE`,
        [start, end]
      )
      const nonWorkingHolidays = new Set(holidayResult.rows.map((row) => dateKey(row.holiday_date)))
      const eventsByEmployeeDate = new Map()
      let errorCount = 0

      for (const record of records) {
        const codeKey = record.employeeCode.toLowerCase()
        const employee = record.identifierType === 'person_id'
          ? employeesByPersonId.get(codeKey)
          : employeesByCode.get(codeKey)
        let occurredAt
        let error = null
        if (!record.employeeCode) error = 'Employee code is missing'
        else {
          try {
            occurredAt = parseManilaTimestamp(record.timestamp)
          } catch (parseError) {
            error = parseError.message
          }
        }
        const occurredDate = occurredAt ? manilaDateParts(occurredAt).date : null
        // A door export may cover a full month while this batch covers one cutoff.
        if (occurredDate && (occurredDate < start || occurredDate > end)) continue
        if (!error && !employee) error = record.identifierType === 'person_id'
          ? `Biometric Person ID ${record.employeeCode} is not mapped to an active employee`
          : `Employee code ${record.employeeCode} was not found or is inactive`
        if (!error && !profileFromRows(profileRows, employee.id, occurredDate)) error = 'No effective payroll profile covers the attendance date'

        if (occurredAt) {
          const insertResult = await tx.query(
            `INSERT INTO payroll_attendance_events
               (batch_id, source_row, employee_id, employee_code, occurred_at, source_timestamp, raw_row)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             RETURNING id, employee_id, employee_code, occurred_at`,
            [batch.id, record.sourceRow, employee?.id ?? null, record.employeeCode || '(missing)', occurredAt, record.timestamp, JSON.stringify(record.raw)]
          )
          if (employee && occurredDate >= start && occurredDate <= end) {
            const key = `${employee.id}:${occurredDate}`
            const grouped = eventsByEmployeeDate.get(key) || []
            grouped.push({ occurredAt: insertResult.rows[0].occurred_at, eventType: record.eventType })
            eventsByEmployeeDate.set(key, grouped)
          }
        }

        if (error) {
          errorCount += 1
          await tx.query(
            `INSERT INTO payroll_attendance_import_errors (batch_id, source_row, employee_code, error, raw_row)
             VALUES ($1, $2, $3, $4, $5::jsonb)`,
            [batch.id, record.sourceRow, record.employeeCode || null, error, JSON.stringify(record.raw)]
          )
        }
      }

      const employeeIds = [...new Set(profileRows.map((profile) => Number(profile.employee_id)))]
      let approvedLeaves = []
      if (employeeIds.length > 0) {
        const leavesResult = await tx.query(
          `SELECT employee_id, start_date, end_date, leave_pay_type, leave_days, unpaid_days
           FROM leave_requests
           WHERE employee_id = ANY($1::integer[])
             AND status = 'approved'
             AND start_date <= $3 AND end_date >= $2`,
          [employeeIds, start, end]
        )
        approvedLeaves = leavesResult.rows
      }

      const activeEmployeeIds = [...new Set(profileRows.map((profile) => Number(profile.employee_id)))]
      for (const employeeId of activeEmployeeIds) {
        for (const workDate of listWeekdays(start, end, [1, 2, 3, 4, 5])) {
          const profile = profileFromRows(profileRows, employeeId, workDate)
          if (!profile) continue
          const events = eventsByEmployeeDate.get(`${employeeId}:${workDate}`) || []
          if (nonWorkingHolidays.has(workDate) && events.length === 0) continue
          let attendance = computeDailyAttendance({ date: workDate, events, profile })
          if (!attendance) continue
          if (events.length === 0) {
            const leave = approvedLeaveForDate(approvedLeaves.filter((item) => Number(item.employee_id) === employeeId), workDate)
            if (leave) attendance = leaveAttendance(leave, workDate)
          }
          await tx.query(
            `INSERT INTO payroll_daily_attendance
               (batch_id, employee_id, work_date, status, first_scan_at, last_scan_at, scan_count,
                late_minutes, undertime_minutes, exception_reason, leave_deduction_fraction)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [batch.id, employeeId, workDate, attendance.status, attendance.firstScanAt, attendance.lastScanAt,
              attendance.scanCount, attendance.lateMinutes, attendance.undertimeMinutes,
              attendance.exceptionReason, attendance.leaveDeductionFraction ?? (attendance.status === 'paid_leave' ? 0 : 1)]
          )
        }
      }

      await tx.query(
        `UPDATE payroll_attendance_import_batches
         SET status = $1, row_count = $2, error_count = $3
         WHERE id = $4`,
        [errorCount > 0 ? 'has_errors' : 'imported', records.length, errorCount, batch.id]
      )
      return getAttendanceBatchWith(tx, batch.id)
    })
  }

  async function getAttendanceBatchWith(queryable, batchId) {
    const batchResult = await queryable.query(
      `SELECT * FROM payroll_attendance_import_batches WHERE id = $1`,
      [batchId]
    )
    if (!batchResult.rows[0]) return null
    const [dailyResult, errorResult, correctionResult] = await Promise.all([
      queryable.query(
        `SELECT daily.*, employee.employee_code, employee.first_name, employee.last_name
         FROM payroll_daily_attendance daily
         JOIN employees employee ON employee.id = daily.employee_id
         WHERE daily.batch_id = $1 ORDER BY daily.work_date, employee.last_name, employee.first_name`,
        [batchId]
      ),
      queryable.query(
        `SELECT * FROM payroll_attendance_import_errors WHERE batch_id = $1 ORDER BY source_row`,
        [batchId]
      ),
      queryable.query(
        `SELECT correction.* FROM payroll_attendance_corrections correction
         JOIN payroll_daily_attendance daily ON daily.id = correction.daily_attendance_id
         WHERE daily.batch_id = $1 ORDER BY correction.created_at`,
        [batchId]
      ),
    ])
    const daily = dailyResult.rows.map(normalizeDaily)
    return {
      ...batchResult.rows[0],
      period_start: dateKey(batchResult.rows[0].period_start),
      period_end: dateKey(batchResult.rows[0].period_end),
      row_count: Number(batchResult.rows[0].row_count),
      error_count: Number(batchResult.rows[0].error_count),
      daily,
      errors: errorResult.rows,
      corrections: correctionResult.rows,
    }
  }

  async function getAttendanceBatch(batchId) {
    return getAttendanceBatchWith(db, Number(batchId))
  }

  async function resolveAttendanceException({
    dailyAttendanceId,
    timeIn,
    timeOut,
    status = 'present',
    lateMinutes: lateMinutesInput,
    undertimeMinutes: undertimeMinutesInput,
    adjustmentType = 'manual_adjustment',
    reason,
  }, actor = {}) {
    const allowedStatuses = new Set(['present', 'absent', 'paid_leave', 'unpaid_leave', 'partial_leave'])
    if (!allowedStatuses.has(status)) throw new TypeError('status must be present, absent, paid_leave, unpaid_leave, or partial_leave')
    const allowedAdjustmentTypes = new Set([
      'manual_adjustment', 'actual_times', 'undertime', 'half_day',
      'absent', 'paid_leave', 'unpaid_leave', 'partial_leave',
    ])
    if (!allowedAdjustmentTypes.has(adjustmentType)) throw new TypeError('Invalid attendance adjustment type')
    const correctionReason = String(reason || '').trim().slice(0, 1000)
    if (!correctionReason) throw new TypeError('A reason is required for attendance corrections')
    return withTransaction(db, async (tx) => {
      const dailyResult = await tx.query(
        `SELECT daily.*, employee.employee_code
         FROM payroll_daily_attendance daily
         JOIN employees employee ON employee.id = daily.employee_id
         WHERE daily.id = $1 FOR UPDATE`,
        [Number(dailyAttendanceId)]
      )
      const daily = dailyResult.rows[0]
      if (!daily) throw serviceError('Attendance day was not found', 404)
      const finalizedRunResult = await tx.query(
        `SELECT id FROM payroll_runs
         WHERE attendance_batch_id = $1
           AND status IN ('approved', 'locked')
           AND period_start <= $2 AND period_end >= $2
         LIMIT 1`,
        [daily.batch_id, dateKey(daily.work_date)]
      )
      if (finalizedRunResult.rows.length) {
        throw serviceError('Attendance cannot be changed after payroll is approved or locked', 409)
      }
      const profileResult = await tx.query(
        `SELECT * FROM payroll_employee_profiles
         WHERE employee_id = $1 AND effective_from <= $2
           AND COALESCE(effective_to, 'infinity'::date) >= $2
         ORDER BY effective_from DESC LIMIT 1`,
        [daily.employee_id, dateKey(daily.work_date)]
      )
      const profile = normalizeProfile(profileResult.rows[0])
      if (!profile) throw new Error('No payroll profile covers this attendance date')

      let firstScanAt = null
      let lastScanAt = null
      let scanCount = 0
      let lateMinutes = 0
      let undertimeMinutes = 0
      const leaveDeductionFraction = status === 'paid_leave' ? 0 : status === 'partial_leave' ? 0.5 : 1
      if (status === 'present') {
        const requestedTimeIn = timeIn === undefined ? daily.first_scan_at : timeIn
        const requestedTimeOut = timeOut === undefined ? daily.last_scan_at : timeOut
        firstScanAt = parseCorrectionTimestamp(requestedTimeIn, dateKey(daily.work_date))
        lastScanAt = parseCorrectionTimestamp(requestedTimeOut, dateKey(daily.work_date))
        if (!firstScanAt || !lastScanAt || lastScanAt <= firstScanAt) {
          throw new TypeError('Present attendance requires valid timeIn and timeOut values in order')
        }
        const calculated = computeDailyAttendance({
          date: daily.work_date,
          profile,
          events: [{ occurredAt: firstScanAt }, { occurredAt: lastScanAt }],
        })
        lateMinutes = lateMinutesInput == null ? calculated.lateMinutes : Number(lateMinutesInput)
        undertimeMinutes = undertimeMinutesInput == null ? calculated.undertimeMinutes : Number(undertimeMinutesInput)
        if (!Number.isFinite(lateMinutes) || lateMinutes < 0 || lateMinutes > 1440) {
          throw new TypeError('lateMinutes must be between 0 and 1440')
        }
        const [startHour, startMinute] = String(profile.work_start_time || '09:00').split(':').map(Number)
        const [endHour, endMinute] = String(profile.work_end_time || '18:00').split(':').map(Number)
        const scheduledPaidMinutes = Math.max(
          0,
          (endHour * 60 + endMinute) - (startHour * 60 + startMinute) - Number(profile.unpaid_break_minutes || 0)
        )
        if (!Number.isFinite(undertimeMinutes) || undertimeMinutes < 0 || undertimeMinutes > scheduledPaidMinutes) {
          throw new TypeError(`undertimeMinutes must be between 0 and ${scheduledPaidMinutes}`)
        }
        scanCount = 2
      }
      const fields = actorFields(actor)
      const auditReason = `[${adjustmentType}; late=${lateMinutes}; undertime=${undertimeMinutes}] ${correctionReason}`
      await tx.query(
        `INSERT INTO payroll_attendance_corrections
           (daily_attendance_id, previous_status, previous_time_in, previous_time_out,
            corrected_status, corrected_time_in, corrected_time_out, reason,
            actor_user_id, actor_role, actor_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [daily.id, daily.status, daily.first_scan_at, daily.last_scan_at, status, firstScanAt, lastScanAt,
          auditReason, fields.userId, fields.role, fields.name]
      )
      const updated = await tx.query(
        `UPDATE payroll_daily_attendance
         SET status = $1, first_scan_at = $2, last_scan_at = $3, scan_count = $4,
             late_minutes = $5, undertime_minutes = $6, exception_reason = NULL,
             leave_deduction_fraction = $7, correction_reason = $8, corrected_by = $9, corrected_at = NOW()
         WHERE id = $10 RETURNING *`,
        [status, firstScanAt, lastScanAt, scanCount, lateMinutes, undertimeMinutes,
          leaveDeductionFraction, correctionReason, fields.userId, daily.id]
      )
      await appendAudit(tx, actor, 'payroll_attendance_corrected', 'payroll_daily_attendance', daily.id)
      return normalizeDaily(updated.rows[0])
    })
  }

  async function listRuns({ status = null, limit = 100 } = {}) {
    const normalizedLimit = Math.max(1, Math.min(250, Number(limit) || 100))
    const { rows } = await db.query(
      `SELECT run.*, COUNT(line.id)::integer AS employee_count,
              COALESCE(SUM(line.net_pay), 0)::numeric AS total_net_pay
       FROM payroll_runs run
       LEFT JOIN payroll_run_lines line ON line.payroll_run_id = run.id
       WHERE ($1::varchar IS NULL OR run.status = $1)
       GROUP BY run.id
       ORDER BY run.payday DESC, run.id DESC
       LIMIT $2`,
      [status, normalizedLimit]
    )
    return rows.map((run) => ({
      ...run,
      period_start: dateKey(run.period_start),
      period_end: dateKey(run.period_end),
      payday: dateKey(run.payday),
    }))
  }

  async function getRun(runId) {
    return getRunWithLines(db, Number(runId))
  }

  async function previewRun(input, actor = {}) {
    const periodStart = dateKey(input.periodStart ?? input.period_start)
    const periodEnd = dateKey(input.periodEnd ?? input.period_end)
    const payday = dateKey(input.payday)
    const attendanceCutoff = input.attendanceCutoff ?? input.attendance_cutoff ?? null
    const cutoff = String(input.cutoff || '').toLowerCase()
    if (periodEnd < periodStart) throw new RangeError('periodEnd must be on or after periodStart')
    validatePayrollPeriod(periodStart, periodEnd, cutoff)
    if (payday <= periodEnd) throw new RangeError('payday must be after the attendance cutoff')
    const includeContributions = cutoff === 'second' && Boolean(input.includeContributions ?? input.include_contributions)
    const attendanceBatchId = input.attendanceBatchId ?? input.attendance_batch_id ?? null
    const fields = actorFields(actor)

    return withTransaction(db, async (tx) => {
      if (attendanceBatchId != null) {
        const batchResult = await tx.query(
          `SELECT id, period_start, period_end FROM payroll_attendance_import_batches WHERE id = $1`,
          [Number(attendanceBatchId)]
        )
        const batch = batchResult.rows[0]
        if (!batch) throw serviceError('Attendance import batch was not found', 404)
        if (dateKey(batch.period_start) > periodStart || dateKey(batch.period_end) < periodEnd) {
          throw serviceError('Attendance import batch does not cover the full payroll period', 400)
        }
      }

      const existingResult = await tx.query(
        `SELECT * FROM payroll_runs WHERE period_start = $1 AND period_end = $2 AND cutoff = $3 FOR UPDATE`,
        [periodStart, periodEnd, cutoff]
      )
      let existingRun = null
      if (existingResult.rows[0]) {
        const existing = existingResult.rows[0]
        if (existing.status !== 'draft') throw serviceError('A payroll run for this period and cutoff already exists', 409)
        if (Number(existing.attendance_batch_id || 0) !== Number(attendanceBatchId || 0) ||
            Boolean(existing.include_contributions) !== includeContributions || dateKey(existing.payday) !== payday) {
          throw serviceError('A draft payroll run already exists with different inputs', 409)
        }
        existingRun = existing
        const adjustments = await tx.query(
          `SELECT employee_code FROM payroll_run_lines
           WHERE payroll_run_id = $1 AND (
             jsonb_array_length(COALESCE(details->'manualEarnings', '[]'::jsonb)) > 0 OR
             jsonb_array_length(COALESCE(details->'charges', '[]'::jsonb)) > 0)
           LIMIT 1`,
          [existing.id]
        )
        if (adjustments.rows.length) {
          throw serviceError('This draft has earnings or charges. Remove them before recreating the preview.', 409)
        }
        await tx.query('DELETE FROM payroll_run_lines WHERE payroll_run_id = $1', [existing.id])
      }

      const employeesResult = await tx.query(
        `SELECT employee.id AS employee_id, employee.employee_code, employee.first_name, employee.last_name,
                profile.id AS profile_id, profile.effective_from, profile.effective_to,
                profile.monthly_basic_salary, profile.monthly_cola, profile.daily_fare_rate, profile.work_start_time,
                profile.work_end_time, profile.unpaid_break_minutes, profile.workdays, profile.daily_rate_divisor
         FROM employees employee
         LEFT JOIN LATERAL (
           SELECT payroll_profile.* FROM payroll_employee_profiles payroll_profile
           WHERE payroll_profile.employee_id = employee.id
             AND payroll_profile.effective_from <= $1
             AND COALESCE(payroll_profile.effective_to, 'infinity'::date) >= $1
           ORDER BY payroll_profile.effective_from DESC
           LIMIT 1
         ) profile ON TRUE
         WHERE COALESCE(LOWER(employee.status), 'active') IN ('active', 'on_leave')
         ORDER BY employee.last_name, employee.first_name, employee.id`,
        [periodEnd]
      )
      const missingProfiles = employeesResult.rows.filter((row) => row.profile_id == null)
      if (missingProfiles.length) {
        throw serviceError(`Missing effective payroll profile for: ${missingProfiles.map((row) => row.employee_code).join(', ')}`, 400)
      }
      const firstCutoffRows = cutoff === 'second' && includeContributions
        ? (await tx.query(
          `SELECT line.*, run.id AS first_cutoff_run_id, run.status AS first_cutoff_status
           FROM payroll_run_lines line JOIN payroll_runs run ON run.id = line.payroll_run_id
           WHERE run.cutoff = 'first' AND run.period_end = $1::date
             AND run.status IN ('approved', 'locked')`,
          [`${periodEnd.slice(0, 7)}-10`]
        )).rows : []
      const firstCutoffByEmployee = new Map(firstCutoffRows.map((line) => [Number(line.employee_id), line]))

      const ruleSnapshot = {
        version: 4,
        contributionSchedule: 'PH-2025',
        sssBasisRule: 'first cutoff eligible pay + second cutoff net basic + approved overtime; WSH/RD premium excluded per workbook Remittance',
        payrollFrequency: 'semi-monthly',
        fixedCutoffGrossRule: 'monthly_basic_salary / 2',
        colaRule: 'monthly_cola split across two cutoffs (odd cent to first), separate non-taxable earning; excluded from workbook SSS lookup',
        attendanceTimezone: 'Asia/Manila',
        dailyRateDivisor: 261,
        scheduledHoursPerDay: 8,
        mealBreakMinutes: 60,
        mealBreakStart: '13:00',
        attendanceReaders: {
          'Main_Door_Out_Door1_Entrance Card Reader1': 'time_in',
          'Main_Door_IN_Door1_Entrance Card Reader1': 'time_out',
          'New Bio_New Office Biometrics_Entrance Card Reader1': 'first_or_last_endpoint',
        },
        missedTimeDeduction: 'late_and_undertime_minutes * daily_rate / 8 / 60',
        contributionsAppliedThisRun: includeContributions,
        createdAt: new Date().toISOString(),
      }
      const runResult = existingRun
        ? { rows: [existingRun] }
        : await tx.query(
          `INSERT INTO payroll_runs
             (period_start, period_end, attendance_cutoff, payday, cutoff, attendance_batch_id,
              include_contributions, rule_snapshot, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
           RETURNING *`,
          [periodStart, periodEnd, attendanceCutoff ? dateKey(attendanceCutoff) : null, payday,
            cutoff, attendanceBatchId == null ? null : Number(attendanceBatchId), includeContributions,
            JSON.stringify(ruleSnapshot), fields.userId]
        )
      const run = runResult.rows[0]
      let attendanceRows = []
      let attendanceErrors = []
      if (attendanceBatchId != null) {
        const [dailyResult, errorsResult] = await Promise.all([
          tx.query(
            `SELECT * FROM payroll_daily_attendance
             WHERE batch_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY employee_id, work_date`,
            [Number(attendanceBatchId), periodStart, periodEnd]
          ),
          tx.query(
            `SELECT COUNT(*)::integer AS count FROM payroll_attendance_import_errors WHERE batch_id = $1`,
            [Number(attendanceBatchId)]
          ),
        ])
        attendanceRows = dailyResult.rows
        attendanceErrors = Number(errorsResult.rows[0]?.count || 0)
      }
      const dailyByEmployee = new Map()
      for (const row of attendanceRows) {
        const group = dailyByEmployee.get(Number(row.employee_id)) || []
        group.push(row)
        dailyByEmployee.set(Number(row.employee_id), group)
      }

      for (const employee of employeesResult.rows) {
        const profile = normalizeProfile({
          ...employee,
          employee_id: employee.employee_id,
        })
        const attendance = dailyByEmployee.get(Number(employee.employee_id)) || []
        const lineInput = {
          monthlyBasicSalary: profile.monthly_basic_salary,
          monthlyCola: profile.monthly_cola,
          dailyRateDivisor: profile.daily_rate_divisor,
          workdays: profile.workdays,
          cutoff,
          includeContributions,
          attendance,
        }
        const baseLine = computeLineWithLeave({ ...lineInput, includeContributions: false })
        const firstCutoffLine = firstCutoffByEmployee.get(Number(employee.employee_id))
        const firstCutoffPay = firstCutoffLine
          ? calculateSssAssessablePay({ firstCutoffPay: 0, grossSalary: firstCutoffLine.gross_salary,
            absenceDeduction: firstCutoffLine.absence_deduction, lateDeduction: firstCutoffLine.late_deduction,
            undertimeDeduction: firstCutoffLine.undertime_deduction,
            basicAdjustment: basicAdjustmentTotal(firstCutoffLine.details?.charges || []),
            manualEarnings: firstCutoffLine.details?.manualEarnings || [] }).monthlyCompensation
          : baseLine.grossSalary
        const sssAssessment = cutoff === 'second' && includeContributions
          ? calculateSssAssessablePay({ firstCutoffPay, grossSalary: baseLine.grossSalary,
            absenceDeduction: baseLine.absenceDeduction, lateDeduction: baseLine.lateDeduction,
            undertimeDeduction: baseLine.undertimeDeduction }) : null
        const line = sssAssessment
          ? computeLineWithLeave({ ...lineInput, sssCompensation: sssAssessment.monthlyCompensation }) : baseLine
        const details = {
          contributionBasis: line.contributionBasis,
          sssAssessment: sssAssessment ? { ...sssAssessment,
            firstCutoffSource: firstCutoffLine ? `saved-first-cutoff-${firstCutoffLine.first_cutoff_status}` : 'assumed-half-basic',
            firstCutoffRunId: firstCutoffLine?.first_cutoff_run_id ?? null } : null,
          attendance: attendance.map((record) => ({
            date: dateKey(record.work_date),
            status: record.status,
            scanCount: Number(record.scan_count),
            lateMinutes: Number(record.late_minutes),
            undertimeMinutes: Number(record.undertime_minutes),
            leaveDeductionFraction: Number(record.leave_deduction_fraction ?? 1),
            correctionReason: record.correction_reason || null,
          })),
          attendanceImportErrors: attendanceErrors,
          contributionSchedule: 'PH-2025',
          charges: [],
        }
        await tx.query(
          `INSERT INTO payroll_run_lines
             (payroll_run_id, employee_id, employee_code, employee_name, monthly_basic_salary,
              daily_rate, hourly_rate, gross_salary, absence_days, paid_leave_days, unpaid_leave_days,
              absence_deduction, late_minutes, late_deduction, undertime_minutes, undertime_deduction,
              employee_sss, employer_sss, employer_ec, employee_philhealth, employer_philhealth,
              employee_pagibig, employer_pagibig, thirteenth_month_accrual,
              net_pay, details, cola_pay)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26::jsonb, $27)`,
          [run.id, employee.employee_id, employee.employee_code,
            `${employee.first_name} ${employee.last_name}`.trim(), line.monthlyBasicSalary,
            line.dailyRate, line.hourlyRate, line.grossSalary,
            line.absenceDays, line.paidLeaveDays, line.unpaidLeaveDays,
            line.absenceDeduction, line.lateMinutes, line.lateDeduction, line.undertimeMinutes, line.undertimeDeduction,
            line.employeeSss, line.employerSss, line.employerEc,
            line.employeePhilhealth, line.employerPhilhealth,
            line.employeePagibig, line.employerPagibig,
            line.thirteenthMonthAccrual, line.netPay, JSON.stringify(details), line.colaPay]
        )
      }
      await appendRunEvent(tx, run.id, existingRun ? 'draft_refreshed' : 'draft_created', actor, {
        employeeCount: employeesResult.rows.length,
        attendanceBatchId: attendanceBatchId == null ? null : Number(attendanceBatchId),
        periodStart,
        periodEnd,
        cutoff,
      })
      return getRunWithLines(tx, run.id)
    })
  }

  async function getRunWithLines(queryable, runId) {
    const [runResult, linesResult, eventsResult] = await Promise.all([
      queryable.query('SELECT * FROM payroll_runs WHERE id = $1', [runId]),
      queryable.query('SELECT * FROM payroll_run_lines WHERE payroll_run_id = $1 ORDER BY employee_name', [runId]),
      queryable.query('SELECT * FROM payroll_run_events WHERE payroll_run_id = $1 ORDER BY created_at', [runId]),
    ])
    if (!runResult.rows[0]) return null
    return {
      ...runResult.rows[0],
      period_start: dateKey(runResult.rows[0].period_start),
      period_end: dateKey(runResult.rows[0].period_end),
      payday: dateKey(runResult.rows[0].payday),
      lines: linesResult.rows,
      events: eventsResult.rows,
    }
  }

  async function updateManualEarnings(runId, lineId, earnings, actor = {}) {
    if (!Array.isArray(earnings) || earnings.length > 6) {
      throw serviceError('Provide up to 6 manual earnings entries', 400)
    }
    if (earnings.some((entry) => entry?.type === 'special_holiday_pay')) {
      throw serviceError('Remove legacy full-holiday-pay lines and add only the 30% WSH/RD premium', 400)
    }
    const allowedTypes = new Set(['overtime', 'holiday_premium', 'other'])
    const normalized = earnings.map((entry) => {
      const type = String(entry?.type || '')
      const amount = Number(entry?.amount)
      const note = String(entry?.note || '').trim()
      if (!allowedTypes.has(type) || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 ||
          Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001 || note.length < 3 || note.length > 200) {
        throw serviceError('Each earning needs a valid type, positive peso amount, and a 3–200 character reason', 400)
      }
      if (type === 'holiday_premium' && entry.approvedHours !== undefined) {
        const approvedHours = Number(entry.approvedHours)
        const holidayDate = String(entry.holidayDate || '')
        if (!Number.isFinite(approvedHours) || approvedHours <= 0 || approvedHours > 8 ||
            Math.abs(approvedHours * 100 - Math.round(approvedHours * 100)) > 0.000001 ||
            !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate) ||
            Number.isNaN(Date.parse(`${holidayDate}T00:00:00Z`)) ||
            new Date(`${holidayDate}T00:00:00Z`).toISOString().slice(0, 10) !== holidayDate) {
          throw serviceError('A calculated holiday premium needs a date and 0.01–8 approved paid hours', 400)
        }
        return { type, amount, note, approvedHours, holidayDate }
      }
      return { type, amount, note }
    })
    return withTransaction(db, async (tx) => {
      const { rows } = await tx.query(
        `SELECT line.*, run.status, run.cutoff, run.include_contributions, run.period_start, run.period_end FROM payroll_run_lines line
         JOIN payroll_runs run ON run.id = line.payroll_run_id
         WHERE line.id = $1 AND run.id = $2 FOR UPDATE OF line, run`,
        [lineId, runId]
      )
      const line = rows[0]
      if (!line) return null
      if (line.status !== 'draft') throw serviceError('Only draft payroll earnings can be changed', 409)
      const holidayDates = new Set()
      const recalculated = normalized.map((entry) => {
        if (entry.type !== 'holiday_premium' || entry.approvedHours === undefined) return entry
        if (entry.holidayDate < dateKey(line.period_start) || entry.holidayDate > dateKey(line.period_end) ||
            holidayDates.has(entry.holidayDate)) {
          throw serviceError('Each approved holiday must occur once within this payroll period', 400)
        }
        const weekday = new Date(`${entry.holidayDate}T00:00:00Z`).getUTCDay()
        if (weekday < 1 || weekday > 5) {
          throw serviceError('The 30% WSH/RD calculator only accepts scheduled Monday–Friday dates', 400)
        }
        holidayDates.add(entry.holidayDate)
        return { ...entry, amount: calculateWorkedSpecialHoliday({
          monthlyBasicSalary: Number(line.monthly_basic_salary), dailyRate: Number(line.daily_rate),
          workedHours: entry.approvedHours,
        }).holidayPremium }
      })
      const previous = Array.isArray(line.details?.manualEarnings) ? line.details.manualEarnings : []
      const sssAssessment = line.cutoff === 'second' && line.include_contributions
        ? calculateSssAssessablePay({
          firstCutoffPay: line.details?.sssAssessment?.firstCutoffPay ?? Number(line.monthly_basic_salary) / 2,
          grossSalary: line.gross_salary, absenceDeduction: line.absence_deduction,
          lateDeduction: line.late_deduction, undertimeDeduction: line.undertime_deduction,
          basicAdjustment: basicAdjustmentTotal(line.details?.charges || []),
          manualEarnings: recalculated,
        }) : null
      const sssContributions = sssAssessment
        ? calculateContributions(line.monthly_basic_salary, { sssCompensation: sssAssessment.monthlyCompensation }) : null
      const employeeSss = sssContributions?.sssEmployee ?? Number(line.employee_sss || 0)
      const netPay = draftNetPay(line, { manualEarnings: recalculated, employeeSss })
      if (netPay < 0) throw serviceError('Deductions exceed this employee’s earnings', 422)
      const details = { ...line.details, manualEarnings: recalculated,
        ...(sssAssessment ? { sssAssessment: { ...line.details?.sssAssessment, ...sssAssessment,
          firstCutoffSource: line.details?.sssAssessment?.firstCutoffSource || 'assumed-half-basic' },
          contributionBasis: { ...line.details?.contributionBasis,
            sssCompensation: sssAssessment.monthlyCompensation, sssMsc: sssContributions.sssMsc } } : {}) }
      const updated = await tx.query(
        `UPDATE payroll_run_lines SET details = $1::jsonb, net_pay = $2, employee_sss = $3,
           employer_sss = $4, employer_ec = $5 WHERE id = $6 RETURNING *`,
        [JSON.stringify(details), netPay, employeeSss,
          sssContributions?.sssEmployer ?? Number(line.employer_sss || 0),
          sssContributions?.sssEmployerEc ?? Number(line.employer_ec || 0), lineId]
      )
      await appendRunEvent(tx, runId, 'manual_earnings_updated', actor, {
        lineId, employeeId: line.employee_id, previous, current: recalculated,
      })
      return updated.rows[0]
    })
  }

  async function updateCharges(runId, lineId, charges, actor = {}) {
    const normalized = normalizeCharges(charges)
    return withTransaction(db, async (tx) => {
      const { rows } = await tx.query(
        `SELECT line.*, run.status, run.cutoff, run.include_contributions FROM payroll_run_lines line
         JOIN payroll_runs run ON run.id = line.payroll_run_id
         WHERE line.id = $1 AND run.id = $2 FOR UPDATE OF line, run`,
        [lineId, runId]
      )
      const line = rows[0]
      if (!line) return null
      if (line.status !== 'draft') throw serviceError('Only draft payroll charges can be changed', 409)
      const previous = Array.isArray(line.details?.charges) ? line.details.charges : []
      const sssAssessment = line.cutoff === 'second' && line.include_contributions
        ? calculateSssAssessablePay({
          firstCutoffPay: line.details?.sssAssessment?.firstCutoffPay ?? Number(line.monthly_basic_salary) / 2,
          grossSalary: line.gross_salary, absenceDeduction: line.absence_deduction,
          lateDeduction: line.late_deduction, undertimeDeduction: line.undertime_deduction,
          basicAdjustment: basicAdjustmentTotal(normalized),
          manualEarnings: line.details?.manualEarnings || [],
        }) : null
      const sssContributions = sssAssessment
        ? calculateContributions(line.monthly_basic_salary, { sssCompensation: sssAssessment.monthlyCompensation }) : null
      const employeeSss = sssContributions?.sssEmployee ?? Number(line.employee_sss || 0)
      const netPay = draftNetPay(line, { charges: normalized, employeeSss })
      if (netPay < 0) throw serviceError('Deductions exceed this employee’s earnings', 422)
      const details = { ...line.details, charges: normalized,
        ...(sssAssessment ? { sssAssessment: { ...line.details?.sssAssessment, ...sssAssessment,
          firstCutoffSource: line.details?.sssAssessment?.firstCutoffSource || 'assumed-half-basic' },
          contributionBasis: { ...line.details?.contributionBasis,
            sssCompensation: sssAssessment.monthlyCompensation, sssMsc: sssContributions.sssMsc } } : {}) }
      const updated = await tx.query(
        `UPDATE payroll_run_lines SET details = $1::jsonb, net_pay = $2, employee_sss = $3,
           employer_sss = $4, employer_ec = $5 WHERE id = $6 RETURNING *`,
        [JSON.stringify(details), netPay, employeeSss,
          sssContributions?.sssEmployer ?? Number(line.employer_sss || 0),
          sssContributions?.sssEmployerEc ?? Number(line.employer_ec || 0), lineId]
      )
      await appendRunEvent(tx, runId, 'charges_updated', actor, {
        lineId, employeeId: line.employee_id, previous, current: normalized,
      })
      return updated.rows[0]
    })
  }

  async function overrideFirstCutoffPay(runId, lineId, value, reason, actor = {}) {
    const firstCutoffPay = Number(value)
    const explanation = String(reason || '').trim()
    if (value === '' || value == null || !Number.isFinite(firstCutoffPay) || firstCutoffPay < 0 ||
        firstCutoffPay > 10000000 || Math.abs(firstCutoffPay * 100 - Math.round(firstCutoffPay * 100)) > 0.000001 ||
        explanation.length < 3 || explanation.length > 500) {
      throw serviceError('Enter a valid first-cutoff amount and a 3–500 character reason', 400)
    }
    return withTransaction(db, async (tx) => {
      const { rows } = await tx.query(
        `SELECT line.*, run.status, run.cutoff, run.include_contributions FROM payroll_run_lines line
         JOIN payroll_runs run ON run.id = line.payroll_run_id
         WHERE line.id = $1 AND run.id = $2 FOR UPDATE OF line, run`,
        [lineId, runId]
      )
      const line = rows[0]
      if (!line) return null
      if (line.status !== 'draft' || line.cutoff !== 'second' || !line.include_contributions) {
        throw serviceError('First-cutoff pay can only be corrected on a month-end draft with contributions', 409)
      }
      const previous = line.details?.sssAssessment || null
      const sssAssessment = calculateSssAssessablePay({
        firstCutoffPay, grossSalary: line.gross_salary, absenceDeduction: line.absence_deduction,
        lateDeduction: line.late_deduction, undertimeDeduction: line.undertime_deduction,
        basicAdjustment: basicAdjustmentTotal(line.details?.charges || []),
        manualEarnings: line.details?.manualEarnings || [],
      })
      const contributions = calculateContributions(line.monthly_basic_salary, {
        sssCompensation: sssAssessment.monthlyCompensation,
      })
      const netPay = draftNetPay(line, { employeeSss: contributions.sssEmployee })
      if (netPay < 0) throw serviceError('Deductions exceed this employee’s earnings', 422)
      const details = { ...line.details,
        sssAssessment: { ...sssAssessment, firstCutoffSource: 'hr-override',
          firstCutoffRunId: previous?.firstCutoffRunId ?? null, overrideReason: explanation },
        contributionBasis: { ...line.details?.contributionBasis,
          sssCompensation: sssAssessment.monthlyCompensation, sssMsc: contributions.sssMsc },
      }
      const updated = await tx.query(
        `UPDATE payroll_run_lines SET details = $1::jsonb, net_pay = $2, employee_sss = $3,
           employer_sss = $4, employer_ec = $5 WHERE id = $6 RETURNING *`,
        [JSON.stringify(details), netPay, contributions.sssEmployee,
          contributions.sssEmployer, contributions.sssEmployerEc, lineId]
      )
      await appendRunEvent(tx, runId, 'first_cutoff_pay_overridden', actor, {
        lineId, employeeId: line.employee_id, previousPay: previous?.firstCutoffPay ?? null,
        previousSource: previous?.firstCutoffSource ?? null, firstCutoffPay, reason: explanation,
      })
      return updated.rows[0]
    })
  }

  async function approveRun(runId, actor = {}) {
    if (process.env.PAYROLL_FINALIZATION_ENABLED !== 'true') {
      throw serviceError('Payroll approval is disabled until workbook parity is verified', 403)
    }
    return withTransaction(db, async (tx) => {
      const runResult = await tx.query('SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE', [Number(runId)])
      const run = runResult.rows[0]
      if (!run) return null
      if (run.status !== 'draft') throw serviceError('Only draft payroll runs can be approved', 409)
      if (!run.attendance_batch_id) throw serviceError('An attendance import batch is required before approval', 400)
      const batchResult = await tx.query(
        'SELECT error_count FROM payroll_attendance_import_batches WHERE id = $1',
        [run.attendance_batch_id]
      )
      if (Number(batchResult.rows[0]?.error_count || 0) > 0) throw serviceError('Resolve attendance import errors before approval', 400)
      const exceptionResult = await tx.query(
        `SELECT COUNT(*)::integer AS count FROM payroll_daily_attendance
         WHERE batch_id = $1 AND work_date BETWEEN $2 AND $3 AND status = 'exception'`,
        [run.attendance_batch_id, dateKey(run.period_start), dateKey(run.period_end)]
      )
      if (Number(exceptionResult.rows[0]?.count || 0) > 0) throw serviceError('Resolve incomplete attendance scans before approval', 400)
      const legacyHolidayResult = await tx.query(
        `SELECT 1 FROM payroll_run_lines
         WHERE payroll_run_id = $1 AND COALESCE(details->'manualEarnings', '[]'::jsonb)
           @> '[{"type":"special_holiday_pay"}]'::jsonb LIMIT 1`,
        [Number(runId)]
      )
      if (legacyHolidayResult.rows.length) {
        throw serviceError('Replace legacy full-holiday-pay earnings with the 30% WSH/RD premium before approval', 400)
      }
      if (run.cutoff === 'second' && run.include_contributions) {
        const unverified = await tx.query(
          `SELECT employee_code FROM payroll_run_lines
           WHERE payroll_run_id = $1 AND COALESCE(details->'sssAssessment'->>'firstCutoffSource', '')
             NOT IN ('saved-first-cutoff-approved', 'saved-first-cutoff-locked', 'hr-override')
           LIMIT 1`,
          [Number(runId)]
        )
        if (unverified.rows.length) {
          throw serviceError(`Confirm the 15th payroll amount for ${unverified.rows[0].employee_code} before approval`, 400)
        }
      }
      const fields = actorFields(actor)
      const updated = await tx.query(
        `UPDATE payroll_runs SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 RETURNING *`,
        [fields.userId, Number(runId)]
      )
      await appendRunEvent(tx, run.id, 'approved', actor)
      return getRunWithLines(tx, updated.rows[0].id)
    })
  }

  async function lockRun(runId, actor = {}) {
    if (process.env.PAYROLL_FINALIZATION_ENABLED !== 'true') {
      throw serviceError('Payroll locking is disabled until workbook parity is verified', 403)
    }
    return withTransaction(db, async (tx) => {
      const runResult = await tx.query('SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE', [Number(runId)])
      const run = runResult.rows[0]
      if (!run) return null
      if (run.status !== 'approved') throw serviceError('Only approved payroll runs can be locked', 409)
      const fields = actorFields(actor)
      const updated = await tx.query(
        `UPDATE payroll_runs SET status = 'locked', locked_by = $1, locked_at = NOW()
         WHERE id = $2 RETURNING *`,
        [fields.userId, Number(runId)]
      )
      await appendRunEvent(tx, run.id, 'locked', actor)
      return getRunWithLines(tx, updated.rows[0].id)
    })
  }

  async function listMyLines({ runId = null, employeeId }) {
    const { rows } = await db.query(
      `SELECT line.*, run.period_start, run.period_end, run.payday, run.cutoff, run.status
       FROM payroll_run_lines line
       JOIN payroll_runs run ON run.id = line.payroll_run_id
       WHERE ($1::integer IS NULL OR line.payroll_run_id = $1) AND line.employee_id = $2
         AND run.status IN ('approved', 'locked')`,
      [runId == null ? null : Number(runId), Number(employeeId)]
    )
    const normalized = rows.map((line) => ({
      ...line,
      period_start: dateKey(line.period_start),
      period_end: dateKey(line.period_end),
      payday: dateKey(line.payday),
    }))
    return runId == null ? normalized : normalized[0] || null
  }

  return {
    listProfiles,
    upsertProfile,
    importAttendance,
    getAttendanceBatch,
    resolveAttendanceException,
    listRuns,
    getRun,
    updateManualEarnings,
    updateCharges,
    overrideFirstCutoffPay,
    previewRun,
    approveRun,
    lockRun,
    listMyLines,
  }
}

module.exports = {
  createPayrollService,
  computeLineWithLeave,
  leaveAttendance,
  roundDateRange,
}
