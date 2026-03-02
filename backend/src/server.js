require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const multer = require('multer')
const ExcelJS = require('exceljs')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const db = require('./db')
const { runMigrations } = require('./migrate')
const { addAuditLog, updateEmployeeStatus, syncAllEmployeeStatuses } = require('./helpers')
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
const DEFAULT_LEAVE_CREDITS = 15
let dbReady = false
let backgroundJobsStarted = false

const USER_AUTH_COLUMNS = 'id, email, password_hash, role, employee_id, created_at'
const EMPLOYEE_COLUMNS =
  'id, employee_code, first_name, last_name, department, position, shift, leave_credits, date_hired, status, created_at, updated_at'
const LEAD_COLUMNS =
  'id, company_name, contact_name, email, phone, source, status, interested_services, estimated_value, next_follow_up, notes, converted_client_id, created_at'
const CLIENT_COLUMNS =
  'id, lead_id, company_name, contact_name, email, phone, package_name, monthly_value, package_details, services, contract_start_date, contract_end_date, address, notes, status, created_at'
const LEAVE_REQUEST_COLUMNS =
  'id, employee_id, employee_code, employee_name, leave_type_id, leave_type_name, start_date, end_date, reason, status, approved_by, approved_by_name, approved_by_role, rejection_comment, leave_pay_type, leave_days, paid_days, unpaid_days, credits_deducted, attachment_name, attachment_type, attachment_data, created_at'
const NOTIFICATION_COLUMNS =
  'id, user_id, type, title, message, target_table, target_id, is_read, created_at'

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
const SMTP_USER = (process.env.SMTP_USER || '').trim()
const SMTP_PASS = (process.env.SMTP_PASS || '').trim()
const SMTP_FROM = (process.env.SMTP_FROM || SMTP_USER || '').trim()
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim()
const BREVO_FROM_EMAIL = (process.env.BREVO_FROM_EMAIL || '').trim()
const BREVO_FROM_NAME = (process.env.BREVO_FROM_NAME || '').trim()
const MAIL_APP_NAME = (process.env.MAIL_APP_NAME || BREVO_FROM_NAME || 'Joyno Admin').trim()
const PRIMARY_FRONTEND_ORIGIN = FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)[0]
const EMAIL_LOGO_URL = (
  process.env.EMAIL_LOGO_URL ||
  (PRIMARY_FRONTEND_ORIGIN ? `${PRIMARY_FRONTEND_ORIGIN}/joynomedia-logo.png` : 'https://joyno-hr.pages.dev/joynomedia-logo.png')
).trim()
let mailTransport = null

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildBrandedEmailHtml({ subject, text }) {
  const appName = MAIL_APP_NAME
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const body = lines
    .map((line) => `<p style="margin:0 0 10px;color:#1f2937;font-size:14px;line-height:1.55;">${escapeHtml(line)}</p>`)
    .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:18px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:top;">
                      <div style="font-size:18px;font-weight:700;color:#fbbf24;letter-spacing:0.2px;">${appName}</div>
                      <div style="margin-top:4px;font-size:12px;color:#9ca3af;">Employee & Operations Notification</div>
                    </td>
                    <td align="right" style="vertical-align:top;">
                      ${
                        EMAIL_LOGO_URL
                          ? `<img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="${appName} Logo" width="36" style="display:block;opacity:.45;max-width:36px;height:auto;" />`
                          : ''
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px;">
                <h2 style="margin:0 0 14px;color:#111827;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h2>
                ${body || '<p style="margin:0;color:#374151;font-size:14px;">No details provided.</p>'}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 22px;border-top:1px solid #e5e7eb;background:#f9fafb;">
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                  This is an automated message from ${appName}. Please do not reply directly.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function formatEmailDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatEmailDateRange(start, end) {
  if (!start && !end) return '-'
  return `${formatEmailDate(start)} - ${formatEmailDate(end)}`
}

function normalizeAssignedIds(value, fallbackAssignedTo = null) {
  const base = Array.isArray(value) ? value : []
  const ids = base.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  const fallback = Number(fallbackAssignedTo)
  if (Number.isInteger(fallback) && fallback > 0) ids.push(fallback)
  return [...new Set(ids)]
}

function getMailTransport() {
  if (!SMTP_USER || !SMTP_PASS) return null
  if (mailTransport) return mailTransport
  const service = (process.env.SMTP_SERVICE || 'gmail').trim()
  const host = (process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 0)
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true'
  const config = {
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  }
  if (host) {
    config.host = host
    if (port > 0) config.port = port
    config.secure = secure
  } else {
    config.service = service
  }
  config.connectionTimeout = 4000
  config.greetingTimeout = 4000
  config.socketTimeout = 6000
  mailTransport = nodemailer.createTransport(config)
  return mailTransport
}

function sendEmailNotification({ to, subject, text, html = null }) {
  if (!to || !subject || !text) return
  const finalHtml = html || buildBrandedEmailHtml({ subject, text })
  setImmediate(async () => {
    try {
      if (BREVO_API_KEY && BREVO_FROM_EMAIL) {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              email: BREVO_FROM_EMAIL,
              ...(BREVO_FROM_NAME ? { name: BREVO_FROM_NAME } : {}),
            },
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: finalHtml,
          }),
        })
        if (!response.ok) {
          const errText = await response.text()
          throw new Error(`Brevo API error ${response.status}: ${errText}`)
        }
        return
      }

      const transport = getMailTransport()
      if (!transport || !SMTP_FROM) return
      await transport.sendMail({
        from: SMTP_FROM,
        to,
        subject,
        text,
        html: finalHtml,
      })
    } catch (error) {
      console.error('Email notification failed:', error.message || error)
    }
  })
}

async function getUserContactById(userId) {
  if (!userId) return null
  const { rows } = await db.query(
    `SELECT u.id, u.email, e.first_name, e.last_name
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  )
  const user = rows[0]
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
  }
}

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

async function notificationExists(userId, type, targetTable, targetId) {
  if (!userId || !type) return false
  const { rows } = await db.query(
    `SELECT 1
     FROM notifications
     WHERE user_id = $1
       AND type = $2
       AND COALESCE(target_table, '') = COALESCE($3, '')
       AND COALESCE(target_id, 0) = COALESCE($4, 0)
     LIMIT 1`,
    [userId, type, targetTable || null, targetId || null]
  )
  return rows.length > 0
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

async function runApprovalSlaEscalations() {
  const pendingLeaveResult = await db.query(
    `SELECT id, employee_name, created_at
     FROM leave_requests
     WHERE status = 'pending'`
  )
  const reviewerRows = await db.query("SELECT id FROM users WHERE role IN ('admin','hr','ceo')")
  const reviewerIds = reviewerRows.rows.map((row) => row.id)
  const now = Date.now()
  for (const leave of pendingLeaveResult.rows) {
    const hoursPending = (now - new Date(leave.created_at).getTime()) / (1000 * 60 * 60)
    const level = hoursPending >= 48 ? 48 : hoursPending >= 24 ? 24 : 0
    if (!level) continue
    const type = level === 48 ? 'leave_sla_48h' : 'leave_sla_24h'
    const title = level === 48 ? 'Leave Approval Escalation (48h)' : 'Leave Approval Reminder (24h)'
    const message = `${leave.employee_name || 'Employee'} leave request is pending for ${level}+ hours.`
    for (const reviewerId of reviewerIds) {
      const exists = await notificationExists(reviewerId, type, 'leave_requests', leave.id)
      if (!exists) {
        await createNotification({
          userId: reviewerId,
          type,
          title,
          message,
          targetTable: 'leave_requests',
          targetId: leave.id,
        })
      }
    }
  }

  const pendingTaskResult = await db.query(
    `SELECT id, title, due_date, assigned_to
     FROM tasks
     WHERE status = 'pending'`
  )
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const task of pendingTaskResult.rows) {
    if (!task.due_date) continue
    const due = new Date(task.due_date)
    due.setHours(0, 0, 0, 0)
    const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24))
    const level = daysOverdue >= 2 ? '48h' : daysOverdue >= 1 ? '24h' : null
    if (!level) continue
    const assigneeId = task.assigned_to
    const type = level === '48h' ? 'task_sla_48h' : 'task_sla_24h'
    const title = level === '48h' ? 'Task Escalation (48h overdue)' : 'Task Reminder (24h overdue)'
    const message = `${task.title} is overdue by ${level === '48h' ? '2+ days' : '1+ day'}.`
    if (assigneeId) {
      const existsForAssignee = await notificationExists(assigneeId, type, 'tasks', task.id)
      if (!existsForAssignee) {
        await createNotification({
          userId: assigneeId,
          type,
          title,
          message,
          targetTable: 'tasks',
          targetId: task.id,
        })
      }
    }
    for (const reviewerId of reviewerIds) {
      const existsForReviewer = await notificationExists(reviewerId, type, 'tasks', task.id)
      if (!existsForReviewer) {
        await createNotification({
          userId: reviewerId,
          type,
          title,
          message,
          targetTable: 'tasks',
          targetId: task.id,
        })
      }
    }
  }
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
  {
    id: 'vacation_leave',
    name: 'Vacation Leave',
    paid_days_per_year: 3,
    min_months_employed: 6,
    remarks: 'Annual grant and usage are subject to company approval.',
    aliases: ['vacation'],
  },
  {
    id: 'sick_leave',
    name: 'Sick Leave',
    paid_days_per_year: 5,
    min_months_employed: 12,
    requires_attachment_for_paid: true,
    remarks: 'Requires a valid medical certificate.',
    aliases: ['sick'],
  },
  {
    id: 'bereavement_leave',
    name: 'Bereavement Leave',
    paid_days_per_year: 2,
    min_months_employed: 12,
    requires_attachment_for_paid: true,
    remarks:
      'Granted in the event of death of an immediate family member. Supporting documents are required.',
    aliases: ['bereavement'],
  },
  {
    id: 'service_incentive_leave',
    name: 'Service Incentive Leave',
    paid_days_per_year: 5,
    min_months_employed: 12,
    remarks: 'Convertible to cash if unused, based on company policy and labor laws.',
    aliases: ['sil', 'service incentive'],
  },
  {
    id: 'leave_of_absence',
    name: 'Leave of Absence',
    paid_days_per_year: 0,
    min_months_employed: 0,
    aliases: [],
  },
  { id: 'awol', name: 'Absent Without Official Leave', paid_days_per_year: 0, min_months_employed: 0, aliases: [] },
  {
    id: 'emergency_leave',
    name: 'Emergency Leave',
    paid_days_per_year: 0,
    min_months_employed: 0,
    aliases: ['emergency'],
  },
]

function resolveLeaveType(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const found = LEAVE_TYPES.find(
    (item) =>
      item.id.toLowerCase() === raw.toLowerCase() ||
      item.name.toLowerCase() === raw.toLowerCase() ||
      item.aliases.some((alias) => alias.toLowerCase() === raw.toLowerCase())
  )
  return found || null
}

async function ensureSchemaColumns() {
  // Kept for backward compatibility; schema updates now run via migrations.
}

function currentCreditYear() {
  return new Date().getFullYear()
}

async function resetEmployeeLeaveCreditsIfNeeded(employeeId) {
  const id = Number(employeeId)
  if (!id) return
  const year = currentCreditYear()
  await db.query(
    `UPDATE employees
     SET leave_credits = CASE
           WHEN date_hired IS NULL THEN 0
           WHEN (
             DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
             DATE_PART('month', AGE(CURRENT_DATE, date_hired))
           ) >= 12 THEN 15
           WHEN (
             DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
             DATE_PART('month', AGE(CURRENT_DATE, date_hired))
           ) >= 6 THEN 3
           ELSE 0
         END,
         leave_credits_reset_year = $1,
         updated_at = NOW()
     WHERE id = $2
       AND COALESCE(leave_credits_reset_year, 0) < $1`,
    [year, id]
  )
}

async function resetAllEmployeeLeaveCreditsIfNeeded() {
  const year = currentCreditYear()
  await db.query(
    `UPDATE employees
     SET leave_credits = CASE
           WHEN date_hired IS NULL THEN 0
           WHEN (
             DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
             DATE_PART('month', AGE(CURRENT_DATE, date_hired))
           ) >= 12 THEN 15
           WHEN (
             DATE_PART('year', AGE(CURRENT_DATE, date_hired)) * 12 +
             DATE_PART('month', AGE(CURRENT_DATE, date_hired))
           ) >= 6 THEN 3
           ELSE 0
         END,
         leave_credits_reset_year = $1,
         updated_at = NOW()
     WHERE COALESCE(leave_credits_reset_year, 0) < $1`,
    [year]
  )
}

function calculateLeaveDays(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (end < start) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end - start) / msPerDay) + 1
}

function isPaidLeaveEligible(dateHired, leaveStartDate, minMonths = 0) {
  if (!dateHired || !leaveStartDate) return false
  const hired = new Date(dateHired)
  const leaveStart = new Date(leaveStartDate)
  if (Number.isNaN(hired.getTime()) || Number.isNaN(leaveStart.getTime())) return false
  const minDate = new Date(hired)
  minDate.setMonth(minDate.getMonth() + Number(minMonths || 0))
  return leaveStart >= minDate
}

async function resolveLeaveCompensation(employee, leaveType, startDate, endDate, hasMedicalAttachment = false) {
  const leaveDays = calculateLeaveDays(startDate, endDate)
  if (!leaveDays || leaveDays <= 0) return null

  const paidDaysCap = Number(leaveType?.paid_days_per_year || 0)
  if (!leaveType || paidDaysCap <= 0) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `${leaveType?.name || 'This leave type'} is unpaid by policy.`,
    }
  }

  const eligible = isPaidLeaveEligible(employee?.date_hired, startDate, leaveType.min_months_employed || 0)
  if (!eligible) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `Paid ${leaveType.name} requires at least ${Number(leaveType.min_months_employed || 0)} month(s) of service.`,
    }
  }
  if (leaveType.requires_attachment_for_paid && !hasMedicalAttachment) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `${leaveType.name} paid leave requires a supporting document. Without attachment, this request is unpaid.`,
    }
  }

  const leaveYear = new Date(startDate).getFullYear()
  const usedDays = await getApprovedPaidLeaveDays(employee?.id, leaveType.name, leaveYear)
  const remainingTypePaidDays = Math.max(0, paidDaysCap - usedDays)
  const availableCredits = Math.max(0, Number(employee?.leave_credits || 0))
  const payableDays = Math.min(leaveDays, remainingTypePaidDays, availableCredits)
  const unpaidDays = Math.max(0, leaveDays - payableDays)

  if (payableDays <= 0) {
    return {
      leaveDays,
      paidDays: 0,
      unpaidDays: leaveDays,
      leavePayType: 'unpaid',
      creditsDeducted: 0,
      note: `No paid days available. ${leaveType.name} yearly paid limit is already used or credits are insufficient.`,
    }
  }
  if (leaveDays <= payableDays) {
    return {
      leaveDays,
      paidDays: leaveDays,
      unpaidDays: 0,
      leavePayType: 'paid',
      creditsDeducted: leaveDays,
      note: `All ${leaveDays} day(s) are paid.`,
    }
  }

  return {
    leaveDays,
    paidDays: payableDays,
    unpaidDays,
    leavePayType: 'partial_paid',
    creditsDeducted: payableDays,
    note: `${payableDays} day(s) paid and ${unpaidDays} day(s) unpaid based on ${leaveType.name} limits and available credits.`,
  }
}

async function getApprovedPaidLeaveDays(employeeId, leaveTypeName, year, excludeRequestId = null) {
  const params = [employeeId, leaveTypeName, String(year)]
  let sql = `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN leave_pay_type IN ('paid','partial_paid') THEN COALESCE(credits_deducted, leave_days, 0)
            ELSE 0
          END
        ),
        0
      )::numeric AS used_days
    FROM leave_requests
    WHERE employee_id = $1
      AND status = 'approved'
      AND leave_type_name = $2
      AND EXTRACT(YEAR FROM start_date) = $3::int
  `
  if (excludeRequestId) {
    params.push(excludeRequestId)
    sql += ` AND id <> $${params.length}`
  }
  const { rows } = await db.query(sql, params)
  return Number(rows[0]?.used_days || 0)
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

async function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Unauthorized' })
  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Invalid token' })
  }
  req.user = decoded
  if (req.user?.employee_id) {
    try {
      await resetEmployeeLeaveCreditsIfNeeded(req.user.employee_id)
    } catch (err) {
      console.error('Failed to run leave credit reset check', err)
    }
  }
  return next()
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
    `SELECT
      u.id,
      u.email,
      u.role,
      u.employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      CASE
        WHEN e.status = 'resigned' THEN e.status
        WHEN EXISTS (
          SELECT 1
          FROM leave_requests lr
          WHERE lr.employee_id = e.id
            AND lr.status = 'approved'
            AND lr.start_date <= CURRENT_DATE
            AND CURRENT_DATE <= lr.end_date
            AND LOWER(COALESCE(lr.leave_type_name, '')) IN ('absent without official leave', 'awol')
        ) THEN 'inactive'
        WHEN EXISTS (
          SELECT 1
          FROM leave_requests lr
          WHERE lr.employee_id = e.id
            AND lr.status = 'approved'
            AND lr.start_date <= CURRENT_DATE
            AND CURRENT_DATE <= lr.end_date
        ) THEN 'on_leave'
        ELSE 'active'
      END AS status,
      e.department,
      e.shift,
      e.leave_credits,
      e.date_hired
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
  if (!dbReady) {
    return res.status(503).json({ status: 'starting', database: 'disconnected' })
  }
  return res.json({ status: 'ok', database: 'connected' })
})

// Auth
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
  const { rows } = await db.query(`SELECT ${USER_AUTH_COLUMNS} FROM users WHERE email = $1`, [email])
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
  const { rows } = await db.query(`SELECT ${USER_AUTH_COLUMNS} FROM users WHERE id = $1`, [req.user.id])
  const user = rows[0]
  if (!user) return res.status(404).json({ message: 'User not found' })
  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) return res.status(400).json({ message: 'Current password is incorrect' })
  const hash = await bcrypt.hash(newPassword, 10)
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id])
  res.json({ message: 'Password updated' })
})

// Users (Admin)
app.get('/api/users', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.role, u.employee_id, e.employee_code, e.first_name, e.last_name, e.department
     FROM users u
     LEFT JOIN employees e ON u.employee_id = e.id
     ORDER BY u.id DESC`
  )
  res.json(rows)
})

app.post('/api/users', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const { email, password, role = 'employee', employee_id = null } = req.body || {}
  const allowedRoles = new Set(['employee', 'hr', 'admin'])
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' })
  if (!allowedRoles.has(role)) return res.status(400).json({ message: 'Invalid role' })
  if (!employee_id) return res.status(400).json({ message: 'Employee link is required' })
  const employeeId = Number(employee_id)
  if (!employeeId) return res.status(400).json({ message: 'Invalid employee id' })
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
  res.json({ message: 'User created' })
})

app.delete('/api/users/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid user id' })
  if (id === req.user.id) return res.status(400).json({ message: 'Cannot delete your own account' })
  const { rows } = await db.query('SELECT id FROM users WHERE id = $1', [id])
  if (!rows.length) return res.status(404).json({ message: 'User not found' })
  const reassignedTasks = await db.query('UPDATE tasks SET assigned_to = $1 WHERE assigned_to = $2', [req.user.id, id])
  const reassignedRules = await db.query('UPDATE automation_rules SET assigned_to = $1 WHERE assigned_to = $2', [
    req.user.id,
    id,
  ])
  await db.query('DELETE FROM users WHERE id = $1', [id])
  await addAuditLog(req.user.id, 'delete_user', 'users', id)
  res.json({
    message: 'User deleted',
    reassigned: {
      tasks: reassignedTasks.rowCount || 0,
      automation_rules: reassignedRules.rowCount || 0,
    },
  })
})

// Employees
app.get('/api/employees', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  await resetAllEmployeeLeaveCreditsIfNeeded()
  await syncAllEmployeeStatuses()
  const { rows } = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees ORDER BY created_at DESC`)
  res.json(rows)
})

app.get('/api/employees/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  await resetEmployeeLeaveCreditsIfNeeded(req.params.id)
  await syncAllEmployeeStatuses()
  const { rows } = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [req.params.id])
  if (!rows.length) return res.status(404).json({ message: 'Employee not found' })
  res.json(rows[0])
})

app.post('/api/employees', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const e = req.body || {}
  const leaveCreditsInput = Number(e.leave_credits)
  const hasLeaveCreditsInput = Number.isFinite(leaveCreditsInput) && leaveCreditsInput >= 0
  const dateHired = e.date_hired ? new Date(e.date_hired) : null
  const tenureMonths =
    dateHired && !Number.isNaN(dateHired.getTime())
      ? (new Date().getFullYear() - dateHired.getFullYear()) * 12 + (new Date().getMonth() - dateHired.getMonth())
      : 0
  const defaultCreditsByTenure = tenureMonths >= 12 ? 15 : tenureMonths >= 6 ? 3 : 0
  const leaveCredits = hasLeaveCreditsInput ? leaveCreditsInput : defaultCreditsByTenure
  const resetYear = currentCreditYear()
  const { rows } = await db.query(
    `INSERT INTO employees
     (employee_code, first_name, last_name, department, position, shift, leave_credits, leave_credits_reset_year, date_hired, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.shift || 'day',
      Number.isFinite(leaveCredits) && leaveCredits >= 0 ? leaveCredits : defaultCreditsByTenure,
      resetYear,
      e.date_hired,
      e.status || 'active',
    ]
  )
  const createdId = rows[0]?.id
  await addAuditLog(req.user.id, 'create_employee', 'employees', createdId)
  const created = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [createdId])
  res.json(created.rows[0] || { id: createdId })
})

app.put('/api/employees/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const e = req.body || {}
  const leaveCredits = Number(e.leave_credits)
  const safeLeaveCredits = Number.isFinite(leaveCredits) && leaveCredits >= 0 ? leaveCredits : DEFAULT_LEAVE_CREDITS
  const resetYear = currentCreditYear()
  await db.query(
    `UPDATE employees
     SET employee_code=$1, first_name=$2, last_name=$3, department=$4, position=$5, shift=$6,
         leave_credits=$7, leave_credits_reset_year=$8, date_hired=$9, status=$10
     WHERE id=$11`,
    [
      e.employee_code,
      e.first_name,
      e.last_name,
      e.department,
      e.position,
      e.shift || 'day',
      safeLeaveCredits,
      resetYear,
      e.date_hired,
      e.status || 'active',
      req.params.id,
    ]
  )
  await addAuditLog(req.user.id, 'update_employee', 'employees', req.params.id)
  const updated = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [req.params.id])
  res.json(updated.rows[0] || { id: Number(req.params.id) })
})

app.delete('/api/employees/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  await db.query('DELETE FROM employees WHERE id = $1', [req.params.id])
  await addAuditLog(req.user.id, 'delete_employee', 'employees', req.params.id)
  res.json({ message: 'Employee deleted' })
})

app.post('/api/employees/:id/awol', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  const { start_date, end_date, reason } = req.body || {}
  if (!id) return res.status(400).json({ message: 'Invalid employee id' })
  if (!start_date || !end_date) return res.status(400).json({ message: 'Start date and end date are required' })
  const leaveDays = calculateLeaveDays(start_date, end_date)
  if (!leaveDays) return res.status(400).json({ message: 'Invalid date range' })

  const employeeResult = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [id])
  const employee = employeeResult.rows[0]
  if (!employee) return res.status(404).json({ message: 'Employee not found' })

  const overlapResult = await db.query(
    `SELECT id FROM leave_requests
     WHERE employee_id = $1 AND status IN ('pending','approved')
       AND start_date <= $2 AND end_date >= $3`,
    [id, end_date, start_date]
  )
  if (overlapResult.rows.length) {
    return res.status(400).json({ message: 'Overlapping leave request exists' })
  }

  const inserted = await db.query(
    `INSERT INTO leave_requests
     (employee_id, employee_code, employee_name, leave_type_name, start_date, end_date, reason, status, leave_pay_type, leave_days, credits_deducted, approved_by, approved_by_name, approved_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'approved','unpaid',$8,0,$9,$10,$11)
     RETURNING id`,
    [
      id,
      employee.employee_code,
      `${employee.first_name} ${employee.last_name}`,
      'Absent Without Official Leave',
      start_date,
      end_date,
      reason || 'AWOL set by admin/hr',
      leaveDays,
      req.user.id,
      req.user.email,
      req.user.role,
    ]
  )
  const leaveId = inserted.rows[0]?.id
  await updateEmployeeStatus(id)
  await addAuditLog(req.user.id, 'set_employee_awol', 'leave_requests', leaveId)
  res.json({ message: 'Employee marked as AWOL', leave_request_id: leaveId })
})

app.get('/api/dashboard/overview', authRequired, async (req, res) => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const todayISO = `${yyyy}-${mm}-${dd}`
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const nextWeekISO = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`

  if (req.user.role === 'employee') {
    const dueToday = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM tasks
       WHERE assigned_to = $1 AND due_date = $2 AND status IN ('pending','in_progress')`,
      [req.user.id, todayISO]
    )
    const overdue = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM tasks
       WHERE assigned_to = $1 AND due_date < $2 AND status IN ('pending','in_progress')`,
      [req.user.id, todayISO]
    )
    const upcoming = await db.query(
      `SELECT t.id, t.title, t.due_date, t.priority, t.status, c.company_name
       FROM tasks t
       LEFT JOIN clients c ON t.client_id = c.id
       WHERE t.assigned_to = $1
         AND t.due_date BETWEEN $2 AND $3
         AND t.status IN ('pending','in_progress')
       ORDER BY t.due_date ASC
       LIMIT 8`,
      [req.user.id, todayISO, nextWeekISO]
    )
    const creditsResult = await db.query('SELECT leave_credits FROM employees WHERE id = $1', [req.user.employee_id])
    const leaveCredits = Number(creditsResult.rows[0]?.leave_credits || 0)
    return res.json({
      role: req.user.role,
      metrics: {
        tasks_due_today: Number(dueToday.rows[0]?.count || 0),
        overdue_tasks: Number(overdue.rows[0]?.count || 0),
        leave_credits: leaveCredits,
        upcoming_deadlines: upcoming.rows.length,
      },
      upcoming_tasks: upcoming.rows,
    })
  }

  const activeClients = await db.query("SELECT COUNT(*)::int AS count FROM clients WHERE status = 'active'")
  const pendingApprovals = await db.query("SELECT COUNT(*)::int AS count FROM leave_requests WHERE status = 'pending'")
  const overdueTasks = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM tasks
     WHERE due_date < $1 AND status IN ('pending','in_progress')`,
    [todayISO]
  )
  const pendingLeadFollowUps = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM leads
     WHERE status NOT IN ('converted','lost')
       AND next_follow_up IS NOT NULL
       AND next_follow_up <= $1`,
    [todayISO]
  )
  const pendingLeaves = await db.query(
    `SELECT id, employee_name, start_date, end_date, leave_type_name, created_at
     FROM leave_requests
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 6`
  )
  const overdueTaskItems = await db.query(
    `SELECT t.id, t.title, t.due_date, t.priority, u.email AS assigned_email, c.company_name
     FROM tasks t
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN clients c ON t.client_id = c.id
     WHERE t.due_date < $1 AND t.status IN ('pending','in_progress')
     ORDER BY t.due_date ASC
     LIMIT 6`,
    [todayISO]
  )
  const leadFollowUps = await db.query(
    `SELECT id, company_name, contact_name, next_follow_up, status
     FROM leads
     WHERE status NOT IN ('converted','lost')
       AND next_follow_up IS NOT NULL
       AND next_follow_up <= $1
     ORDER BY next_follow_up ASC
     LIMIT 6`,
    [todayISO]
  )

  res.json({
    role: req.user.role,
    metrics: {
      active_clients: Number(activeClients.rows[0]?.count || 0),
      approvals_backlog: Number(pendingApprovals.rows[0]?.count || 0),
      overdue_tasks: Number(overdueTasks.rows[0]?.count || 0),
      pending_leads_follow_up: Number(pendingLeadFollowUps.rows[0]?.count || 0),
    },
    pending_leave_requests: pendingLeaves.rows,
    overdue_tasks_list: overdueTaskItems.rows,
    lead_follow_ups: leadFollowUps.rows,
  })
})

// Leads (CRM)
app.get('/api/leads', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const status = normalizeEnum(req.query.status, LEAD_STATUSES, { defaultValue: null, allowNull: true })
  const source = normalizeEnum(req.query.source, LEAD_SOURCES, { defaultValue: null, allowNull: true })
  const search = String(req.query.search || '').trim()
  const { limit, offset } = parsePagination(req.query, 10, 50)
  let sql = `SELECT ${LEAD_COLUMNS} FROM leads WHERE 1=1`
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
  const countSql = sql.replace(`SELECT ${LEAD_COLUMNS}`, 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/leads', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.put('/api/leads/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.delete('/api/leads/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const { rows } = await db.query('DELETE FROM leads WHERE id = $1 RETURNING id', [id])
  if (!rows.length) return res.status(404).json({ message: 'Lead not found' })
  await addAuditLog(req.user.id, 'delete_lead', 'leads', id)
  res.json({ message: 'Lead deleted' })
})

app.get('/api/leads/:id/conversations', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.post('/api/leads/:id/conversations', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.post('/api/leads/:id/convert', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid lead id' })
  const payload = req.body || {}
  const { rows } = await db.query(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = $1`, [id])
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
app.get('/api/clients', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const status = normalizeEnum(req.query.status, CLIENT_STATUSES, { defaultValue: null, allowNull: true })
  const search = String(req.query.search || '').trim()
  const { limit, offset } = parsePagination(req.query, 10, 50)
  let sql = `SELECT ${CLIENT_COLUMNS} FROM clients WHERE 1=1`
  const params = []
  if (status) {
    params.push(status)
    sql += ` AND status = $${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    sql += ` AND (company_name ILIKE $${params.length} OR contact_name ILIKE $${params.length} OR email ILIKE $${params.length})`
  }
  const countSql = sql.replace(`SELECT ${CLIENT_COLUMNS}`, 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/clients', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.put('/api/clients/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid client id' })
  const payload = req.body || {}
  if (!payload.company_name || !payload.contact_name || !payload.email || !payload.contract_start_date) {
    return res.status(400).json({ message: 'Company, contact, email, and contract start date are required' })
  }
  const currentResult = await db.query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = $1`, [id])
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
  const { rows } = await db.query(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id = $1`, [id])
  await addAuditLog(req.user.id, 'update_client', 'clients', id)
  res.json(rows[0])
})

app.get('/api/clients/:id/conversations', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.post('/api/clients/:id/conversations', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
app.get('/api/services', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.put('/api/services/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
    sql += ` AND (
      t.assigned_to = $${params.length}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(t.assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
        WHERE assignee.user_id::int = $${params.length}
      )
    )`
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
    sql += ` AND (
      t.assigned_to = $${params.length}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(t.assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
        WHERE assignee.user_id::int = $${params.length}
      )
    )`
  }
  const countSql = sql.replace('SELECT t.*, c.company_name, s.service_type, u.email AS assigned_email', 'SELECT COUNT(*)::int AS total')
  const countResult = await db.query(countSql, params)
  params.push(limit)
  params.push(offset)
  sql += ` ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await db.query(sql, params)
  res.json({ items: rows, total: Number(countResult.rows[0]?.total || 0), limit, offset })
})

app.post('/api/tasks', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const payload = req.body || {}
  const department = String(payload.assign_department || '').trim()
  const assignedIds = Array.isArray(payload.assigned_to_ids)
    ? payload.assigned_to_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : payload.assigned_to
    ? [Number(payload.assigned_to)].filter((id) => Number.isInteger(id) && id > 0)
    : []
  if (department) {
    const deptUsers = await db.query(
      `SELECT u.id
       FROM users u
       INNER JOIN employees e ON e.id = u.employee_id
       WHERE e.department = $1`,
      [department]
    )
    for (const row of deptUsers.rows) {
      const userId = Number(row.id)
      if (Number.isInteger(userId) && userId > 0) assignedIds.push(userId)
    }
  }
  const uniqueAssignedIds = [...new Set(assignedIds)]
  if (!payload.title || !uniqueAssignedIds.length || !payload.due_date) {
    return res.status(400).json({ message: 'Task title, assigned user(s), and due date are required' })
  }
  const status = normalizeEnum(payload.status, TASK_STATUSES, { defaultValue: 'pending' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.status || '') && !status) return res.status(400).json({ message: 'Invalid task status' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid task priority' })
  const { rows } = await db.query(
    `INSERT INTO tasks
     (title, description, client_id, service_id, assigned_to, assigned_to_ids, status, priority, due_date, is_automated, automation_rule_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      payload.title,
      payload.description || null,
      payload.client_id || null,
      payload.service_id || null,
      uniqueAssignedIds[0],
      JSON.stringify(uniqueAssignedIds),
      status,
      priority,
      payload.due_date,
      Boolean(payload.is_automated),
      payload.automation_rule_id || null,
    ]
  )
  const created = rows[0]
  for (const assignedToId of uniqueAssignedIds) {
    await createNotification({
      userId: assignedToId,
      type: 'task_assigned',
      title: `New Task Assigned: ${payload.title}`,
      message: payload.description || null,
      targetTable: 'tasks',
      targetId: created.id,
    })
    const assignee = await getUserContactById(assignedToId)
    await sendEmailNotification({
      to: assignee?.email,
      subject: `Task Assigned: ${payload.title}`,
      text: [
        `Hi ${assignee?.name || 'Employee'},`,
        '',
        `A new task has been assigned to you.`,
        `Title: ${payload.title}`,
        `Due date: ${payload.due_date}`,
        `Priority: ${priority}`,
        payload.description ? `Details: ${payload.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  }
  await addAuditLog(req.user.id, 'create_task', 'tasks', created.id)
  res.json(created)
})

app.put('/api/tasks/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const payload = req.body || {}
  const currentTaskRows = await db.query('SELECT id, assigned_to, title FROM tasks WHERE id = $1 LIMIT 1', [id])
  const currentTask = currentTaskRows.rows[0]
  if (!currentTask) return res.status(404).json({ message: 'Task not found' })
  if (!payload.title || !payload.assigned_to || !payload.due_date) {
    return res.status(400).json({ message: 'Task title, assigned user, and due date are required' })
  }
  const status = normalizeEnum(payload.status, TASK_STATUSES, { defaultValue: 'pending' })
  const priority = normalizeEnum(payload.priority, TASK_PRIORITIES, { defaultValue: 'medium' })
  if ((payload.status || '') && !status) return res.status(400).json({ message: 'Invalid task status' })
  if ((payload.priority || '') && !priority) return res.status(400).json({ message: 'Invalid task priority' })
  const { rows } = await db.query(
    `UPDATE tasks
     SET title=$1, description=$2, client_id=$3, service_id=$4, assigned_to=$5, assigned_to_ids=$6::jsonb, status=$7, priority=$8, due_date=$9, updated_at=NOW()
     WHERE id=$10
     RETURNING *`,
    [
      payload.title,
      payload.description || null,
      payload.client_id || null,
      payload.service_id || null,
      payload.assigned_to,
      JSON.stringify([Number(payload.assigned_to)]),
      status,
      priority,
      payload.due_date,
      id,
    ]
  )
  if (!rows.length) return res.status(404).json({ message: 'Task not found' })
  if (Number(currentTask.assigned_to) !== Number(payload.assigned_to)) {
    await createNotification({
      userId: payload.assigned_to,
      type: 'task_assigned',
      title: `Task Assigned: ${payload.title}`,
      message: payload.description || null,
      targetTable: 'tasks',
      targetId: id,
    })
    const assignee = await getUserContactById(payload.assigned_to)
    await sendEmailNotification({
      to: assignee?.email,
      subject: `Task Assigned: ${payload.title}`,
      text: [
        `Hi ${assignee?.name || 'Employee'},`,
        '',
        `A task has been assigned to you.`,
        `Title: ${payload.title}`,
        `Due date: ${payload.due_date}`,
        `Priority: ${priority}`,
        payload.description ? `Details: ${payload.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    })
  }
  await addAuditLog(req.user.id, 'update_task', 'tasks', id)
  res.json(rows[0])
})

app.post('/api/tasks/:id/start', authRequired, requireRole(['admin', 'hr', 'employee']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid task id' })
  const ownClause =
    req.user.role === 'employee'
      ? ` AND (
          assigned_to = $2
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
            WHERE assignee.user_id::int = $2
          )
        )`
      : ''
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
  const ownCheck =
    req.user.role === 'employee'
      ? ` AND (
          assigned_to = $2
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
            WHERE assignee.user_id::int = $2
          )
        )`
      : ''
  const taskParams = req.user.role === 'employee' ? [id, req.user.id] : [id]
  const taskResult = await db.query(
    `SELECT id, title, assigned_to, proof_of_work_name, proof_of_work_type, proof_of_work_data
     FROM tasks
     WHERE id = $1${ownCheck}`,
    taskParams
  )
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

app.post('/api/tasks/:id/cancel', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
  const ownCheck =
    req.user.role === 'employee'
      ? ` AND (
          assigned_to = $2
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(assigned_to_ids, '[]'::jsonb)) AS assignee(user_id)
            WHERE assignee.user_id::int = $2
          )
        )`
      : ''
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
app.get('/api/automation-rules', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const clientId = Number.parseInt(req.query.client_id, 10) || null
  let sql = `SELECT r.*, c.company_name, u.email AS assigned_email, s.service_type,
                    EXISTS (
                      SELECT 1
                      FROM tasks t
                      WHERE t.automation_rule_id = r.id
                        AND t.status IN ('pending', 'in_progress')
                    ) AS has_open_task
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

app.post('/api/automation-rules', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.put('/api/automation-rules/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.post('/api/automation-rules/:id/toggle', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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

app.post('/api/automation-rules/:id/run-now', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid rule id' })
  const { rows } = await db.query('SELECT * FROM automation_rules WHERE id = $1', [id])
  const rule = rows[0]
  if (!rule) return res.status(404).json({ message: 'Rule not found' })
  const openTaskRows = await db.query(
    `SELECT id
     FROM tasks
     WHERE automation_rule_id = $1
       AND status IN ('pending', 'in_progress')
     ORDER BY created_at DESC
     LIMIT 1`,
    [id]
  )
  if (openTaskRows.rows.length) {
    return res.status(409).json({ message: 'This automation already has a running task. Complete or cancel it first.' })
  }
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
  const assignee = await getUserContactById(rule.assigned_to)
  await sendEmailNotification({
    to: assignee?.email,
    subject: `Task Assigned: ${rule.task_title_template}`,
    text: [
      `Hi ${assignee?.name || 'Employee'},`,
      '',
      'A new automated task has been assigned to you.',
      `Title: ${rule.task_title_template}`,
      `Due date: ${dueDate}`,
      `Priority: ${rule.priority || 'medium'}`,
      rule.task_description_template ? `Details: ${rule.task_description_template}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  })
  await addAuditLog(req.user.id, 'run_automation_rule', 'automation_rules', id)
  res.json(taskResult.rows[0])
})

app.delete('/api/automation-rules/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
    `SELECT ${NOTIFICATION_COLUMNS}
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

app.delete('/api/notifications/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid notification id' })
  const { rows } = await db.query(
    `DELETE FROM notifications
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read`,
    [id, req.user.id]
  )
  if (!rows.length) return res.status(404).json({ message: 'Notification not found' })
  res.json({ id: rows[0].id, is_read: rows[0].is_read })
})

app.post('/api/notifications/delete-many', authRequired, async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : []
  if (!ids.length) return res.status(400).json({ message: 'No notification ids provided' })

  const { rows } = await db.query(
    `DELETE FROM notifications
     WHERE user_id = $1
       AND id = ANY($2::int[])
     RETURNING id, is_read`,
    [req.user.id, ids]
  )
  const unreadDeleted = rows.filter((row) => !row.is_read).length
  res.json({ deleted: rows.length, unreadDeleted })
})

app.post('/api/notifications/cleanup', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const days = Number(req.body?.days || 90)
  await cleanupOldNotifications(days)
  res.json({ message: `Read notifications older than ${Math.max(1, Number(days) || 90)} days were removed` })
})

// Leave types
app.get('/api/leave-types', authRequired, async (req, res) => {
  res.json(
    LEAVE_TYPES.filter((type) => type.id !== 'awol').map(
      ({ id, name, paid_days_per_year, min_months_employed, requires_attachment_for_paid, remarks }) => ({
      id,
      name,
      paid_days_per_year,
      min_months_employed: Number(min_months_employed || 0),
      requires_attachment_for_paid: Boolean(requires_attachment_for_paid),
      remarks: remarks || '',
      })
    )
  )
})

app.post('/api/leave-types', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  res.status(405).json({ message: 'Leave types are fixed in system configuration' })
})

// Leave requests
app.get('/api/leave-requests', authRequired, async (req, res) => {
  const user = req.user
  const scope = String(req.query.scope || '').toLowerCase()
  if (scope === 'mine') {
    if (!user.employee_id) return res.json([])
    const { rows } = await db.query(
      `SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
      [user.employee_id]
    )
    return res.json(rows)
  }
  if (user.role === 'employee') {
    const { rows } = await db.query(
      `SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
      [user.employee_id]
    )
    return res.json(rows)
  }
  const { rows } = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests ORDER BY created_at DESC`)
  res.json(rows)
})

app.post('/api/leave-requests', authRequired, uploadAttachment, async (req, res) => {
  const user = req.user
  const { leave_type_id, start_date, end_date, reason } = req.body || {}
  if (!leave_type_id || !start_date || !end_date || !reason) {
    return res.status(400).json({ message: 'Missing required fields' })
  }

  await resetEmployeeLeaveCreditsIfNeeded(user.employee_id)
  const empResult = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [user.employee_id])
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

  const leaveType = resolveLeaveType(leave_type_id)
  if (!leaveType) {
    return res.status(400).json({ message: 'Invalid leave type' })
  }
  if (leaveType.id === 'awol') {
    return res.status(403).json({ message: 'AWOL can only be set by admin/hr from employee management' })
  }
  let attachmentName = null
  let attachmentType = null
  let attachmentData = null
  if (req.file) {
    attachmentName = req.file.originalname
    attachmentType = req.file.mimetype
    attachmentData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
  }
  const compensation = await resolveLeaveCompensation(
    emp,
    leaveType,
    start_date,
    end_date,
    Boolean(attachmentData)
  )
  if (!compensation) return res.status(400).json({ message: 'Invalid leave date range' })

  const { rows } = await db.query(
    `INSERT INTO leave_requests
     (employee_id, employee_code, employee_name, leave_type_name, start_date, end_date, reason, status, leave_pay_type, leave_days, paid_days, unpaid_days, credits_deducted, attachment_name, attachment_type, attachment_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      user.employee_id,
      emp.employee_code,
     `${emp.first_name} ${emp.last_name}`,
      leaveType.name,
      start_date,
      end_date,
      reason,
      compensation.leavePayType,
      compensation.leaveDays,
      compensation.paidDays,
      compensation.unpaidDays,
      compensation.creditsDeducted,
      attachmentName,
      attachmentType,
      attachmentData,
    ]
  )

  const createdId = rows[0]?.id
  await notifyRoles(['admin', 'hr', 'ceo'], {
    type: 'leave_pending',
    title: 'New Leave Request',
    message: `${emp.first_name} ${emp.last_name} submitted a ${compensation.leavePayType} leave request.`,
    targetTable: 'leave_requests',
    targetId: createdId,
  })
  const approverEmailResult = await db.query(
    `SELECT DISTINCT u.email
     FROM users u
     WHERE u.role IN ('admin', 'hr', 'ceo')
       AND u.employee_id IS NOT NULL
       AND u.email IS NOT NULL
       AND u.email <> ''`
  )
  const approverEmails = approverEmailResult.rows.map((row) => String(row.email || '').trim()).filter(Boolean)
  const leaveApprovalsUrl = PRIMARY_FRONTEND_ORIGIN ? `${PRIMARY_FRONTEND_ORIGIN}/leave-approvals` : ''
  for (const email of approverEmails) {
    await sendEmailNotification({
      to: email,
      subject: `New Leave Request: ${emp.first_name} ${emp.last_name}`,
      text:
        `Hi,\n\n` +
        `A new leave request was submitted and needs review.\n` +
        `Employee: ${emp.first_name} ${emp.last_name}\n` +
        `Type: ${leaveType.name}\n` +
        `Dates: ${formatEmailDateRange(start_date, end_date)}\n` +
        `Pay: ${String(compensation.leavePayType || '').toUpperCase()}\n` +
        `Paid days: ${compensation.paidDays}\n` +
        `Unpaid days: ${compensation.unpaidDays}\n` +
        `Reason: ${reason}\n` +
        (leaveApprovalsUrl ? `\nOpen leave approvals: ${leaveApprovalsUrl}\n` : '\n') +
        `\n- ${MAIL_APP_NAME}`,
    })
  }
  await addAuditLog(req.user.id, 'create_leave_request', 'leave_requests', createdId)
  const created = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [createdId])
  res.json({ ...(created.rows[0] || { id: createdId }), compensation_message: compensation.note || null })
})

app.put('/api/leave-requests/:id', authRequired, uploadAttachment, async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
  const { rows } = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  const request = rows[0]
  if (!request) return res.status(404).json({ message: 'Leave request not found' })
  if (request.employee_id !== req.user.employee_id) {
    return res.status(403).json({ message: 'Forbidden' })
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending requests can be edited' })
  }

  const { leave_type_id, start_date, end_date, reason } = req.body || {}
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

  const leaveType = resolveLeaveType(leave_type_id)
  if (!leaveType) {
    return res.status(400).json({ message: 'Invalid leave type' })
  }
  if (leaveType.id === 'awol') {
    return res.status(403).json({ message: 'AWOL can only be set by admin/hr from employee management' })
  }
  await resetEmployeeLeaveCreditsIfNeeded(req.user.employee_id)
  const empResult = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [req.user.employee_id])
  const emp = empResult.rows[0]
  if (!emp) return res.status(400).json({ message: 'No employee linked' })

  let attachmentName = request.attachment_name
  let attachmentType = request.attachment_type
  let attachmentData = request.attachment_data
  if (req.file) {
    attachmentName = req.file.originalname
    attachmentType = req.file.mimetype
    attachmentData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
  }
  const compensation = await resolveLeaveCompensation(
    emp,
    leaveType,
    start_date,
    end_date,
    Boolean(attachmentData)
  )
  if (!compensation) return res.status(400).json({ message: 'Invalid leave date range' })

  await db.query(
    `UPDATE leave_requests
     SET leave_type_name=$1, start_date=$2, end_date=$3, reason=$4,
         leave_pay_type=$5, leave_days=$6, paid_days=$7, unpaid_days=$8, credits_deducted=$9,
         attachment_name=$10, attachment_type=$11, attachment_data=$12
     WHERE id=$13`,
    [
      leaveType.name,
      start_date,
      end_date,
      reason,
      compensation.leavePayType,
      compensation.leaveDays,
      compensation.paidDays,
      compensation.unpaidDays,
      compensation.creditsDeducted,
      attachmentName,
      attachmentType,
      attachmentData,
      id,
    ]
  )

  await addAuditLog(req.user.id, 'update_leave_request', 'leave_requests', id)
  const updated = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  res.json({ ...(updated.rows[0] || { id }), compensation_message: compensation.note || null })
})

app.post('/api/leave-requests/:id/approve', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
  const { rows } = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  const leaveRequest = rows[0]
  if (!leaveRequest) return res.status(404).json({ message: 'Leave request not found' })
  if (leaveRequest.status !== 'pending') {
    return res.status(400).json({ message: 'Only pending requests can be approved' })
  }

  const leaveType = resolveLeaveType(leaveRequest.leave_type_name)
  if (!leaveType) return res.status(400).json({ message: 'Invalid leave type on request' })
  await resetEmployeeLeaveCreditsIfNeeded(leaveRequest.employee_id)
  const employeeResult = await db.query(`SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`, [leaveRequest.employee_id])
  const employee = employeeResult.rows[0]
  if (!employee) return res.status(404).json({ message: 'Employee not found' })
  const compensation = await resolveLeaveCompensation(
    employee,
    leaveType,
    leaveRequest.start_date,
    leaveRequest.end_date,
    Boolean(leaveRequest.attachment_data)
  )
  if (!compensation) return res.status(400).json({ message: 'Invalid leave date range' })

  await db.query(
    `UPDATE leave_requests
     SET status='approved', approved_by=$1, approved_by_name=$2, approved_by_role=$3,
         leave_pay_type=$4, leave_days=$5, paid_days=$6, unpaid_days=$7, credits_deducted=$8
     WHERE id=$9`,
    [
      req.user.id,
      req.user.email,
      req.user.role,
      compensation.leavePayType,
      compensation.leaveDays,
      compensation.paidDays,
      compensation.unpaidDays,
      compensation.creditsDeducted,
      id,
    ]
  )
  if (Number(compensation.creditsDeducted || 0) > 0) {
    await db.query(
      `UPDATE employees
       SET leave_credits = GREATEST(0, leave_credits - $1), updated_at = NOW()
       WHERE id = $2`,
      [compensation.creditsDeducted, leaveRequest.employee_id]
    )
  }

  const approvedResult = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  const approvedRequest = approvedResult.rows[0]
  const ownerUserRows = await db.query('SELECT id FROM users WHERE employee_id = $1 ORDER BY id ASC LIMIT 1', [
    approvedRequest?.employee_id,
  ])
  const ownerUser = ownerUserRows.rows[0]
  await createNotification({
    userId: ownerUser?.id,
    type: 'leave_approved',
    title: 'Leave Approved',
    message: `Your ${approvedRequest?.leave_type_name || 'leave'} request has been approved.`,
    targetTable: 'leave_requests',
    targetId: id,
  })
  const ownerContact = await getUserContactById(ownerUser?.id)
  await sendEmailNotification({
    to: ownerContact?.email,
    subject: `Leave Approved: ${approvedRequest?.leave_type_name || 'Leave'}`,
    text: [
      `Hi ${ownerContact?.name || 'Employee'},`,
      '',
      `Your leave request has been approved.`,
      `Type: ${approvedRequest?.leave_type_name || '-'}`,
      `Dates: ${formatEmailDateRange(approvedRequest?.start_date, approvedRequest?.end_date)}`,
      `Paid days: ${Number(approvedRequest?.paid_days || 0)}`,
      `Unpaid days: ${Number(approvedRequest?.unpaid_days || 0)}`,
    ].join('\n'),
  })

  const employeeId = approvedRequest?.employee_id
  await updateEmployeeStatus(employeeId)
  await addAuditLog(req.user.id, 'approve_leave_request', 'leave_requests', id)
  const updated = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  res.json({ ...(updated.rows[0] || { id }), compensation_message: compensation.note || null })
})

app.post('/api/leave-requests/:id/reject', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
  const rejectedResult = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  const rejectedRequest = rejectedResult.rows[0]
  const ownerContact = await getUserContactById(ownerUserRows.rows[0]?.id)
  await sendEmailNotification({
    to: ownerContact?.email,
    subject: `Leave Rejected: ${rejectedRequest?.leave_type_name || 'Leave'}`,
    text: [
      `Hi ${ownerContact?.name || 'Employee'},`,
      '',
      `Your leave request has been rejected.`,
      `Type: ${rejectedRequest?.leave_type_name || '-'}`,
      `Dates: ${formatEmailDateRange(rejectedRequest?.start_date, rejectedRequest?.end_date)}`,
      `Reason: ${comment || '-'}`,
    ].join('\n'),
  })
  await updateEmployeeStatus(employeeId)
  await addAuditLog(req.user.id, 'reject_leave_request', 'leave_requests', id)
  const updated = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  res.json(updated.rows[0] || { id })
})

app.post('/api/leave-requests/:id/cancel', authRequired, async (req, res) => {
  const id = req.params.id
  const { rows } = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
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

app.delete('/api/leave-requests/:id', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ message: 'Invalid leave request id' })
  const { rows } = await db.query(`SELECT ${LEAVE_REQUEST_COLUMNS} FROM leave_requests WHERE id = $1`, [id])
  const leaveRequest = rows[0]
  if (!leaveRequest) return res.status(404).json({ message: 'Leave request not found' })

  // Keep employee balance consistent if an approved paid/partial leave is removed.
  const refundCredits = Number(leaveRequest.credits_deducted || 0)
  if (leaveRequest.status === 'approved' && refundCredits > 0 && leaveRequest.employee_id) {
    await db.query(
      `UPDATE employees
       SET leave_credits = leave_credits + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [refundCredits, leaveRequest.employee_id]
    )
  }

  await db.query('DELETE FROM leave_requests WHERE id = $1', [id])
  if (leaveRequest.employee_id) await updateEmployeeStatus(leaveRequest.employee_id)
  await addAuditLog(req.user.id, 'delete_leave_request_admin', 'leave_requests', id)
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
  const isPrivileged = ['admin', 'hr', 'ceo'].includes(req.user.role)
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
function buildLeaveReportQuery(from, to) {
  let sql = `
    SELECT
      lr.id,
      lr.employee_id,
      lr.employee_code,
      lr.employee_name,
      lr.leave_type_id,
      lr.leave_type_name,
      lr.start_date,
      lr.end_date,
      lr.reason,
      lr.status,
      lr.approved_by,
      lr.approved_by_name,
      lr.approved_by_role,
      lr.rejection_comment,
      lr.leave_pay_type,
      lr.leave_days,
      lr.paid_days,
      lr.unpaid_days,
      lr.credits_deducted,
      lr.attachment_name,
      lr.attachment_type,
      lr.attachment_data,
      lr.created_at,
      e.department
    FROM leave_requests lr
    LEFT JOIN employees e ON lr.employee_id = e.id
    WHERE 1=1
  `
  const params = []
  if (from) {
    params.push(from)
    sql += ` AND lr.start_date >= $${params.length}`
  }
  if (to) {
    params.push(to)
    sql += ` AND lr.start_date <= $${params.length}`
  }
  sql += ' ORDER BY lr.start_date DESC'
  return { sql, params }
}

app.get('/api/reports/leave', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const { from, to } = req.query
  const { sql, params } = buildLeaveReportQuery(from, to)
  const { rows } = await db.query(sql, params)
  res.json(rows)
})

app.get('/api/reports/leave.xlsx', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const { from, to } = req.query
  const { sql, params } = buildLeaveReportQuery(from, to)
  const { rows } = await db.query(sql, params)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Leave Report')
  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 28 },
    { header: 'Leave type', key: 'type', width: 20 },
    { header: 'Pay type', key: 'pay_type', width: 14 },
    { header: 'Paid days', key: 'paid_days', width: 12 },
    { header: 'Unpaid days', key: 'unpaid_days', width: 12 },
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
      paid_days: Number(r.paid_days || 0),
      unpaid_days: Number(r.unpaid_days || 0),
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

app.get('/api/reports/leave-payroll.xlsx', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
  const { from, to } = req.query
  let sql = `
    SELECT
      lr.employee_id,
      COALESCE(MAX(lr.employee_name), '') AS employee_name,
      COALESCE(MAX(e.department), '') AS department,
      COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN COALESCE(lr.paid_days, 0) ELSE 0 END), 0)::numeric AS approved_paid_days,
      COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN COALESCE(lr.unpaid_days, 0) ELSE 0 END), 0)::numeric AS approved_unpaid_days,
      COALESCE(SUM(CASE WHEN lr.status = 'pending' THEN COALESCE(lr.leave_days, 0) ELSE 0 END), 0)::numeric AS pending_days,
      COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN COALESCE(lr.unpaid_days, 0) ELSE 0 END), 0)::numeric AS deduct_salary_days,
      COUNT(*)::int AS request_count,
      COUNT(CASE WHEN COALESCE(BTRIM(lr.reason), '') <> '' THEN 1 END)::int AS reasons_count
    FROM leave_requests lr
    LEFT JOIN employees e ON lr.employee_id = e.id
    WHERE 1=1
  `
  const params = []
  if (from) {
    params.push(from)
    sql += ` AND lr.start_date >= $${params.length}`
  }
  if (to) {
    params.push(to)
    sql += ` AND lr.start_date <= $${params.length}`
  }
  sql += ' GROUP BY lr.employee_id ORDER BY employee_name ASC'
  const { rows } = await db.query(sql, params)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Payroll Leave Summary')
  sheet.columns = [
    { header: 'Employee', key: 'employee', width: 28 },
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Approved paid days', key: 'approved_paid_days', width: 16 },
    { header: 'Approved unpaid days', key: 'approved_unpaid_days', width: 18 },
    { header: 'Pending days', key: 'pending_days', width: 12 },
    { header: 'Deduct salary days', key: 'deduct_salary_days', width: 16 },
    { header: 'Request count', key: 'request_count', width: 12 },
    { header: 'Reasons count', key: 'reasons_count', width: 12 },
  ]
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  })

  rows.forEach((r) => {
    sheet.addRow({
      employee: r.employee_name || r.employee_id || '',
      department: r.department || '-',
      approved_paid_days: Number(r.approved_paid_days || 0),
      approved_unpaid_days: Number(r.approved_unpaid_days || 0),
      pending_days: Number(r.pending_days || 0),
      deduct_salary_days: Number(r.deduct_salary_days || 0),
      request_count: Number(r.request_count || 0),
      reasons_count: Number(r.reasons_count || 0),
    })
  })

  const filename = `leave-payroll-summary-${from || 'from'}-to-${to || 'to'}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
  res.end()
})

// Payroll
// Audit logs
app.get('/api/audit-logs', authRequired, requireRole(['admin', 'hr', 'ceo']), async (req, res) => {
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
const DB_RETRY_MS = Number(process.env.DB_RETRY_MS || 15000)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureDatabaseReadyWithRetry() {
  while (true) {
    try {
      await runMigrations()
      dbReady = true
      console.log('Database connection ready')
      if (!backgroundJobsStarted) {
        backgroundJobsStarted = true
        runApprovalSlaEscalations().catch((err) => console.error('SLA escalation run failed', err))
        setInterval(() => {
          runApprovalSlaEscalations().catch((err) => console.error('SLA escalation run failed', err))
        }, 60 * 60 * 1000)
        cleanupOldNotifications().catch((err) => console.error('Notification cleanup failed', err))
        setInterval(() => {
          cleanupOldNotifications().catch((err) => console.error('Notification cleanup failed', err))
        }, 24 * 60 * 60 * 1000)
      }
      return
    } catch (err) {
      dbReady = false
      console.error(`Database startup failed, retrying in ${DB_RETRY_MS}ms`, err?.message || err)
      await sleep(DB_RETRY_MS)
    }
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on port ${PORT}`)
  ensureDatabaseReadyWithRetry().catch((err) => {
    dbReady = false
    console.error('Unexpected database bootstrap failure', err)
  })
})
