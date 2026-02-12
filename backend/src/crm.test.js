const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeEnum,
  normalizeServices,
  parsePagination,
  calculateContractEndDate,
  LEAD_STATUSES,
} = require('./crm')

test('normalizeEnum should normalize and validate values', () => {
  assert.equal(normalizeEnum('Qualified', LEAD_STATUSES, { defaultValue: 'new' }), 'qualified')
  assert.equal(normalizeEnum('invalid', LEAD_STATUSES, { defaultValue: 'new' }), null)
  assert.equal(normalizeEnum('', LEAD_STATUSES, { defaultValue: 'new' }), 'new')
})

test('normalizeServices should deduplicate and filter values', () => {
  const result = normalizeServices(['social_media', 'SOCIAL_MEDIA', 'bad'], ['social_media', 'website_dev'])
  assert.deepEqual(result, ['social_media'])
})

test('parsePagination should clamp and sanitize values', () => {
  assert.deepEqual(parsePagination({ limit: '200', offset: '-2' }, 10, 50), { limit: 50, offset: 0 })
  assert.deepEqual(parsePagination({}, 10, 50), { limit: 10, offset: 0 })
})

test('calculateContractEndDate should return date string', () => {
  assert.equal(calculateContractEndDate('2026-02-10', 12), '2027-02-10')
  assert.equal(calculateContractEndDate('bad-date', 12), null)
})

