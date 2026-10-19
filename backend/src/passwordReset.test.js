const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { asyncRoute } = require('./routes/asyncRoute')

// Exercise the actual monolithic server route without starting its database or background jobs.
const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')
const start = source.indexOf("app.post('/api/auth/forgot-password'")
const end = source.indexOf("app.post('/api/auth/reset-password'", start)
const routeSource = source.slice(start, end)

function setup({ user = null, deliver, resetUrl = 'https://hr.example.test/reset-password', lookupError } = {}) {
  const queries = [], tokens = [], emails = []
  let handler
  const hashResetToken = token => crypto.createHash('sha256').update(token).digest('hex')
  const send = async message => {
    if (deliver) await deliver(message)
    emails.push(message)
  }
  vm.runInNewContext(routeSource, {
    app: { post: (_path, _limiter, callback) => { handler = callback } },
    loginLimiter: () => {},
    asyncRoute: (callback, message) => asyncRoute(callback, message, { error() {} }),
    db: { async query(sql, params) {
      queries.push({ sql, params })
      if (sql.includes('FROM users')) {
        if (lookupError) throw lookupError
        return { rows: user && params[0] === user.email.trim().toLowerCase() ? [user] : [] }
      }
      if (sql.startsWith('DELETE')) tokens.length = 0
      if (sql.startsWith('INSERT')) tokens.push({ userId: params[0], hash: params[1], expiresAt: params[2] })
      return { rows: [] }
    } },
    crypto, hashResetToken, RESET_TOKEN_TTL_MINUTES: 30, MAIL_APP_NAME: 'Test HR',
    buildResetPasswordUrl: token => resetUrl ? `${resetUrl}?token=${token}` : '',
    sendEmailNotification: message => { void send(message).catch(() => {}) },
    deliverEmailNotification: send,
    console: { error() {} },
  })
  const response = { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this },
  }
  return { queries, tokens, emails, response,
    submit: email => handler({ body: { email } }, response),
  }
}

test('unregistered reset email returns account not found without tokens or outgoing email', async () => {
  const state = setup()
  await state.submit('unknown@example.test')
  assert.equal(state.response.statusCode, 404)
  assert.equal(state.response.body.message, 'Account not found.')
  assert.equal(state.tokens.length, 0)
  assert.equal(state.emails.length, 0)
  assert.equal(state.queries.length, 1)
})

test('invalid reset email is rejected before querying accounts', async () => {
  for (const email of ['', '   ', 'missing-at', 'person@', ['employee@example.test'], {}]) {
    const state = setup()
    await state.submit(email)
    assert.equal(state.response.statusCode, 400, `Invalid input: ${JSON.stringify(email)}`)
    assert.equal(state.queries.length, 0)
    assert.equal(state.tokens.length, 0)
    assert.equal(state.emails.length, 0)
  }
})

test('registered email lookup ignores case and spaces and sends a hashed expiring reset token', async () => {
  const state = setup({ user: { id: 7, email: 'Employee@example.test' } })
  const before = Date.now()
  await state.submit('  EMPLOYEE@EXAMPLE.TEST  ')
  assert.equal(state.response.statusCode, 200)
  assert.equal(state.response.body.message, 'We sent a password reset link to your email.')
  assert.equal(state.emails.length, 1)
  const message = state.emails[0]
  assert.equal(message.to, 'Employee@example.test')
  assert.equal(message.requireDelivery, true)
  const rawToken = message.text.match(/token=([a-f0-9]{64})/)[1]
  assert.equal(state.tokens.length, 1)
  assert.equal(state.tokens[0].userId, 7)
  assert.equal(state.tokens[0].hash, crypto.createHash('sha256').update(rawToken).digest('hex'))
  assert.ok(new Date(state.tokens[0].expiresAt).getTime() >= before + 30 * 60 * 1000)
  assert.ok(new Date(state.tokens[0].expiresAt).getTime() <= Date.now() + 30 * 60 * 1000)
  assert.ok(!JSON.stringify(state.response.body).includes(rawToken))
})

test('reset success waits for email provider acceptance', async () => {
  let accept
  const accepted = new Promise(resolve => { accept = resolve })
  const state = setup({ user: { id: 7, email: 'employee@example.test' }, deliver: () => accepted })
  const request = state.submit('employee@example.test')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.response.body, null)
  accept()
  await request
  assert.equal(state.response.statusCode, 200)
  assert.equal(state.emails.length, 1)
})

test('email provider failure returns a retryable error rather than sent confirmation', async () => {
  const state = setup({ user: { id: 7, email: 'employee@example.test' },
    deliver: async () => { throw new Error('Private provider credential failure') },
  })
  await state.submit('employee@example.test')
  assert.equal(state.response.statusCode, 503)
  assert.match(state.response.body.message, /unable to send.*try again/i)
  assert.ok(!state.response.body.message.includes('credential'))
})

test('missing reset URL configuration cannot claim a link was sent or invalidate tokens', async () => {
  const state = setup({ user: { id: 7, email: 'employee@example.test' }, resetUrl: '' })
  await state.submit('employee@example.test')
  assert.equal(state.response.statusCode, 503)
  assert.equal(state.tokens.length, 0)
  assert.equal(state.emails.length, 0)
  assert.equal(state.queries.length, 1)
})

test('account lookup failure returns a safe JSON error', async () => {
  const state = setup({ lookupError: new Error('Private database connection details') })
  await state.submit('employee@example.test')
  assert.equal(state.response.statusCode, 500)
  assert.match(state.response.body.message, /unable to process/i)
  assert.ok(!state.response.body.message.includes('database'))
  assert.equal(state.tokens.length, 0)
  assert.equal(state.emails.length, 0)
})
