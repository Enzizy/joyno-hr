const CATEGORY_COLUMNS = {
  leave: 'leave_enabled',
  task: 'task_enabled',
  system: 'system_enabled',
}

function inferEmailCategory(subject = '') {
  const normalized = String(subject).toLowerCase()
  if (normalized.includes('leave')) return 'leave'
  if (normalized.includes('task') || normalized.includes('meeting')) return 'task'
  return 'system'
}

async function getEmailPreference(db, recipientEmail, category) {
  const categoryColumn = CATEGORY_COLUMNS[category] || CATEGORY_COLUMNS.system
  const { rows } = await db.query(
    `SELECT u.id AS user_id,
            COALESCE(p.email_delivery, 'immediate') AS email_delivery,
            COALESCE(p.${categoryColumn}, TRUE) AS category_enabled
     FROM users u
     LEFT JOIN notification_preferences p ON p.user_id = u.id
     WHERE LOWER(u.email) = LOWER($1)
     LIMIT 1`,
    [recipientEmail]
  )
  return rows[0] || { user_id: null, email_delivery: 'immediate', category_enabled: true }
}

async function dispatchPreferredEmail({ db, message, deliver, bypassPreferences = false }) {
  if (bypassPreferences) return deliver(message)

  const category = message.category || inferEmailCategory(message.subject)
  const preference = await getEmailPreference(db, message.to, category)
  if (!preference.category_enabled || preference.email_delivery === 'off') return { skipped: true }

  if (preference.email_delivery === 'daily' && preference.user_id) {
    await db.query(
      `INSERT INTO notification_email_queue
         (user_id, recipient_email, category, subject, body_text)
       VALUES ($1,$2,$3,$4,$5)`,
      [preference.user_id, message.to, category, message.subject, message.text]
    )
    return { queued: true }
  }

  return deliver(message)
}

function buildDigestText(items) {
  const lines = ['Here is your daily Joyno Workspace summary:', '']
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.subject}`)
    lines.push(String(item.body_text || '').replace(/\s+/g, ' ').trim())
    lines.push('')
  })
  lines.push('Open Joyno Workspace to review the related records.')
  return lines.join('\n')
}

async function flushDailyEmailDigests({ db, deliver }) {
  const { rows } = await db.query(
    `SELECT id, user_id, recipient_email, category, subject, body_text, created_at
     FROM notification_email_queue
     WHERE created_at < DATE_TRUNC('day', NOW())
     ORDER BY user_id, created_at`
  )
  const groups = new Map()
  rows.forEach((item) => {
    const key = `${item.user_id}:${item.recipient_email}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })

  let sent = 0
  for (const items of groups.values()) {
    await deliver({
      to: items[0].recipient_email,
      subject: `Joyno Workspace daily summary (${items.length})`,
      text: buildDigestText(items),
    })
    await db.query('DELETE FROM notification_email_queue WHERE id = ANY($1::int[])', [items.map((item) => item.id)])
    sent += 1
  }
  return sent
}

module.exports = {
  buildDigestText,
  dispatchPreferredEmail,
  flushDailyEmailDigests,
  inferEmailCategory,
}
