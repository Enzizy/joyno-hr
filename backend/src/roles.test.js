const test = require('node:test')
const assert = require('node:assert/strict')
const { MANAGEMENT_ROLES, isRoleAllowed } = require('./constants/roles')

test('admin, HR, and CEO are equivalent management authorities', () => {
  for (const requiredRole of MANAGEMENT_ROLES) {
    for (const actualRole of MANAGEMENT_ROLES) {
      assert.equal(isRoleAllowed([requiredRole], actualRole), true)
    }
  }
})

test('management equivalence does not grant employee-only access', () => {
  assert.equal(isRoleAllowed(['employee'], 'admin'), false)
  assert.equal(isRoleAllowed(['employee'], 'hr'), false)
  assert.equal(isRoleAllowed(['employee'], 'ceo'), false)
  assert.equal(isRoleAllowed(['employee'], 'employee'), true)
})
