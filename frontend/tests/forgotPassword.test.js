import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

// Run the frontend build first. All API traffic is intercepted; no accounts or emails are touched.
test('forgot password keeps errors on the form and allows correction before confirming delivery', async () => {
  const server = await preview({
    root: fileURLToPath(new URL('..', import.meta.url)),
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  })
  let browser, page
  const pageErrors = []
  try {
    browser = await chromium.launch({ headless: true })
    page = await browser.newPage()
    page.setDefaultTimeout(8000)
    page.on('pageerror', error => pageErrors.push(error.message))
    let outcome = 'unknown'
    const submitted = []
    await page.route(/\/(?:api\/.*|health)(?:\?.*)?$/, async route => {
      const request = route.request()
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      if (new URL(request.url()).pathname === '/health') {
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{"status":"ok","database":"connected"}' })
      }
      if (!request.url().endsWith('/api/auth/forgot-password')) {
        return route.fulfill({ status: 404, contentType: 'application/json', headers, body: '{}' })
      }
      submitted.push(request.postDataJSON())
      const status = outcome === 'unknown' ? 404 : outcome === 'failed' ? 503 : 200
      const message = outcome === 'unknown' ? 'Account not found.'
        : outcome === 'failed' ? 'Unable to send a reset link right now. Please try again later.'
          : 'We sent a password reset link to your email.'
      await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ message }) })
    })
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    await page.goto(`${origin}/forgot-password`)
    const email = page.getByRole('textbox', { name: 'Email' })
    const button = page.getByRole('button', { name: 'Send reset link' })
    const alert = page.getByRole('alert')
    await email.fill('unknown@example.test')
    await button.click()
    await alert.waitFor()
    assert.equal(await alert.textContent().then(value => value.trim()), 'Account not found.')
    assert.equal(await email.inputValue(), 'unknown@example.test')
    assert.equal(await button.isEnabled(), true)
    assert.equal(await page.getByRole('status').count(), 0)

    outcome = 'failed'
    await email.fill('employee@example.test')
    assert.equal(await alert.count(), 0)
    await button.click()
    await alert.waitFor()
    assert.match(await alert.textContent(), /unable to send.*try again/i)
    assert.equal(await button.isEnabled(), true)
    assert.equal(await page.getByRole('status').count(), 0)

    outcome = 'sent'
    await button.click()
    await page.getByRole('status').waitFor()
    assert.equal(await page.getByRole('status').textContent().then(value => value.trim()), 'We sent a password reset link to your email.')
    assert.equal(await button.count(), 0)
    assert.equal(await alert.count(), 0)
    assert.deepEqual(submitted, [
      { email: 'unknown@example.test' },
      { email: 'employee@example.test' },
      { email: 'employee@example.test' },
    ])
  } catch (error) {
    if (page) console.error('Browser check failed:', page.url(), await page.locator('body').innerText(), pageErrors)
    throw error
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()))
  }
})
