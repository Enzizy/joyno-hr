const express = require('express')
const multer = require('multer')
const { MANAGEMENT_ROLES } = require('../constants/roles')

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

function createPayrollRouter({ db, payrollService, authRequired, requireRole, addAuditLog }) {
  if (!payrollService) throw new Error('Payroll routes require payrollService')
  void db // Included to match the server route-factory dependency contract.
  const router = express.Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CSV_MAX_BYTES, files: 1 },
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
        dailyFareRate: req.body.dailyFareRate,
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
        csvText: req.file.buffer.toString('utf8'),
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
  const message = String(error?.message || '')
  if (/\bnot found\b/i.test(message)) return res.status(404).json({ message })
  if (/\b(already exists|only .* can be|unresolved exception|resolve .* before|does not cover|missing effective payroll profile)\b/i.test(message)) {
    return res.status(409).json({ message })
  }
  console.error('Payroll request failed', error)
  return res.status(500).json({ message: 'Payroll request failed' })
}

module.exports = { createPayrollRouter }
