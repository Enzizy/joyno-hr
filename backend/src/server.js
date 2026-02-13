require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const multer = require('multer')
const ExcelJS = require('exceljs')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const db = require('./db')
const { addAuditLog, updateEmployeeStatus } = require('./helpers')
const {
  LEAD_STATUSES,
  LEAD_SOURCES,
  CLIENT_STATUSES,
  CLIENT_PACKAGES,
  LEAD_SERVICES,
  CLIENT_SERVICES,
  SERVICE_STATUSES,
  SOCIAL_PLATFORMS,
  TASK_STATUSES,
  TASK_PRIORITIES,
  AUTOMATION_SCHEDULES,
  normalizeEnum,
  normalizeServices,
  normalizeDaysOfWeek,
  parsePagination,
  calculateContractEndDate,
} = require('./crm')

const app = express()
app.set('trust proxy', 1)

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || ''
const allowedOrigins = FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (!allowedOrigins.length) return callback(new Error('FRONTEND_ORIGIN not set'))
    if (allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'media-src': ["'self'", 'data:', 'blob:', 'https:'],
      },
    },
  })
)
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json())

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true)
    return cb(new Error('Only image attachments are allowed'))
  },
})

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
})

function uploadAttachment(req, res, next) {
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('multipart/form-data')) return next()
  return upload.single('attachment')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Attachment too large (max 1MB)' })
    }
    return res.status(400).json({ message: err.message || 'Invalid attachment' })
  })
}

function uploadProof(req, res, next) {
  const contentType = req.headers['content-type'] || ''
  if (!contentType.includes('multipart/form-data')) return next()
  return proofUpload.single('proof')(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'Proof file too large (max 3MB)' })
    }
    return res.status(400).json({ message: err.message || 'Invalid proof file' })
  })
}

async function createNotification({ userId, type, title, message = null, targetTable = null, targetId = null }) {
  if (!userId || !type || !title) return
  await db.query(
    `INSERT INTO notifications (user_id, type, title, message, target_table, target_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, type, title, message, targetTable, targetId]
  )
}

async function notifyRoles(roles, payload) {
  if (!Array.isArray(roles) || !roles.length) return
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(',')
  const { rows } = await db.query(`SELECT id FROM users WHERE role IN (${placeholders})`, roles)
  for (const row of rows) {
    await createNotification({ userId: row.id, ...payload })
  }
}

async function cleanupOldNotifications(days = 90) {
  const safeDays = Math.max(1, Number(days) || 90)
  await db.query(
    `DELETE FROM notifications
     WHERE is_read = TRUE
       AND created_at < NOW() - ($1::text || ' days')::interval`,
    [safeDays]
  )
}

async function createServicesForClient(clientId, selectedServices = []) {
  const serviceTypes = normalizeServices(selectedServices, CLIENT_SERVICES)
  if (!serviceTypes.length) return
  for (const serviceType of serviceTypes) {
    await db.query(
      `INSERT INTO services (client_id, service_type, status)
       VALUES ($1,$2,$3)`,
      [clientId, serviceType, 'not_started']
    )
  }
}

const LEAVE_TYPES = [
  { id: 'vacation', name: 'Vacation' },
  { id: 'sick', name: 'Sick' },
  { id: 'emergency', name: 'Emergency' },
]

function resolveLeaveTypeName(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const found = LEAVE_TYPES.find(
    (item) => item.id.toLowerCase() === raw.toLowerCase() || item.name.toLowerCase() === raw.toLowerCase()
  )
  return found ? found.name : null
}

async function ensureSchemaColumns() {
  try {
    await db.query(
      "ALTER TABLE employees ADD COLUMN IF NOT EXISTS leave_credits NUMERIC(10,2) NOT NULL DEFAULT 0"
    )
    await db.query(
      "ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_pay_type VARCHAR(20) NOT NULL DEFAULT 'unpaid'"
    )
    await db.query(
      'ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_days NUMERIC(10,2) NOT NULL DEFAULT 0'
    )
    await db.query(
      'ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS credits_deducted NUMERIC(10,2) NOT NULL DEFAULT 0'
    )
    await db.query('ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS fk_leave_requests_type')
    const columnCheck = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'leave_requests' AND column_name = 'leave_type_id'
       LIMIT 1`
    )
    if (columnCheck.rows.length) {
      await db.query('ALTER TABLE leave_requests ALTER COLUMN leave_type_id DROP NOT NULL')
    }
    await db.query('DROP TABLE IF EXISTS leave_types')
  } catch (err) {
    console.error('Failed to ensure schema columns', err)
  }
}

function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (end < start) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end - start) / msPerDay) + 1
}

function isPaidLeaveEligible(dateHired, leaveStartDate) {
  if (!dateHired || !leaveStartDate) return false
  const hired = new Date(dateHired)
  const leaveStart = new Date(leaveStartDate)
  if (Number.isNaN(hired.getTime()) || Number.isNaN(leaveStart.getTime())) return false
  hired.setFullYear(hired.getFullYear() + 1)
  return leaveStart >= hired
}

function resolveLeaveCompensation(employee, startDate, endDate, requestedPayType = 'auto') {
  const leaveDays = calculateLeaveDays(startDate, endDate)
  if (!leaveDays || leaveDays <= 0) return null
  const credits = Number(employee?.leave_credits || 0)
  const eligible = isPaidLeaveEligible(employee?.date_hired, startDate)
  const requested = ['paid', 'unpaid', 'auto'].includes(String(requestedPayType || '').toLowerCase())
    ? String(requestedPayType || '').toLowerCase()
    : 'auto'
  if (!eligible) {
    return { leaveDays, leavePayType: 'unpaid', creditsDeducted: 0 }
  }
  if (requested === 'unpaid') {
    return { leaveDays, leavePayType: 'unpaid', creditsDeducted: 0 }
  }
  if (requested === 'paid') {
    if (credits < leaveDays) {
      return { leaveDays, leavePayType: 'paid', creditsDeducted: leaveDays, insufficientCredits: true }
    }
    return { leaveDays, leavePayType: 'paid', creditsDeducted: leaveDays }
  }
  if (credits >= leaveDays) {
    return { leaveDays, leavePayType: 'paid', creditsDeducted: leaveDays }
  }
  return { leaveDays, leavePayType: 'unpaid', creditsDeducted: 0 }
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      employee_code: user.employee_code,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' })
    }
    return next()
  }
}

async function loadUserProfile(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.employee_id, e.employee_code, e.first_name, e.last_name, e.status, e.department, e.shift, e.date_hired, e.leave_credits
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE u.id = $1`,
    [userId]
  )
  return rows[0] || null
}

function isRuleExpired(rule) {
  if (!rule?.end_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(rule.end_date)
  end.setHours(0, 0, 0, 0)
  return end < today
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Auth
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email])
  const user = rows[0]
  if (!user) return res.status(401).json({ message: 'Invalid credentials' })
  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

  const profile = await loadUserProfile(user.id)
  const token = signToken(profile)
  return res.json({ token, user: profile })
})

app.get('/api/auth/me', authRequired, async (req, res) => {
  const user = await loadUserProfile(req.user.id)
  return res.json({ user })
})

app.post('/api/auth/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing fields' })
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
  const user = rows[0]
  if (!user) return res.status(404).json({ message: 'User not found' })
  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) return res.status(400).json({ message: 'Current password is incorrect' })
  const hash = await bcrypt.hash(newPassword, 10)
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id])
  res.json({ message: 'Password updated' })
})

// Users (Admin)
app.get('/api/users', authRequired, requireRole(['admin']), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.employee_id, e.employee_code
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     ORDER BY u.id DESC`
  )
  res.json(rows)
})

app.post('/api/users', authRequired, requireRole(['admin']), async (req, res) => {
  const { email, password, role = 'employee', employee_id = null } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
  const hash = await bcrypt.hash(password, 10)
  const { rows } = await db.query(
    'INSERT INTO users (email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [email, hash, role, employee_id]
  )
  const createdId = rows[0]?.id
  await addAuditLog(req.user.id, 'create_user', 'users', createdId)
  res.json({ message: 'User created' })
})

app.delete('/api/users/:id', authRequired, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid user id' })
  if (id === req.user.id) return res.status(400).json({ message: 'Cannot delete your own account' })
  const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [id])
  if (!rows.length) return res.status(404).json({ message: 'User not found' })
  await db.query('DELETE FROM users WHERE id = $1', [id])
  await addAuditLog(req.user.id, 'delete_user', 'users', id)
  res.json({ message: 'User deleted' })
})

// Employees
app.get('/api/employees', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM employees ORDER BY created_at DESC')
  res.json(rows)
})

app.get('/api/employees/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id])
  if (!rows.length) return res.status(404).json({ message: 'Employee not found' })
  res.json(rows[0])
})

app.post('/api/employees', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const e = req.body || {}
  const leaveCredits = Number(e.leave_credits ?? 0)
  const { rows } = await db.query(
    `INSERT INTO employees
     (employee_code, first_name, last_name, department, position, shift, date_hired, status, leave_credits)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.shift || 'day',
      e.date_hired,
      e.status || 'active',
      Number.isFinite(leaveCredits) ? leaveCredits : 0,
    ]
  )
  const createdId = rows[0]?.id
  await addAuditLog(req.user.id, 'create_employee', 'employees', createdId)
  const created = await db.query('SELECT * FROM employees WHERE id = $1', [createdId])
  res.json(created.rows[0] || { id: createdId })
})

app.put('/api/employees/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const e = req.body || {}
  const leaveCredits = Number(e.leave_credits ?? 0)
  await db.query(
    `UPDATE employees
     SET employee_code=$1, first_name=$2, last_name=$3, department=$4, position=$5, shift=$6, date_hired=$7, status=$8, leave_credits=$9
     WHERE id=$10`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.shift || 'day',
      e.date_hired,
      e.status || 'active',
      Number.isFinite(leaveCredits) ? leaveCredits : 0,
      req.params.id,
    ]
  )
  await addAuditLog(req.user.id, 'update_employee', 'employees', req.params.id)
  const updated = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id])
  res.json(updated.rows[0] || { id: Number(req.params.id) })
})

app.delete('/api/employees/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  await db.query('DELETE FROM employees WHERE id = $1', [req.params.id])
  await addAuditLog(req.user.id, 'delete_employee', 'employees', req.params.id)
  res.json({ message: 'Employee deleted' })
})

app.post('/api/employees/:id/grant-credits', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  const amount = Number(req.body?.amount)
  if (!id) return res.status(400).json({ message: 'Invalid employee id' })
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Amount must be greater than 0' })
  }

  const { rows } = await db.query(
    `UPDATE employees
     SET leave_credits = leave_credits + $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [amount, id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Employee not found' })

  await addAuditLog(req.user.id, 'grant_leave_credits', 'employees', id)
  res.json(rows[0])
})

// Leads (CRM)
app.get('/api/leads', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const status = normalizeEnum(req.query.status, LEAD_STATUSES, { defaultValue: null, allowNull: true })
  const source = normalizeEnum(req.query.source, LEAD_SOURCES, { defaultValue: null, allowNull: true })
  const search = String(req.query.search || '').trim()
  const { limit, offset } = parsePagination(req.query, 10, 50)
  let sql = 'SELECT * FROM leads WHERE 1=1'
  const params = []
  if (status) {
    params.push(status)
    sql += ` AND status = $${params.length}`
  }
  if (source) {
    params.push(source)
    sql += ` AND source = $${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (company_name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR email ILIKE $${params.length})`
  }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/leads', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const payload = req.body || {}
  if (!payload.company_name || !payload.contact_name || !payload.email) {
    return res.status(400).json({ message: 'Company name, contact name, and email are required' })
  }
  const status = normalizeEnum(payload.status, LEAD_STATUSES, { defaultValue: 'new' })
  const source = normalizeEnum(payload.source, LEAD_SOURCES, { defaultValue: null, allowNull: true })
  if ((payload.status || '') && !status) {
    return res.status(400).json({ message: 'Invalid lead status' })
  }
  if ((payload.source || '') && !source) {
    return res.status(400).json({ message: 'Invalid lead source' })
  }
  const interestedServices = normalizeServices(payload.interested_services, LEAD_SERVICES)
  const duplicate = await db.query(
    'SELECT id FROM leads WHERE LOWER(company_name) = LOWER($1) AND LOWER(email) = LOWER($2) LIMIT 1',
    [payload.company_name, payload.email]
  )
  if (duplicate.rows.length) {
    return res.status(409).json({ message: 'Lead already exists for this company and email' })
  }
  const { rows } = await db.query(
    `INSERT INTO leads
     (company_name, contact_name, email, phone, source, status, interested_services, estimated_value, next_follow_up, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
     RETURNING *`,
    [
      payload.company_name,
      payload.contact_name,
      payload.email,
      payload.phone || null,
      source,
      status,
      JSON.stringify(interestedServices),
      payload.estimated_value || 0,
      payload.next_follow_up || null,
      payload.notes || null,
    ]
  )
  const created = rows[0]
  await addAuditLog(req.user.id, 'create_lead', 'leads', created?.id)
  res.json(created)
})

app.put('/api/leads/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const payload = req.body || {}
  if (!payload.company_name || !payload.contact_name || !payload.email) {
    return res.status(400).json({ message: 'Company name, contact name, and email are required' })
  }
  const status = normalizeEnum(payload.status, LEAD_STATUSES, { defaultValue: 'new' })
  const source = normalizeEnum(payload.source, LEAD_SOURCES, { defaultValue: null, allowNull: true })
  if ((payload.status || '') && !status) {
    return res.status(400).json({ message: 'Invalid lead status' })
  }
  if ((payload.source || '') && !source) {
    return res.status(400).json({ message: 'Invalid lead source' })
  }
  const interestedServices = normalizeServices(payload.interested_services, LEAD_SERVICES)
  const duplicate = await db.query(
    'SELECT id FROM leads WHERE LOWER(company_name) = LOWER($1) AND LOWER(email) = LOWER($2) AND id <> $3 LIMIT 1',
    [payload.company_name, payload.email, id]
  )
  if (duplicate.rows.length) {
    return res.status(409).json({ message: 'Lead already exists for this company and email' })
  }
  const { rows } = await db.query(
    `UPDATE leads SET
      company_name=$1, contact_name=$2, email=$3, phone=$4, source=$5, status=$6,
      interested_services=$7::jsonb, estimated_value=$8, next_follow_up=$9, notes=$10
     WHERE id=$11
     RETURNING *`,
    [
      payload.company_name,
      payload.contact_name,
      payload.email,
      payload.phone || null,
      source,
      status,
      JSON.stringify(interestedServices),
      payload.estimated_value || 0,
      payload.next_follow_up || null,
      payload.notes || null,
      id,
    ]
  )
  if (!rows.length) return res.status(404).json({ message: 'Lead not found' })
  await addAuditLog(req.user.id, 'update_lead', 'leads', id)
  res.json(rows[0])
})

app.delete('/api/leads/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const { rows } = await db.query('DELETE FROM leads WHERE id = $1 RETURNING id', [id])
  if (!rows.length) return res.status(404).json({ message: 'Lead not found' })
  await addAuditLog(req.user.id, 'delete_lead', 'leads', id)
  res.json({ message: 'Lead deleted' })
})

app.get('/api/leads/:id/conversations', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const { rows } = await db.query(
    `SELECT c.*, u.email AS created_by_email
     FROM lead_conversations c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.lead_id = $1
     ORDER BY c.happened_at DESC, c.id DESC`,
    [id]
  )
  res.json(rows)
})

app.post('/api/leads/:id/conversations', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const payload = req.body || {}
  if (!payload.summary) return res.status(400).json({ message: 'Summary is required' })
  const { rows } = await db.query(
    `INSERT INTO lead_conversations (lead_id, type, happened_at, summary, outcome, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      id,
      payload.type || 'other',
      payload.happened_at || new Date().toISOString(),
      payload.summary,
      payload.outcome || null,
      req.user.id,
    ]
  )
  await addAuditLog(req.user.id, 'create_lead_conversation', 'lead_conversations', rows[0]?.id)
  res.json(rows[0])
})

app.post('/api/leads/:id/convert', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const payload = req.body || {}
  const { rows } = await db.query('SELECT * FROM leads WHERE id = $1', [id])
  const lead = rows[0]
  if (!lead) return res.status(404).json({ message: 'Lead not found' })
  if (lead.status === 'converted') return res.status(400).json({ message: 'Lead already converted' })
  const existingActiveClient = await db.query(
    `SELECT id FROM clients
     WHERE status = 'active'
       AND LOWER(company_name) = LOWER($1)
       AND LOWER(email) = LOWER($2)
     LIMIT 1`,
    [lead.company_name, lead.email]
  )
  if (existingActiveClient.rows.length) {
    return res.status(409).json({ message: 'An active client already exists for this company and email' })
  }

  const contractStart = payload.contract_start_date || null
  const contractEnd = calculateContractEndDate(contractStart, payload.contract_duration_months)
  const selectedServices = normalizeServices(payload.services, CLIENT_SERVICES)
  const packageName = normalizeEnum(payload.package_name, CLIENT_PACKAGES, { defaultValue: 'custom' })
  const clientResult = await db.query(
    `INSERT INTO clients
     (lead_id, company_name, contact_name, email, phone, package_name, monthly_value, package_details, services, contract_start_date, contract_end_date, address, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,'active')
     RETURNING *`,
    [
      id,
      lead.company_name,
      lead.contact_name,
      lead.email,
      lead.phone || null,
      packageName,
      payload.monthly_value || 0,
      payload.package_details || null,
      JSON.stringify(selectedServices),
      contractStart,
      contractEnd,
      payload.address || null,
      payload.notes || null,
    ]
  )
  const client = clientResult.rows[0]
  await createServicesForClient(client.id, selectedServices)
  await db.query('UPDATE leads SET status = $1, converted_client_id = $2 WHERE id = $3', ['converted', client.id, id])

  await addAuditLog(req.user.id, 'convert_lead', 'leads', id)
  res.json({ client_id: client.id, lead_id: id })
})

// Clients (CRM)
app.get('/api/clients', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const status = normalizeEnum(req.query.status, CLIENT_STATUSES, { defaultValue: null, allowNull: true })
  const search = String(req.query.search || '').trim()
  const { limit, offset } = parsePagination(req.query, 10, 50)
  let sql = 'SELECT * FROM clients WHERE 1=1'
  const params = []
  if (status) {
    params.push(status)
    sql += ` AND status = $${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (company_name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR email ILIKE $${params.length})`
  }
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/clients', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const payload = req.body || {}
  if (!payload.company_name || !payload.contact_name || !payload.email || !payload.contract_start_date) {
    return res.status(400).json({ message: 'Company, contact, email, and contract start date are required' })
  }
  const selectedServices = normalizeServices(payload.services, CLIENT_SERVICES)
  const status = normalizeEnum(payload.status, CLIENT_STATUSES, { defaultValue: 'active' })
  const packageName = normalizeEnum(payload.package_name, CLIENT_PACKAGES, { defaultValue: 'custom' })
  if ((payload.status || '') && !status) {
    return res.status(400).json({ message: 'Invalid client status' })
  }
  if ((payload.package_name || '') && !packageName) {
    return res.status(400).json({ message: 'Invalid package name' })
  }
  if (status === 'active') {
    const duplicate = await db.query(
      `SELECT id FROM clients
       WHERE status = 'active'
         AND LOWER(company_name) = LOWER($1)
         AND LOWER(email) = LOWER($2)
       LIMIT 1`,
      [payload.company_name, payload.email]
    )
    if (duplicate.rows.length) {
      return res.status(409).json({ message: 'An active client already exists for this company and email' })
    }
  }
  const duration = Number(payload.contract_duration_months || 12)
  const contractEnd = calculateContractEndDate(payload.contract_start_date, duration)
  const { rows } = await db.query(
    `INSERT INTO clients
     (lead_id, company_name, contact_name, email, phone, package_name, monthly_value, package_details, services, contract_start_date, contract_end_date, address, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      payload.lead_id || null,
      payload.company_name,
      payload.contact_name,
      payload.email,
      payload.phone || null,
      packageName,
      payload.monthly_value || 0,
      payload.package_details || null,
      JSON.stringify(selectedServices),
      payload.contract_start_date,
      contractEnd,
      payload.address || null,
      payload.notes || null,
      status,
    ]
  )
  await createServicesForClient(rows[0]?.id, selectedServices)
  await addAuditLog(req.user.id, 'create_client', 'clients', rows[0]?.id)
  res.json(rows[0])
})

app.put('/api/clients/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid client id' })
  const payload = req.body || {}
  if (!payload.company_name || !payload.contact_name || !payload.email || !payload.contract_start_date) {
    return res.status(400).json({ message: 'Company, contact, email, and contract start date are required' })
  }
  const currentResult = await db.query('SELECT * FROM clients WHERE id = $1', [id])
  if (!currentResult.rows.length) return res.status(404).json({ message: 'Client not found' })
  const current = currentResult.rows[0]
  const status = normalizeEnum(payload.status, CLIENT_STATUSES, { defaultValue: 'active' })
  const packageName = normalizeEnum(payload.package_name, CLIENT_PACKAGES, { defaultValue: 'custom' })
  if ((payload.status || '') && !status) {
    return res.status(400).json({ message: 'Invalid client status' })
  }
  if ((payload.package_name || '') && !packageName) {
    return res.status(400).json({ message: 'Invalid package name' })
  }
  if (status === 'active') {
    const duplicate = await db.query(
      `SELECT id FROM clients
       WHERE status = 'active'
         AND LOWER(company_name) = LOWER($1)
         AND LOWER(email) = LOWER($2)
         AND id <> $3
       LIMIT 1`,
      [payload.company_name, payload.email, id]
    )
    if (duplicate.rows.length) {
      return res.status(409).json({ message: 'An active client already exists for this company and email' })
    }
  }
  const duration = Number(payload.contract_duration_months || 12)
  const contractEnd = calculateContractEndDate(payload.contract_start_date, duration)

  await db.query(
    `UPDATE clients SET
      company_name=$1, contact_name=$2, email=$3, phone=$4, package_name=$5, monthly_value=$6,
      package_details=$7, services=$8::jsonb, contract_start_date=$9, contract_end_date=$10,
      address=$11, notes=$12, status=$13
     WHERE id=$14`,
    [
      payload.company_name,
      payload.contact_name,
      payload.email,
      payload.phone || null,
      packageName,
      payload.monthly_value || 0,
      payload.package_details || null,
      JSON.stringify(Array.isArray(payload.services) && payload.allow_services_update ? normalizeServices(payload.services, CLIENT_SERVICES) : (current.services || [])),
      payload.contract_start_date,
      contractEnd,
      payload.address || null,
      payload.notes || null,
      status,
      id,
    ]
  )
  const { rows } = await db.query('SELECT * FROM clients WHERE id = $1', [id])
  await addAuditLog(req.user.id, 'update_client', 'clients', id)
  res.json(rows[0])
})

app.get('/api/clients/:id/conversations', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid client id' })
  const { rows } = await db.query(
    `SELECT c.*, u.email AS created_by_email
     FROM client_conversations c
     LEFT JOIN users u ON c.created_by = u.id
     WHERE c.client_id = $1
     ORDER BY c.happened_at DESC, c.id DESC`,
    [id]
  )
  res.json(rows)
})

app.post('/api/clients/:id/conversations', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid client id' })
  const payload = req.body || {}
  if (!payload.summary) return res.status(400).json({ message: 'Summary is required' })
  const { rows } = await db.query(
    `INSERT INTO client_conversations (client_id, type, happened_at, summary, outcome, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      id,
      payload.type || 'other',
      payload.happened_at || new Date().toISOString(),
      payload.summary,
      payload.outcome || null,
      req.user.id,
    ]
  )
  await addAuditLog(req.user.id, 'create_client_conversation', 'client_conversations', rows[0]?.id)
  res.json(rows[0])
})

// Services (CRM)
app.get('/api/services', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const type = normalizeEnum(req.query.type, CLIENT_SERVICES, { defaultValue: null, allowNull: true })
  const clientId = Number.parseInt(req.query.client_id, 10) || null
  const search = String(req.query.search || '').trim()

  let sql = `SELECT s.*, c.company_name
             FROM services s
             JOIN clients c ON s.client_id = c.id
             WHERE 1=1`
  const params = []
  if (type) {
    params.push(type)
    sql += ` AND s.service_type = $${params.length}`
  }
  if (clientId) {
    params.push(clientId)
    sql += ` AND s.client_id = $${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND c.company_name ILIKE $${params.length}`
  }
  sql += ' ORDER BY s.created_at DESC'
  const { rows } = await db.query(sql, params)
  res.json(rows)
})

app.put('/api/services/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid service id' })
  const payload = req.body || {}
  const status = normalizeEnum(payload.status, SERVICE_STATUSES, { defaultValue: 'not_started' })
  if ((payload.status || '') && !status) return res.status(400).json({ message: 'Invalid service status' })
  const serviceType = normalizeEnum(payload.service_type, CLIENT_SERVICES, { defaultValue: null, allowNull: true })
  const platforms = normalizeServices(payload.platforms, SOCIAL_PLATFORMS)
  const assignedUsers = Array.isArray(payload.assigned_user_ids) ? payload.assigned_user_ids.map((v) => Number(v)).filter(Boolean) : []
  const progress = Math.min(100, Math.max(0, Number(payload.progress || 0)))

  const { rows: exists } = await db.query('SELECT id FROM services WHERE id = $1', [id])
  if (!exists.length) return res.status(404).json({ message: 'Service not found' })

  const { rows } = await db.query(
    `UPDATE services
     SET status=$1, assigned_user_ids=$2::jsonb, platforms=$3::jsonb, website_url=$4, progress=$5, notes=$6, updated_at=NOW()
     WHERE id=$7
     RETURNING *`,
    [
      status,
      JSON.stringify(assignedUsers),
      JSON.stringify(serviceType === 'social_media_management' ? platforms : []),
      serviceType === 'website_development' ? payload.website_url || null : null,
      serviceType === 'website_development' ? progress : 0,
      payload.notes || null,
      id,
    ]
  )
  await addAuditLog(req.user.id, 'update_service', 'services', id)
  res.json(rows[0])
})

// Tasks (CRM)
app.get('/api/tasks', authRequired, requireRole(['admin', 'hr', 'employee']), async (req, res) => {
  const statusTab = String(req.query.tab || 'active').trim().toLowerCase()
  const search = String(req.query.search || '').trim()
  const clientId = Number.parseInt(req.query.client_id, 10) || null
  const assignedTo = Number.parseInt(req.query.assigned_to, 10) || null
  const { limit, offset } = parsePagination(req.query, 10, 50)
  const today = new Date().toISOString().slice(0, 10)

  let sql = `SELECT t.*, c.company_name, s.service_type, u.email AS assigned_email
             FROM tasks t
             LEFT JOIN clients c ON t.client_id = c.id
             LEFT JOIN services s ON t.service_id = s.id
             LEFT JOIN users u ON t.assigned_to = u.id
             WHERE 1=1`
  const params = []
  if (req.user.role === 'employee') {
    params.push(req.user.id)
    sql += ` AND t.assigned_to = $${params.length}`
  }
  if (statusTab === 'active') sql += ` AND t.status IN ('pending','in_progress')`
  if (statusTab === 'completed') sql += ` AND t.status = 'completed'`
  if (statusTab === 'overdue') {
    params.push(today)
    sql += ` AND t.status IN ('pending','in_progress') AND t.due_date < $${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND t.title ILIKE $${params.length}`
  }
  if (clientId) {
    params.push(clientId)
    sql += ` AND t.client_id = $${params.length}`
  }
  if (assignedTo) {
    params.push(assignedTo)
    sql += ` AND t.assigned_to = $${params.length}`
  }
  const countSql = sql.replace('SELECT t.*, c.company_name, s.service_type, u.email AS assigned_email', 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/tasks', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const payload = req.body || {}
  if (!payload.title || !payload.assigned_to || !payload.due_date) {
    return res.status(400).json({ message: 'Task title, assigned user, and due date are required' })
  }
  const status = normalizeEnum(payload.status, TASK_STATUSES, { defaultValue: 'pending' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.status || '') && !status) return res.status(400).json({ message: 'Invalid task status' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid task priority' })
  const { rows } = await db.query(
    `INSERT INTO tasks
     (title, description, client_id, service_id, assigned_to, status, priority, due_date, is_automated, automation_rule_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      payload.title,
      payload.description || null,
      payload.client_id || null,
      payload.service_id || null,
      payload.assigned_to,
      status,
      priority,
      payload.due_date,
      Boolean(payload.is_automated),
      payload.automation_rule_id || null,
    ]
  )
  await createNotification({
    userId: payload.assigned_to,
    type: 'task_assigned',
    title: `New Task Assigned: ${payload.title}`,
    message: payload.description || null,
    targetTable: 'tasks',
    targetId: rows[0]?.id,
  })
  await addAuditLog(req.user.id, 'create_task', 'tasks', rows[0]?.id)
  res.json(rows[0])
})

app.put('/api/tasks/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const payload = req.body || {}
  if (!payload.title || !payload.assigned_to || !payload.due_date) {
    return res.status(400).json({ message: 'Task title, assigned user, and due date are required' })
  }
  const status = normalizeEnum(payload.status, TASK_STATUSES, { defaultValue: 'pending' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.status || '') && !status) return res.status(400).json({ message: 'Invalid task status' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid task priority' })
  const { rows } = await db.query(
    `UPDATE tasks
     SET title=$1, description=$2, client_id=$3, service_id=$4, assigned_to=$5, status=$6, priority=$7, due_date=$8, updated_at=NOW()
     WHERE id=$9
     RETURNING *`,
    [
      payload.title,
      payload.description || null,
      payload.client_id || null,
      payload.service_id || null,
      payload.assigned_to,
      status,
      priority,
      payload.due_date,
      id,
    ]
  )
  if (!rows.length) return res.status(404).json({ message: 'Task not found' })
  await addAuditLog(req.user.id, 'update_task', 'tasks', id)
  res.json(rows[0])
})

app.post('/api/tasks/:id/start', authRequired, requireRole(['admin', 'hr', 'employee']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const ownClause = req.user.role === 'employee' ? ' AND assigned_to = $2' : ''
  const params = req.user.role === 'employee' ? [id, req.user.id] : [id]
  const { rows } = await db.query(
    `UPDATE tasks SET status='in_progress', updated_at=NOW()
     WHERE id = $1${ownClause} AND status = 'pending'
     RETURNING *`,
    params
  )
  if (!rows.length) return res.status(400).json({ message: 'Task cannot be started' })
  await addAuditLog(req.user.id, 'start_task', 'tasks', id)
  res.json(rows[0])
})

app.post('/api/tasks/:id/complete', authRequired, uploadProof, requireRole(['admin', 'hr', 'employee']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const ownCheck = req.user.role === 'employee' ? ' AND assigned_to = $2' : ''
  const taskParams = req.user.role === 'employee' ? [id, req.user.id] : [id]
  const taskResult = await db.query(`SELECT * FROM tasks WHERE id = $1${ownCheck}`, taskParams)
  const task = taskResult.rows[0]
  if (!task) return res.status(404).json({ message: 'Task not found' })

  let proofName = task.proof_of_work_name
  let proofType = task.proof_of_work_type
  let proofData = task.proof_of_work_data
  if (req.file) {
    proofName = req.file.originalname
    proofType = req.file.mimetype
    proofData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
  }

  const { rows } = await db.query(
    `UPDATE tasks
     SET status='completed', completed_date=NOW(), completion_notes=$1,
         proof_of_work_name=$2, proof_of_work_type=$3, proof_of_work_data=$4, updated_at=NOW()
     WHERE id = $5
     RETURNING *`,
    [req.body?.completion_notes || null, proofName, proofType, proofData, id]
  )
  await createNotification({
    userId: task.assigned_to,
    type: 'task_completed',
    title: `Task Completed: ${task.title}`,
    message: req.body?.completion_notes || null,
    targetTable: 'tasks',
    targetId: id,
  })
  await addAuditLog(req.user.id, 'complete_task', 'tasks', id)
  res.json(rows[0])
})

app.post('/api/tasks/:id/cancel', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const { rows } = await db.query(
    `UPDATE tasks SET status='cancelled', updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Task not found' })
  await addAuditLog(req.user.id, 'cancel_task', 'tasks', id)
  res.json(rows[0])
})

app.get('/api/tasks/:id/proof', authRequired, requireRole(['admin', 'hr', 'employee']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const ownCheck = req.user.role === 'employee' ? ' AND assigned_to = $2' : ''
  const params = req.user.role === 'employee' ? [id, req.user.id] : [id]
  const { rows } = await db.query(
    `SELECT proof_of_work_name, proof_of_work_type, proof_of_work_data FROM tasks WHERE id = $1${ownCheck}`,
    params
  )
  const task = rows[0]
  if (!task) return res.status(404).json({ message: 'Task not found' })
  if (!task.proof_of_work_data) return res.status(404).json({ message: 'No proof uploaded' })
  const match = String(task.proof_of_work_data).match(/^data:(.+);base64,(.*)$/)
  if (!match) return res.status(400).json({ message: 'Invalid proof data' })
  res.setHeader('Content-Type', task.proof_of_work_type || match[1] || 'application/octet-stream')
  res.setHeader('Content-Disposition', 'inline')
  res.send(Buffer.from(match[2], 'base64'))
})

// Automation rules (CRM)
app.get('/api/automation-rules', authRequired, requireRole(['admin']), async (req, res) => {
  const clientId = Number.parseInt(req.query.client_id, 10) || null
  let sql = `SELECT r.*, c.company_name, u.email AS assigned_email, s.service_type
             FROM automation_rules r
             JOIN clients c ON r.client_id = c.id
             LEFT JOIN users u ON r.assigned_to = u.id
             LEFT JOIN services s ON r.service_id = s.id
             WHERE 1=1`
  const params = []
  if (clientId) {
    params.push(clientId)
    sql += ` AND r.client_id = $${params.length}`
  }
  sql += ' ORDER BY r.created_at DESC'
  const { rows } = await db.query(sql, params)
  res.json(rows)
})

app.post('/api/automation-rules', authRequired, requireRole(['admin']), async (req, res) => {
  const payload = req.body || {}
  if (!payload.rule_name || !payload.client_id || !payload.task_title_template || !payload.assigned_to) {
    return res.status(400).json({ message: 'Rule name, client, task title template, and assigned user are required' })
  }
  const schedule = normalizeEnum(payload.schedule_type, AUTOMATION_SCHEDULES, { defaultValue: 'daily' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.schedule_type || '') && !schedule) return res.status(400).json({ message: 'Invalid schedule type' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid priority' })
  const customDays = schedule === 'custom' ? normalizeDaysOfWeek(payload.custom_days) : []
  const { rows } = await db.query(
    `INSERT INTO automation_rules
     (rule_name, client_id, service_id, task_title_template, task_description_template, assigned_to, priority, schedule_type, custom_days, start_date, end_date, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
     RETURNING *`,
    [
      payload.rule_name,
      payload.client_id,
      payload.service_id || null,
      payload.task_title_template,
      payload.task_description_template || null,
      payload.assigned_to,
      priority,
      schedule,
      JSON.stringify(customDays),
      payload.start_date || null,
      payload.end_date || null,
      payload.is_active !== false,
    ]
  )
  await addAuditLog(req.user.id, 'create_automation_rule', 'automation_rules', rows[0]?.id)
  res.json(rows[0])
})

app.put('/api/automation-rules/:id', authRequired, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid rule id' })
  const payload = req.body || {}
  if (!payload.rule_name || !payload.client_id || !payload.task_title_template || !payload.assigned_to) {
    return res.status(400).json({ message: 'Rule name, client, task title template, and assigned user are required' })
  }
  const schedule = normalizeEnum(payload.schedule_type, AUTOMATION_SCHEDULES, { defaultValue: 'daily' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.schedule_type || '') && !schedule) return res.status(400).json({ message: 'Invalid schedule type' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid priority' })
  const customDays = schedule === 'custom' ? normalizeDaysOfWeek(payload.custom_days) : []
  const { rows } = await db.query(
    `UPDATE automation_rules
     SET rule_name=$1, client_id=$2, service_id=$3, task_title_template=$4, task_description_template=$5,
         assigned_to=$6, priority=$7, schedule_type=$8, custom_days=$9::jsonb, start_date=$10, end_date=$11,
         is_active=$12, updated_at=NOW()
     WHERE id=$13
     RETURNING *`,
    [
      payload.rule_name,
      payload.client_id,
      payload.service_id || null,
      payload.task_title_template,
      payload.task_description_template || null,
      payload.assigned_to,
      priority,
      schedule,
      JSON.stringify(customDays),
      payload.start_date || null,
      payload.end_date || null,
      payload.is_active !== false,
      id,
    ]
  )
  if (!rows.length) return res.status(404).json({ message: 'Rule not found' })
  await addAuditLog(req.user.id, 'update_automation_rule', 'automation_rules', id)
  res.json(rows[0])
})

app.post('/api/automation-rules/:id/toggle', authRequired, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid rule id' })
  const { rows } = await db.query('SELECT * FROM automation_rules WHERE id = $1', [id])
  const rule = rows[0]
  if (!rule) return res.status(404).json({ message: 'Rule not found' })
  if (isRuleExpired(rule)) return res.status(400).json({ message: 'Expired rule cannot be toggled' })
  const nextState = !rule.is_active
  const result = await db.query('UPDATE automation_rules SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [nextState, id])
  await addAuditLog(req.user.id, nextState ? 'activate_automation_rule' : 'pause_automation_rule', 'automation_rules', id)
  res.json(result.rows[0])
})

app.post('/api/automation-rules/:id/run-now', authRequired, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid rule id' })
  const { rows } = await db.query('SELECT * FROM automation_rules WHERE id = $1', [id])
  const rule = rows[0]
  if (!rule) return res.status(404).json({ message: 'Rule not found' })
  const dueDate = new Date().toISOString().slice(0, 10)
  const taskResult = await db.query(
    `INSERT INTO tasks
     (title, description, client_id, service_id, assigned_to, status, priority, due_date, is_automated, automation_rule_id)
     VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,TRUE,$8)
     RETURNING *`,
    [
      rule.task_title_template,
      rule.task_description_template || null,
      rule.client_id,
      rule.service_id || null,
      rule.assigned_to,
      rule.priority || 'medium',
      dueDate,
      id,
    ]
  )
  await createNotification({
    userId: rule.assigned_to,
    type: 'task_assigned',
    title: `New Task Assigned: ${rule.task_title_template}`,
    message: 'Created by automation rule.',
    targetTable: 'tasks',
    targetId: taskResult.rows[0]?.id,
  })
  await addAuditLog(req.user.id, 'run_automation_rule', 'automation_rules', id)
  res.json(taskResult.rows[0])
})

app.delete('/api/automation-rules/:id', authRequired, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid rule id' })
  const { rows } = await db.query('DELETE FROM automation_rules WHERE id = $1 RETURNING id', [id])
  if (!rows.length) return res.status(404).json({ message: 'Rule not found' })
  await addAuditLog(req.user.id, 'delete_automation_rule', 'automation_rules', id)
  res.json({ message: 'Rule deleted' })
})

// Notifications
app.get('/api/notifications', authRequired, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100)
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
  const unreadOnly = String(req.query.unread || '').toLowerCase() === 'true'
  const type = String(req.query.type || '').trim().toLowerCase()
  const params = [req.user.id]
  let where = 'WHERE user_id = $1'
  if (unreadOnly) where += ' AND is_read = FALSE'
  if (type) {
    params.push(type)
    where += ` AND type = $${params.length}`
  }

  const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM notifications ${where}`, params)
  params.push(limit)
  params.push(offset)
  const { rows } = await db.query(
    `SELECT *
     FROM notifications
     ${where}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    params
  )
  const unreadResult = await db.query(
    'SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  )
  res.json({
    items: rows,
    total: Number(countResult.rows[0]?.total || 0),
    unread_count: Number(unreadResult.rows[0]?.unread_count || 0),
    limit,
    offset,
  })
})

app.post('/api/notifications/:id/read', authRequired, async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid notification id' })
  const { rows } = await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, req.user.id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Notification not found' })
  res.json(rows[0])
})

app.post('/api/notifications/read-many', authRequired, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : []
  if (!ids.length) return res.status(400).json({ message: 'No notification ids provided' })

  const params = [req.user.id, ids]
  const { rows } = await db.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = $1
       AND id = ANY($2::int[])
     RETURNING id`,
    params
  )
  res.json({ updated: rows.length })
})

app.post('/api/notifications/read-all', authRequired, async (req, res) => {
  await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [req.user.id])
  res.json({ message: 'All notifications marked as read' })
})

app.post('/api/notifications/cleanup', authRequired, requireRole(['admin']), async (req, res) => {
  const days = Number(req.body?.days || 90)
  await cleanupOldNotifications(days)
  res.json({ message: `Read notifications older than ${Math.max(1, Number(days) || 90)} days were removed` })
})

// Leave types
app.get('/api/leave-types', authRequired, async (req, res) => {
  res.json(LEAVE_TYPES)
})

app.post('/api/leave-types', authRequired, requireRole(['admin']), async (req, res) => {
  res.status(405).json({ message: 'Leave types are fixed in system configuration' })
})

// Leave requests
app.get('/api/leave-requests', authRequired, async (req, res) => {
  const user = req.user
  const scope = String(req.query.scope || '').toLowerCase()
  if (scope === 'mine') {
    if (!user.employee_id) return res.json([])
    const { rows } = await db.query(
      `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
      [user.employee_id]
    )
    return res.json(rows)
  }
  if (user.role === 'employee') {
    const { rows } = await db.query(
      `SELECT * FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
      [user.employee_id]
    )
    return res.json(rows)
  }
  const { rows } = await db.query('SELECT * FROM leave_requests ORDER BY created_at DESC')
  res.json(rows)
})

app.post('/api/leave-requests', authRequired, uploadAttachment, async (req, res) => {
  const user = req.user
  const { leave_type_id, start_date, end_date, reason, leave_pay_type = 'auto' } = req.body || {}
  if (!leave_type_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  const empResult = await db.query('SELECT * FROM employees WHERE id = $1', [user.employee_id])
  const emp = empResult.rows[0]
  if (!emp) return res.status(400).json({ message: 'No employee linked' })
  if (emp.status === 'on_leave') return res.status(403).json({ message: 'Currently on leave' })

  const overlapResult = await db.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1 AND status IN ('pending','approved')
       AND start_date <= $2 AND end_date >= $3`,
    [user.employee_id, end_date, start_date]
  )
  if (overlapResult.rows.length) {
    return res.status(400).json({ message: 'Overlapping leave request exists' })
  }

  const leaveTypeName = resolveLeaveTypeName(leave_type_id)
  if (!leaveTypeName) {
    return res.status(400).json({ message: 'Invalid leave type' })
  }
  const compensation = resolveLeaveCompensation(emp, start_date, end_date, leave_pay_type)
  if (!compensation) return res.status(400).json({ message: 'Invalid leave date range' })
  if (compensation.insufficientCredits) {
    return res.status(400).json({ message: 'Insufficient leave credits for paid leave' })
  }
  let attachmentName = null
  let attachmentType = null
  let attachmentData = null
  if (req.file) {
    attachmentName = req.file.originalname
    attachmentType = req.file.mimetype
    attachmentData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
  }

  const { rows } = await db.query(
    `INSERT INTO leave_requests
     (employee_id, employee_code, employee_name, leave_type_name, start_date, end_date, reason, status, leave_pay_type, leave_days, credits_deducted, attachment_name, attachment_type, attachment_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      user.employee_id,
      emp.employee_code,
      `${emp.first_name} ${emp.last_name}`,
      leaveTypeName,
      start_date,
      end_date,
      reason,
      compensation.leavePayType,
      compensation.leaveDays,
      compensation.creditsDeducted,
      attachmentName,
      attachmentType,
      attachmentData,
    ]
  )

  const createdId = rows[0]?.id
  await notifyRoles(['admin', 'hr'], {
    type: 'leave_pending',
    title: 'New Leave Request',
    message: `${emp.first_name} ${emp.last_name} submitted a ${compensation.leavePayType} leave request.`,
    targetTable: 'leave_requests',
    targetId: createdId,
  })
  await addAuditLog(req.user.id, 'create_leave_request', 'leave_requests', createdId)
  const created = await db.query('SELECT * FROM leave_requests WHERE id = $1', [createdId])
  res.json(created.rows[0] || { id: createdId })
})

app.put('/api/leave-requests/:id', authRequired, uploadAttachment, async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
  const { rows } = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  const request = rows[0]
  if (!request) return res.status(404).json({ message: 'Leave request not found' })
  if (request.employee_id !== req.user.employee_id) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending requests can be edited' })
  }

  const { leave_type_id, start_date, end_date, reason, leave_pay_type = 'auto' } = req.body || {}
  if (!leave_type_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  const overlapResult = await db.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1 AND status IN ('pending','approved')
       AND start_date <= $2 AND end_date >= $3 AND id <> $4`,
    [req.user.employee_id, end_date, start_date, id]
  )
  if (overlapResult.rows.length) {
    return res.status(400).json({ message: 'Overlapping leave request exists' })
  }

  const leaveTypeName = resolveLeaveTypeName(leave_type_id)
  if (!leaveTypeName) {
    return res.status(400).json({ message: 'Invalid leave type' })
  }
  const empResult = await db.query('SELECT * FROM employees WHERE id = $1', [req.user.employee_id])
  const emp = empResult.rows[0]
  if (!emp) return res.status(400).json({ message: 'No employee linked' })
  const compensation = resolveLeaveCompensation(emp, start_date, end_date, leave_pay_type)
  if (!compensation) return res.status(400).json({ message: 'Invalid leave date range' })
  if (compensation.insufficientCredits) {
    return res.status(400).json({ message: 'Insufficient leave credits for paid leave' })
  }

  let attachmentName = request.attachment_name
  let attachmentType = request.attachment_type
  let attachmentData = request.attachment_data
  if (req.file) {
    attachmentName = req.file.originalname
    attachmentType = req.file.mimetype
    attachmentData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
  }

  await db.query(
    `UPDATE leave_requests
     SET leave_type_name=$1, start_date=$2, end_date=$3, reason=$4,
         leave_pay_type=$5, leave_days=$6, credits_deducted=$7,
         attachment_name=$8, attachment_type=$9, attachment_data=$10
     WHERE id=$11`,
    [
      leaveTypeName,
      start_date,
      end_date,
      reason,
      compensation.leavePayType,
      compensation.leaveDays,
      compensation.creditsDeducted,
      attachmentName,
      attachmentType,
      attachmentData,
      id,
    ]
  )

  await addAuditLog(req.user.id, 'update_leave_request', 'leave_requests', id)
  const updated = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  res.json(updated.rows[0] || { id })
})

app.post('/api/leave-requests/:id/approve', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
  const { rows } = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  const leaveRequest = rows[0]
  if (!leaveRequest) return res.status(404).json({ message: 'Leave request not found' })
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending requests can be approved' })
  }

  if (leaveRequest.leave_pay_type === 'paid') {
    const employeeResult = await db.query('SELECT leave_credits FROM employees WHERE id = $1', [leaveRequest.employee_id])
    const currentCredits = Number(employeeResult.rows[0]?.leave_credits || 0)
    const creditsToDeduct = Number(leaveRequest.credits_deducted || 0)
    if (creditsToDeduct > 0 && currentCredits < creditsToDeduct) {
      await db.query(
        "UPDATE leave_requests SET leave_pay_type='unpaid', credits_deducted=0 WHERE id=$1",
        [id]
      )
    }
  }

  await db.query(
    `UPDATE leave_requests
     SET status='approved', approved_by=$1, approved_by_name=$2, approved_by_role=$3
     WHERE id=$4`,
    [req.user.id, req.user.email, req.user.role, id]
  )

  const approvedResult = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  const approvedRequest = approvedResult.rows[0]
  const creditsToDeduct = Number(approvedRequest?.credits_deducted || 0)
  if (approvedRequest?.leave_pay_type === 'paid' && creditsToDeduct > 0) {
    await db.query(
      'UPDATE employees SET leave_credits = GREATEST(leave_credits - $1, 0), updated_at = NOW() WHERE id = $2',
      [creditsToDeduct, approvedRequest.employee_id]
    )
  }

  const ownerUserRows = await db.query('SELECT id FROM users WHERE employee_id = $1 ORDER BY id ASC LIMIT 1', [
    approvedRequest?.employee_id,
  ])
  await createNotification({
    userId: ownerUserRows.rows[0]?.id,
    type: 'leave_approved',
    title: 'Leave Approved',
    message: `Your ${approvedRequest?.leave_type_name || 'leave'} request has been approved.`,
    targetTable: 'leave_requests',
    targetId: id,
  })

  const employeeId = approvedRequest?.employee_id
  await updateEmployeeStatus(employeeId)
  await addAuditLog(req.user.id, 'approve_leave_request', 'leave_requests', id)
  const updated = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  res.json(updated.rows[0] || { id })
})

app.post('/api/leave-requests/:id/reject', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = req.params.id
  const { comment = '' } = req.body || {}
  await db.query(
    `UPDATE leave_requests SET status='rejected', approved_by=$1, approved_by_name=$2, approved_by_role=$3, rejection_comment=$4 WHERE id=$5`,
    [req.user.id, req.user.email, req.user.role, comment, id]
  )
  const employeeRows = await db.query('SELECT employee_id FROM leave_requests WHERE id = $1', [id])
  const employeeId = employeeRows.rows[0]?.employee_id
  const ownerUserRows = await db.query('SELECT id FROM users WHERE employee_id = $1 ORDER BY id ASC LIMIT 1', [employeeId])
  await createNotification({
    userId: ownerUserRows.rows[0]?.id,
    type: 'leave_rejected',
    title: 'Leave Rejected',
    message: comment || 'Your leave request was rejected.',
    targetTable: 'leave_requests',
    targetId: id,
  })
  await updateEmployeeStatus(employeeId)
  await addAuditLog(req.user.id, 'reject_leave_request', 'leave_requests', id)
  const updated = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  res.json(updated.rows[0] || { id })
})

app.post('/api/leave-requests/:id/cancel', authRequired, async (req, res) => {
  const id = req.params.id
  const { rows } = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  const request = rows[0]
  if (!request) return res.status(404).json({ message: 'Leave request not found' })
  if (request.employee_id !== req.user.employee_id) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending requests can be cancelled' })
  }
  await db.query('DELETE FROM leave_requests WHERE id = $1', [id])
  await addAuditLog(req.user.id, 'delete_leave_request', 'leave_requests', id)
  res.json({ message: 'Leave request deleted' })
})

app.get('/api/leave-requests/:id/attachment', authRequired, async (req, res) => {
  const id = req.params.id
  const { rows } = await db.query(
    'SELECT employee_id, attachment_type, attachment_data FROM leave_requests WHERE id = $1',
    [id]
  )
  const request = rows[0]
  if (!request) return res.status(404).json({ message: 'Leave request not found' })
  const isOwner = request.employee_id && request.employee_id === req.user.employee_id
  const isPrivileged = ['admin', 'hr'].includes(req.user.role)
  if (!isOwner && !isPrivileged) return res.status(403).json({ message: 'Forbidden' })
  if (!request.attachment_data) return res.status(404).json({ message: 'No attachment' })

  const match = String(request.attachment_data).match(/^data:(.+);base64,(.*)$/)
  if (!match) return res.status(400).json({ message: 'Invalid attachment data' })
  const mime = request.attachment_type || match[1] || 'application/octet-stream'
  const buffer = Buffer.from(match[2], 'base64')
  res.setHeader('Content-Type', mime)
  res.setHeader('Content-Disposition', 'inline')
  res.send(buffer)
})

// Reports
app.get('/api/reports/leave', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const { from, to } = req.query
  let sql = 'SELECT * FROM leave_requests WHERE 1=1'
  const params = []
  if (from) {
    params.push(from)
    sql += ` AND start_date >= $${params.length}`
  }
  if (to) {
    params.push(to)
    sql += ` AND start_date <= $${params.length}`
  }
  sql += ' ORDER BY start_date DESC'
  const { rows } = await db.query(sql, params)
  res.json(rows)
})

app.get('/api/reports/leave.xlsx', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const { from, to } = req.query
  let sql = 'SELECT * FROM leave_requests WHERE 1=1'
  const params = []
  if (from) {
    params.push(from)
    sql += ` AND start_date >= $${params.length}`
  }
  if (to) {
    params.push(to)
    sql += ` AND start_date <= $${params.length}`
  }
  sql += ' ORDER BY start_date DESC'
  const { rows } = await db.query(sql, params)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Leave Report')
  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 28 },
    { header: 'Leave type', key: 'type', width: 20 },
    { header: 'Pay type', key: 'pay_type', width: 14 },
    { header: 'Reason', key: 'reason', width: 40 },
    { header: 'Days', key: 'days', width: 10 },
  ]

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  })

  rows.forEach((r) => {
    const days =
      Number(r.leave_days) ||
      (r.start_date && r.end_date
        ? Math.max(
            1,
            Math.ceil((new Date(r.end_date) - new Date(r.start_date)) / (24 * 60 * 60 * 1000)) + 1
          )
        : '')
    sheet.addRow({
      employee: r.employee_name || r.employee_id || '',
      type: r.leave_type_name || r.leave_type_id || '',
      pay_type: r.leave_pay_type || 'unpaid',
      reason: r.reason || '',
      days,
    })
  })

  const filename = `leave-report-${from || 'from'}-to-${to || 'to'}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
  res.end()
})

// Payroll
// Audit logs
app.get('/api/audit-logs', authRequired, requireRole(['admin']), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50)
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0)
  const { rows } = await db.query(
    `SELECT a.*, u.email, e.first_name, e.last_name,
            te.first_name AS target_employee_first_name,
            te.last_name AS target_employee_last_name,
            tu.email AS target_user_email,
            tlr.employee_name AS target_leave_employee_name,
            tlr.leave_type_name AS target_leave_type_name
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN employees e ON u.employee_id = e.id
     LEFT JOIN employees te ON a.target_table = 'employees' AND a.target_id = te.id
     LEFT JOIN users tu ON a.target_table = 'users' AND a.target_id = tu.id
     LEFT JOIN leave_requests tlr ON a.target_table = 'leave_requests' AND a.target_id = tlr.id
     ORDER BY a.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  res.json(rows)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on port ${PORT}`)
  ensureSchemaColumns()
  cleanupOldNotifications().catch((err) => console.error('Notification cleanup failed', err))
  setInterval(() => {
    cleanupOldNotifications().catch((err) => console.error('Notification cleanup failed', err))
  }, 24 * 60 * 60 * 1000)
})
