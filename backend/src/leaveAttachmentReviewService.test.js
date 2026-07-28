const test = require('node:test')
const assert = require('node:assert/strict')
const {
  approvalDocumentDecision,
  calculateBusinessDayDeadline,
  initialReviewStatus,
} = require('./services/leaveAttachmentReviewService')

const requiredType = { requires_attachment_for_paid: true }

test('new required documents start pending review and missing documents stay unpaid candidates', () => {
  assert.equal(initialReviewStatus(requiredType, true), 'pending_review')
  assert.equal(initialReviewStatus(requiredType, false), 'missing')
  assert.equal(initialReviewStatus(requiredType, false, true), 'valid')
})

test('paid approval is blocked until the supporting document is valid', () => {
  const decision = approvalDocumentDecision(requiredType, {
    attachment_review_status: 'pending_review',
    attachment_data: 'data:image/png;base64,abc',
  })
  assert.equal(decision.allowed, false)
  assert.equal(decision.code, 'DOCUMENT_REVIEW_REQUIRED')
})

test('missing documents require explicit unpaid approval confirmation', () => {
  const blocked = approvalDocumentDecision(requiredType, {
    attachment_review_status: 'missing',
  })
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.code, 'DOCUMENT_UNPAID_CONFIRMATION_REQUIRED')

  const confirmed = approvalDocumentDecision(requiredType, {
    attachment_review_status: 'missing',
  }, {
    approval_mode: 'unpaid',
    confirm_unpaid: true,
  })
  assert.deepEqual(confirmed, { allowed: true, forceUnpaid: true })
})

test('replacement deadlines skip weekends', async () => {
  const db = { query: async () => ({ rows: [] }) }
  const deadline = await calculateBusinessDayDeadline(
    db,
    1,
    new Date('2026-07-31T10:00:00+08:00')
  )
  assert.equal(deadline.toISOString(), '2026-08-03T15:59:59.000Z')
})

test('replacement deadlines skip Philippine non-working holidays', async () => {
  const db = {
    query: async () => ({
      rows: [{
        holiday_date: '2026-08-03',
        name: 'Test holiday',
        category: 'regular',
        is_working_day: false,
        source: 'test',
      }],
    }),
  }
  const deadline = await calculateBusinessDayDeadline(
    db,
    1,
    new Date('2026-07-31T10:00:00+08:00')
  )
  assert.equal(deadline.toISOString(), '2026-08-04T15:59:59.000Z')
})
