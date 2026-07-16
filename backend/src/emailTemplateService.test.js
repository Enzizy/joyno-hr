const test = require('node:test')
const assert = require('node:assert/strict')
const { renderEmailBodyHtml } = require('./services/emailTemplateService')

test('renders notification details in a summary card with badges', () => {
  const html = renderEmailBodyHtml('Hi Employee,\nA task was assigned.\nTitle: Monthly report\nPriority: high\nDue date: 2026-07-20')

  assert.match(html, /<table role="presentation"/)
  assert.match(html, /Monthly report/)
  assert.match(html, /background:#ffedd5/)
  assert.match(html, /2026-07-20/)
})

test('renders an attachment URL as a filename button and escapes unsafe labels', () => {
  const url = 'https://example.com/api/tasks/1/attachment'
  const html = renderEmailBodyHtml(`Attachment: ${url}`, { [url]: '<report>.pdf' })

  assert.match(html, /href="https:\/\/example.com\/api\/tasks\/1\/attachment"/)
  assert.match(html, /&lt;report&gt;\.pdf/)
  assert.doesNotMatch(html, /<report>/)
})
