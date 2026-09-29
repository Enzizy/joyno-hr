const {
  calculatePayrollLine,
  roundMoney,
} = require('./payrollCalculationService')
const {
  addDays,
  computeDailyAttendance,
  dateKey,
  listWeekdays,
  manilaDateParts,
  parseAttendanceCsv,
  parseManilaTimestamp,
  weekday,
} = require('./payrollAttendanceService')

const MAX_IMPORT_DAYS = 62

function serviceError(message, statusCode) {
  const error = new Error(message)
  error.status = statusCode
  error.statusCode = statusCode
  return error
}

function actorFields(actor = {}) {
  return {
    userId: actor.userId ?? actor.user_id ?? actor.id ?? null,
    role: actor.role ?? actor.actor_role ?? null,
    name: actor.name ?? actor.actor_name ?? null,
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
    employee_id: Number(row.employee_id),
    monthly_basic_salary: Number(row.monthly_basic_salary),
    daily_fare_rate: Number(row.daily_fare_rate),
    unpaid_break_minutes: Number(row.unpaid_break_minutes),
    daily_rate_divisor: Number(row.daily_rate_divisor),
    workdays: Array.isArray(row.workdays) ? row.workdays.map(Number) : [1, 2, 3, 4, 5],
  }
}

function normalizeDaily(row) {
  return {
    ...row,
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

function buildWeeklyFareSummary(rows = []) {
  const summaries = new Map()
  for (const row of rows) {
    const workDate = dateKey(row.work_date ?? row.date)
    const weekStart = addDays(workDate, 1 - weekday(workDate))
    const employeeId = Number(row.employee_id)
    const key = `${weekStart}:${employeeId}`
    const current = summaries.get(key) || {
      week_start: weekStart,
      week_end: addDays(weekStart, 4),
      employee_id: employeeId,
      employee_code: row.employee_code,
      employee_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      amount: 0,
    }
    if (row.status === 'present') {
      const dailyFare = Number(row.daily_fare_rate || 0)
      const lateMinutes = Number(row.late_minutes || 0)
      current.amount += Math.max(0, dailyFare - lateMinutes * 5)
    }
    summaries.set(key, current)
  }
  return [...summaries.values()]
    .map((summary) => ({ ...summary, amount: roundMoney(summary.amount) }))
    .sort((left, right) => left.week_start.localeCompare(right.week_start)
      || left.employee_name.localeCompare(right.employee_name))
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
              p.id AS profile_id, p.effective_from, p.effective_to, p.monthly_basic_salary,
              p.daily_fare_rate, p.work_start_time, p.work_end_time, p.unpaid_break_minutes,
              p.workdays, p.daily_rate_divisor
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT profile.* FROM payroll_employee_profiles profile
         WHERE profile.employee_id = e.id
         ORDER BY profile.effective_from DESC, profile.id DESC
         LIMIT 1
       ) p ON TRUE
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
    const dailyFare = Number(input.dailyFareRate ?? input.daily_fare_rate ?? 0)
    const dailyRateDivisor = Number(input.dailyRateDivisor ?? input.daily_rate_divisor ?? 261)
    const workdays = (input.workdays ?? [1, 2, 3, 4, 5]).map(Number)
    const workStart = String(input.workStartTime ?? input.work_start_time ?? '09:00')
    const workEnd = String(input.workEndTime ?? input.work_end_time ?? '18:00')
    const unpaidBreakMinutes = Number(input.unpaidBreakMinutes ?? input.unpaid_break_minutes ?? 60)
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new TypeError('employeeId must be a positive integer')
    if (!Number.isFinite(monthlySalary) || monthlySalary < 0) throw new TypeError('monthlyBasicSalary must be non-negative')
    if (!Number.isFinite(dailyFare) || dailyFare < 0) throw new TypeError('dailyFareRate must be non-negative')
    if (!Number.isFinite(dailyRateDivisor) || dailyRateDivisor <= 0) throw new TypeError('dailyRateDivisor must be positive')
    if (!Number.isInteger(unpaidBreakMinutes) || unpaidBreakMinutes < 0) throw new TypeError('unpaidBreakMinutes must be a non-negative integer')
    if (!workdays.length || workdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new TypeError('workdays must contain weekday numbers from 0 to 6')
    }

    const fields = actorFields(actor)
    return withTransaction(db, async (tx) => {
      const employeeResult = await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId])
      if (!employeeResult.rows[0]) throw serviceError('Employee was not found', 404)
      const { rows } = await tx.query(
        `SELECT id, effective_from, effective_to
         FROM payroll_employee_profiles
         WHERE employee_id = $1
         ORDER BY effective_from
         FOR UPDATE`,
        [employeeId]
      )
      const sameDate = rows.find((row) => dateKey(row.effective_from) === effectiveFrom)
      const later = rows.find((row) => dateKey(row.effective_from) > effectiveFrom)
      const effectiveTo = later ? dateMinusOne(dateKey(later.effective_from)) : null

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
               workdays = $7::smallint[], daily_rate_divisor = $8
           WHERE id = $9
           RETURNING *`,
          [effectiveTo, monthlySalary, dailyFare, workStart, workEnd, unpaidBreakMinutes, workdays, dailyRateDivisor, sameDate.id]
        )
        : await tx.query(
          `INSERT INTO payroll_employee_profiles
             (employee_id, effective_from, effective_to, monthly_basic_salary, daily_fare_rate,
              work_start_time, work_end_time, unpaid_break_minutes, workdays, daily_rate_divisor, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::smallint[], $10, $11)
           RETURNING *`,
          [employeeId, effectiveFrom, effectiveTo, monthlySalary, dailyFare, workStart, workEnd, unpaidBreakMinutes, workdays, dailyRateDivisor, fields.userId]
        )
      await appendAudit(tx, actor, sameDate ? 'payroll_profile_updated' : 'payroll_profile_created', 'payroll_employee_profiles', profileResult.rows[0].id)
      return normalizeProfile(profileResult.rows[0])
    })
  }

  async function importAttendance({ fileName = null, csvText, importedBy = null, periodStart, periodEnd }) {
    const { periodStart: start, periodEnd: end } = roundDateRange(periodStart, periodEnd)
    const records = parseAttendanceCsv(csvText)
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
        `SELECT id, employee_code
         FROM employees
         WHERE COALESCE(LOWER(status), 'active') IN ('active', 'on_leave')`
      )
      const employeesByCode = new Map(employeeResult.rows.map((employee) => [String(employee.employee_code).trim().toLowerCase(), employee]))
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
        const employee = employeesByCode.get(codeKey)
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
        if (!error && !employee) error = `Employee code ${record.employeeCode} was not found or is inactive`
        if (!error && (occurredDate < start || occurredDate > end)) error = `Attendance timestamp is outside the selected period (${start} to ${end})`
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
            grouped.push({ occurredAt: insertResult.rows[0].occurred_at })
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
        `SELECT daily.*, employee.employee_code, employee.first_name, employee.last_name,
                COALESCE(profile.daily_fare_rate, 0) AS daily_fare_rate
         FROM payroll_daily_attendance daily
         JOIN employees employee ON employee.id = daily.employee_id
         LEFT JOIN LATERAL (
           SELECT payroll_profile.daily_fare_rate
           FROM payroll_employee_profiles payroll_profile
           WHERE payroll_profile.employee_id = daily.employee_id
             AND payroll_profile.effective_from <= daily.work_date
             AND COALESCE(payroll_profile.effective_to, 'infinity'::date) >= daily.work_date
           ORDER BY payroll_profile.effective_from DESC
           LIMIT 1
         ) profile ON TRUE
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
      row_count: Number(batchResult.rows[0].row_count),
      error_count: Number(batchResult.rows[0].error_count),
      daily,
      fare_weeks: buildWeeklyFareSummary(daily),
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
    return rows
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
    if (!['first', 'second'].includes(cutoff)) throw new TypeError('cutoff must be first or second')
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
        await tx.query('DELETE FROM payroll_run_lines WHERE payroll_run_id = $1', [existing.id])
      }

      const employeesResult = await tx.query(
        `SELECT employee.id AS employee_id, employee.employee_code, employee.first_name, employee.last_name,
                profile.id AS profile_id, profile.effective_from, profile.effective_to,
                profile.monthly_basic_salary, profile.daily_fare_rate, profile.work_start_time,
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

      const ruleSnapshot = {
        version: 1,
        contributionSchedule: 'PH-2025',
        payrollFrequency: 'semi-monthly',
        fixedCutoffGrossRule: 'monthly_basic_salary / 2',
        attendanceTimezone: 'Asia/Manila',
        dailyRateDivisor: 261,
        scheduledHoursPerDay: 8,
        mealBreakMinutes: 60,
        fareLateDeductionPerMinute: 5,
        contributionsAppliedThisRun: includeContributions,
        farePaidSeparatelyWeekly: true,
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
        const line = computeLineWithLeave({
          monthlyBasicSalary: profile.monthly_basic_salary,
          dailyFareRate: profile.daily_fare_rate,
          dailyRateDivisor: profile.daily_rate_divisor,
          cutoff,
          includeContributions,
          attendance,
        })
        const details = {
          contributionBasis: line.contributionBasis,
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
          farePaidSeparatelyWeekly: true,
        }
        await tx.query(
          `INSERT INTO payroll_run_lines
             (payroll_run_id, employee_id, employee_code, employee_name, monthly_basic_salary,
              daily_rate, hourly_rate, gross_salary, absence_days, paid_leave_days, unpaid_leave_days,
              absence_deduction, undertime_minutes, undertime_deduction,
              employee_sss, employer_sss, employer_ec, employee_philhealth, employer_philhealth,
              employee_pagibig, employer_pagibig, weekly_fare_allowance, thirteenth_month_accrual,
              net_pay, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25::jsonb)`,
          [run.id, employee.employee_id, employee.employee_code,
            `${employee.first_name} ${employee.last_name}`.trim(), line.monthlyBasicSalary,
            line.dailyRate, line.hourlyRate, line.grossSalary,
            line.absenceDays, line.paidLeaveDays, line.unpaidLeaveDays,
            line.absenceDeduction, line.undertimeMinutes, line.undertimeDeduction,
            line.employeeSss, line.employerSss, line.employerEc,
            line.employeePhilhealth, line.employerPhilhealth,
            line.employeePagibig, line.employerPagibig,
            line.weeklyFareAllowance, line.thirteenthMonthAccrual, line.netPay, JSON.stringify(details)]
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
      lines: linesResult.rows,
      events: eventsResult.rows,
    }
  }

  async function approveRun(runId, actor = {}) {
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
    return runId == null ? rows : rows[0] || null
  }

  return {
    listProfiles,
    upsertProfile,
    importAttendance,
    getAttendanceBatch,
    resolveAttendanceException,
    listRuns,
    getRun,
    previewRun,
    approveRun,
    lockRun,
    listMyLines,
  }
}

module.exports = {
  buildWeeklyFareSummary,
  createPayrollService,
  computeLineWithLeave,
  leaveAttendance,
  roundDateRange,
}
