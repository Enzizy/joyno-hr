const express = require('express')
const bcrypt = require('bcryptjs')
const { MANAGEMENT_ROLES } = require('../constants/roles')

const CREATABLE_ROLES = new Set(['employee', ...MANAGEMENT_ROLES])

function createUserRouter({ db, authRequired, requireRole, addAuditLog }) {
  const router = express.Router()

  router.get('/api/users', authRequired, requireRole(MANAGEMENT_ROLES), async (_req, res) => {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, u.employee_id, e.employee_code, e.first_name, e.last_name, e.department
       FROM users u
       LEFT JOIN employees e ON u.employee_id = e.id
       ORDER BY u.id DESC`
    )
    res.json(rows)
  })

  router.post('/api/users', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const { email, password, role = 'employee', employee_id: employeeIdInput = null } = req.body || {}
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
    if (!CREATABLE_ROLES.has(role)) return res.status(400).json({ message: 'Invalid role' })
    const employeeId = Number(employeeIdInput)
    if (!Number.isSafeInteger(employeeId) || employeeId < 1) {
      return res.status(400).json({ message: 'A valid employee link is required' })
    }
    const employeeExists = await db.query('SELECT id FROM employees WHERE id = $1', [employeeId])
    if (!employeeExists.rows.length) return res.status(404).json({ message: 'Employee not found' })
    const alreadyLinked = await db.query('SELECT id FROM users WHERE employee_id = $1 LIMIT 1', [employeeId])
    if (alreadyLinked.rows.length) return res.status(409).json({ message: 'Selected employee already has an account' })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash, role, employee_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [email, hash, role, employeeId]
    )
    const createdId = rows[0]?.id
    await addAuditLog(req.user.id, 'create_user', 'users', createdId)
    return res.json({ message: 'User created' })
  })

  router.delete('/api/users/:id', authRequired, requireRole(MANAGEMENT_ROLES), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid user id' })
    if (id === req.user.id) return res.status(400).json({ message: 'Cannot delete your own account' })
    const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [id])
    if (!rows.length) return res.status(404).json({ message: 'User not found' })
    const reassignedTasks = await db.query('UPDATE tasks SET assigned_to = $1 WHERE assigned_to = $2', [req.user.id, id])
    const reassignedRules = await db.query('UPDATE automation_rules SET assigned_to = $1 WHERE assigned_to = $2', [req.user.id, id])
    await db.query('DELETE FROM users WHERE id = $1', [id])
    await addAuditLog(req.user.id, 'delete_user', 'users', id)
    return res.json({
      message: 'User deleted',
      reassigned: {
        tasks: reassignedTasks.rowCount || 0,
        automation_rules: reassignedRules.rowCount || 0,
      },
    })
  })

  return router
}

module.exports = { createUserRouter }
