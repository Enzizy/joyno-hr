const test = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const express = require('express')
const { asyncRoute } = require('./routes/asyncRoute')

test('approval errors return JSON while the API remains available for subsequent requests', async () => {
  const app = express()
  const logged = []
  app.post('/approve', asyncRoute(async () => {
    throw new Error('Simulated database failure with private details')
  }, 'Unable to approve leave. Please refresh the request and try again.', { error: (...args) => logged.push(args) }))
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  app.post('/success', asyncRoute(async (req, res) => res.json({ status: 'approved' }), 'Unexpected failure'))
  const server = app.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    const failure = await fetch(`${base}/approve`, { method: 'POST' })
    assert.equal(failure.status, 500)
    assert.deepEqual(await failure.json(), { message: 'Unable to approve leave. Please refresh the request and try again.' })
    assert.equal(logged.length, 1)
    assert.equal((await fetch(`${base}/health`)).status, 200)
    const success = await fetch(`${base}/success`, { method: 'POST' })
    assert.equal(success.status, 200)
    assert.deepEqual(await success.json(), { status: 'approved' })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
