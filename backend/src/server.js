require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const db = require('./db')
const { addAuditLog, updateEmployeeStatus } = require('./helpers')

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

app.use(helmet())
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
    `SELECT u.id, u.email, u.role, u.employee_id, e.employee_code, e.first_name, e.last_name, e.status
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE u.id = $1`,
    [userId]
  )
  return rows[0] || null
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
  const { rows } = await db.query(
    `INSERT INTO employees
     (employee_code, first_name, last_name, department, position, salary_type, salary_amount, date_hired, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.salary_type || 'monthly',
      e.salary_amount || 0,
      e.date_hired,
      e.status || 'active',
    ]
  )
  const createdId = rows[0]?.id
  await addAuditLog(req.user.id, 'create_employee', 'employees', createdId)
  const created = await db.query('SELECT * FROM employees WHERE id = $1', [createdId])
  res.json(created.rows[0] || { id: createdId })
})

app.put('/api/employees/:id', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const e = req.body || {}
  await db.query(
    `UPDATE employees
     SET employee_code=$1, first_name=$2, last_name=$3, department=$4, position=$5, salary_type=$6, salary_amount=$7, date_hired=$8, status=$9
     WHERE id=$10`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.salary_type || 'monthly',
      e.salary_amount || 0,
      e.date_hired,
      e.status || 'active',
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

// Leave types
app.get('/api/leave-types', authRequired, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM leave_types ORDER BY name ASC')
  res.json(rows)
})

app.post('/api/leave-types', authRequired, requireRole(['admin']), async (req, res) => {
  const { name, default_credits = 0 } = req.body || {}
  const { rows } = await db.query(
    'INSERT INTO leave_types (name, default_credits) VALUES ($1,$2) RETURNING id',
    [name, default_credits]
  )
  await addAuditLog(req.user.id, 'create_leave_type', 'leave_types', rows[0]?.id)
  res.json({ message: 'Leave type created' })
})

// Leave requests
app.get('/api/leave-requests', authRequired, async (req, res) => {
  const user = req.user
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

app.post('/api/leave-requests', authRequired, async (req, res) => {
  const user = req.user
  const { leave_type_id, start_date, end_date, reason } = req.body || {}
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

  const ltResult = await db.query('SELECT * FROM leave_types WHERE id = $1', [leave_type_id])
  const lt = ltResult.rows[0]
  const { rows } = await db.query(
    `INSERT INTO leave_requests
     (employee_id, employee_code, employee_name, leave_type_id, leave_type_name, start_date, end_date, reason, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
     RETURNING id`,
    [
      user.employee_id,
      emp.employee_code,
      `${emp.first_name} ${emp.last_name}`,
      leave_type_id,
      lt?.name || null,
      start_date,
      end_date,
      reason,
    ]
  )

  const createdId = rows[0]?.id
  await addAuditLog(req.user.id, 'create_leave_request', 'leave_requests', createdId)
  const created = await db.query('SELECT * FROM leave_requests WHERE id = $1', [createdId])
  res.json(created.rows[0] || { id: createdId })
})

app.post('/api/leave-requests/:id/approve', authRequired, requireRole(['admin', 'hr']), async (req, res) => {
  const id = req.params.id
  await db.query(
    `UPDATE leave_requests SET status='approved', approved_by=$1, approved_by_name=$2, approved_by_role=$3 WHERE id=$4`,
    [req.user.id, req.user.email, req.user.role, id]
  )
  const employeeRows = await db.query('SELECT employee_id FROM leave_requests WHERE id = $1', [id])
  const employeeId = employeeRows.rows[0]?.employee_id
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
  await updateEmployeeStatus(employeeId)
  await addAuditLog(req.user.id, 'reject_leave_request', 'leave_requests', id)
  const updated = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id])
  res.json(updated.rows[0] || { id })
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

// Audit logs
app.get('/api/audit-logs', authRequired, requireRole(['admin']), async (req, res) => {
  const { rows } = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200')
  res.json(rows)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on port ${PORT}`)
})
