const test = require('node:test')
const assert = require('node:assert/strict')
const { buildDigestText, dispatchPreferredEmail, inferEmailCategory } = require('./services/emailPreferenceService')

test('infers notification email categories', () => {
  assert.equal(inferEmailCategory('Leave request approved'), 'leave')
  assert.equal(inferEmailCategory('New meeting assigned'), 'task')
  assert.equal(inferEmailCategory('Password changed'), 'system')
})

test('builds a compact daily digest', () => {
  const text = buildDigestText([
    { subject: 'Leave approved', body_text: 'Your leave was approved.' },
    { subject: 'Task assigned', body_text: 'A task was assigned.' },
  ])
  assert.match(text, /1\. Leave approved/)
  assert.match(text, /2\. Task assigned/)
})

test('queues daily emails instead of delivering immediately', async () => {
  const queries = []
  const db = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes('FROM users')) return { rows: [{ user_id: 4, email_delivery: 'daily', category_enabled: true }] }
      return { rows: [] }
    },
  }
  let delivered = false
  const result = await dispatchPreferredEmail({
    db,
    message: { to: 'employee@example.com', subject: 'Leave updated', text: 'Review it.' },
    deliver: async () => { delivered = true },
  })
  assert.equal(result.queued, true)
  assert.equal(delivered, false)
  assert.equal(queries.length, 2)
})
