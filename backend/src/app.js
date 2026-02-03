require('dotenv').config()
const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const db = require('./db')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'change-me'

app.use(cors({ origin: true }))
app.use(express.json())

// ----- Auth middleware -----
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    const token = auth.slice(7)
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId
    req.userRole = decoded.role
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

// ----- Seed admin (run once if no users) -----
async function seedAdminIfNeeded() {
  try {
    const [rows] = await db.query('SELECT id FROM users LIMIT 1')
    if (rows.length > 0) return
    const hash = await bcrypt.hash('admin123', 10)
    await db.query(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      ['admin@example.com', hash, 'admin']
    )
    console.log('Seeded admin user: admin@example.com / admin123')
  } catch (err) {
    console.warn('Seed admin skipped:', err.message)
  }
}

// ----- Auth routes -----
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' })
    }
    const [users] = await db.query(
      'SELECT id, email, password, role, employee_id FROM users WHERE email = ? LIMIT 1',
      [email]
    )
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
    const user = users[0]
    const match = await bcrypt.compare(password, user.password)
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )
    const [withEmployee] = await db.query(
      'SELECT e.first_name, e.last_name FROM employees e WHERE e.id = ?',
      [user.employee_id]
    )
    const emp = withEmployee[0]
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id,
        first_name: emp?.first_name,
        last_name: emp?.last_name,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, email, role, employee_id FROM users WHERE id = ? LIMIT 1',
      [req.userId]
    )
    if (users.length === 0) {
      return res.status(401).json({ message: 'User not found' })
    }
    const user = users[0]
    let first_name = null
    let last_name = null
    if (user.employee_id) {
      const [emp] = await db.query(
        'SELECT first_name, last_name FROM employees WHERE id = ?',
        [user.employee_id]
      )
      if (emp[0]) {
        first_name = emp[0].first_name
        last_name = emp[0].last_name
      }
    }
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      first_name,
      last_name,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' })
    }
    const [users] = await db.query('SELECT id, password FROM users WHERE id = ? LIMIT 1', [req.userId])
    if (users.length === 0) return res.status(401).json({ message: 'User not found' })
    const match = await bcrypt.compare(currentPassword, users[0].password)
    if (!match) return res.status(401).json({ message: 'Current password is incorrect' })
    const hash = await bcrypt.hash(newPassword, 10)
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hash, req.userId])
    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ----- Employees -----
app.get('/api/employees', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, employee_code, first_name, last_name, department, position, salary_type, salary_amount, date_hired, status FROM employees ORDER BY id DESC'
    )
    res.json({ rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/employees/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM employees WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/employees', authMiddleware, async (req, res) => {
  try {
    const b = req.body
    await db.query(
      'INSERT INTO employees (employee_code, first_name, last_name, department, position, salary_type, salary_amount, date_hired, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        b.employee_code,
        b.first_name,
        b.last_name,
        b.department,
        b.position,
        b.salary_type || 'monthly',
        b.salary_amount,
        b.date_hired,
        b.status || 'active',
      ]
    )
    const [rows] = await db.query('SELECT * FROM employees ORDER BY id DESC LIMIT 1')
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error' })
  }
})

app.put('/api/employees/:id', authMiddleware, async (req, res) => {
  try {
    const b = req.body
    await db.query(
      'UPDATE employees SET employee_code=?, first_name=?, last_name=?, department=?, position=?, salary_type=?, salary_amount=?, date_hired=?, status=? WHERE id=?',
      [
        b.employee_code,
        b.first_name,
        b.last_name,
        b.department,
        b.position,
        b.salary_type,
        b.salary_amount,
        b.date_hired,
        b.status,
        req.params.id,
      ]
    )
    const [rows] = await db.query('SELECT * FROM employees WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.delete('/api/employees/:id', authMiddleware, async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM employees WHERE id = ?', [req.params.id])
    if (r.affectedRows === 0) return res.status(404).json({ message: 'Not found' })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ----- Leave types -----
app.get('/api/leave/types', authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM leave_types ORDER BY name')
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/leave/balances/me', authMiddleware, async (req, res) => {
  try {
    const [u] = await db.query('SELECT employee_id FROM users WHERE id = ?', [req.userId])
    const employeeId = u[0]?.employee_id
    if (!employeeId) return res.json([])
    const [rows] = await db.query(
      'SELECT lb.*, lt.name AS leave_type_name FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ?',
      [employeeId]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/leave/balances/:employeeId', authMiddleware, async (req, res) => {
  try {
    const employeeId = req.params.employeeId
    const [rows] = await db.query(
      'SELECT lb.*, lt.name AS leave_type_name FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ?',
      [employeeId]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.get('/api/leave/requests', authMiddleware, async (req, res) => {
  try {
    let sql = `
      SELECT lr.*, e.first_name AS emp_first_name, e.last_name AS emp_last_name,
             lt.name AS leave_type_name
      FROM leave_requests lr
      LEFT JOIN employees e ON e.id = lr.employee_id
      LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE 1=1
    `
    const params = []
    if (req.userRole === 'employee') {
      const [u] = await db.query('SELECT employee_id FROM users WHERE id = ?', [req.userId])
      const eid = u[0]?.employee_id
      if (eid) { sql += ' AND lr.employee_id = ?'; params.push(eid) }
    }
    sql += ' ORDER BY lr.id DESC'
    const [rows] = await db.query(sql, params)
    const list = rows.map((r) => ({
      ...r,
      employee: r.emp_first_name != null ? { first_name: r.emp_first_name, last_name: r.emp_last_name } : null,
      leave_type: r.leave_type_name ? { name: r.leave_type_name } : null,
    }))
    res.json({ rows: list })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/leave/requests', authMiddleware, async (req, res) => {
  try {
    const [u] = await db.query('SELECT employee_id FROM users WHERE id = ?', [req.userId])
    const employeeId = u[0]?.employee_id
    if (!employeeId) return res.status(403).json({ message: 'No employee linked to your account' })
    const b = req.body
    const reason = (b.reason || '').trim()
    if (!reason) return res.status(400).json({ message: 'Leave reason is required' })
    await db.query(
      'INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
      [employeeId, b.leave_type_id, b.start_date, b.end_date, reason, 'pending']
    )
    const [rows] = await db.query('SELECT * FROM leave_requests ORDER BY id DESC LIMIT 1')
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/leave/requests/:id/approve', authMiddleware, async (req, res) => {
  try {
    await db.query('UPDATE leave_requests SET status = ?, approved_by = ? WHERE id = ?', ['approved', req.userId, req.params.id])
    const [rows] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.put('/api/leave/requests/:id/reject', authMiddleware, async (req, res) => {
  try {
    const comment = (req.body?.comment ?? req.body?.rejection_comment ?? '').trim()
    if (!comment) return res.status(400).json({ message: 'Rejection comment is required' })
    await db.query(
      'UPDATE leave_requests SET status = ?, approved_by = ?, rejection_comment = ? WHERE id = ?',
      ['rejected', req.userId, comment, req.params.id]
    )
    const [rows] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [req.params.id])
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ----- Users (admin) -----
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') return res.status(403).json({ message: 'Admin only' })
    const [rows] = await db.query('SELECT id, email, role, employee_id, created_at FROM users ORDER BY id')
    res.json({ rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

app.post('/api/users', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') return res.status(403).json({ message: 'Admin only' })
    const { email, password, role, employee_id } = req.body || {}
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
    const validRoles = ['admin', 'hr', 'employee']
    if (!validRoles.includes(role)) return res.status(400).json({ message: 'Role must be admin, hr, or employee' })
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length > 0) return res.status(400).json({ message: 'Email already in use' })
    const hash = await bcrypt.hash(password, 10)
    await db.query(
      'INSERT INTO users (email, password, role, employee_id) VALUES (?, ?, ?, ?)',
      [email, hash, role, employee_id || null]
    )
    const [rows] = await db.query('SELECT id, email, role, employee_id, created_at FROM users ORDER BY id DESC LIMIT 1')
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error' })
  }
})

// ----- Audit logs -----
app.get('/api/audit-logs', authMiddleware, async (req, res) => {
  try {
    if (req.userRole !== 'admin') return res.status(403).json({ message: 'Admin only' })
    const [rows] = await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200')
    res.json({ rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ----- Reports -----
app.get('/api/reports/leave', authMiddleware, async (req, res) => {
  try {
    const { from, to } = req.query
    let sql = 'SELECT lr.employee_id, lr.start_date, lr.end_date, lr.status, lt.name AS leave_type_name, e.first_name, e.last_name FROM leave_requests lr LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id LEFT JOIN employees e ON e.id = lr.employee_id WHERE 1=1'
    const params = []
    if (from) { sql += ' AND lr.start_date >= ?'; params.push(from) }
    if (to) { sql += ' AND lr.end_date <= ?'; params.push(to) }
    sql += ' ORDER BY lr.start_date DESC'
    const [rows] = await db.query(sql, params)
    const list = rows.map((r) => {
      const start = new Date(r.start_date)
      const end = new Date(r.end_date)
      const days = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1)
      return {
        employee_id: r.employee_id,
        employee_name: r.first_name ? `${r.first_name} ${r.last_name}` : r.employee_id,
        leave_type_id: r.leave_type_name,
        leave_type_name: r.leave_type_name,
        days,
      }
    })
    res.json({ rows: list })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ----- Seed leave types if empty -----
async function seedLeaveTypesIfNeeded() {
  try {
    const [rows] = await db.query('SELECT id FROM leave_types LIMIT 1')
    if (rows.length > 0) return
    await db.query(
      "INSERT INTO leave_types (name, default_credits) VALUES ('Sick Leave', 10), ('Vacation Leave', 15), ('Emergency Leave', 5)"
    )
    console.log('Seeded leave types.')
  } catch (err) {
    console.warn('Seed leave types skipped:', err.message)
  }
}

// ----- Start -----
seedAdminIfNeeded()
  .then(() => seedLeaveTypesIfNeeded())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HR System API running at http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('DB connection failed. Check .env and XAMPP MySQL.', err.message)
    process.exit(1)
  })
