import test from 'node:test'
import assert from 'node:assert/strict'
import { periodForPayday, paydayForPeriodEnd, paydaysAround, nextPayday, payRunStages, currentPayRun, paydayReadiness, paydayProgress, currentStageKey, runSummary, runsForPeriod, profileGaps } from './payRun.js'

const period = periodForPayday('2026-09-30')
const ready = { monthly_basic_salary: '15000', biometric_person_id: '00000060', work_start_time: '09:00', work_end_time: '18:00' }
const stage = (stages, key) => stages.find(s => s.key === key)

test('a pay run is keyed by its standard payday and derives its work dates', () => {
  assert.deepEqual(period, { start: '2026-09-11', end: '2026-09-25', payday: '2026-09-30', month: '2026-09', cutoff: 'second' })
  assert.equal(periodForPayday('2026-10-15').start, '2026-09-26')
  assert.equal(periodForPayday('2026-02-28').cutoff, 'second')
  assert.equal(periodForPayday('2026-09-29'), null)
  assert.equal(periodForPayday('2026-13-15'), null)
  assert.equal(periodForPayday('test'), null)
  assert.equal(paydayForPeriodEnd('2026-09-25'), '2026-09-30')
  assert.equal(paydayForPeriodEnd('2026-10-10'), '2026-10-15')
  assert.equal(paydayForPeriodEnd('2026-09-20'), null)
})

test('the hub lists the next payday first, then earlier paydays', () => {
  assert.deepEqual(paydaysAround('2026-10-06', { past: 4, future: 1 }), ['2026-10-15', '2026-09-30', '2026-09-15', '2026-08-30', '2026-08-15'])
  assert.equal(nextPayday('2026-10-15'), '2026-10-15')
  assert.equal(nextPayday('2026-10-16'), '2026-10-30')
})

test('a new pay run starts at attendance; employee setup is not a step', () => {
  const stages = payRunStages({ period, shift: 'day', reviews: [], runs: [] })
  assert.deepEqual(stages.map(s => s.key), ['attendance', 'review', 'approve', 'payslips'])
  assert.deepEqual(stages.map(s => s.state), ['todo', 'locked', 'locked', 'locked'])
  assert.equal(stage(stages, 'attendance').detail, 'Upload file')
  assert.equal(currentStageKey(stages), 'attendance')
  assert.deepEqual(runSummary(stages), { label: 'Not started', tone: 'neutral' })
})

test('attendance in review becomes the current stage, scoped by shift and practice', () => {
  const reviews = [
    { id: 4, payroll_scope: 'day', is_test: false, review_state: 'draft', period_start: '2026-09-11', period_end: '2026-09-25', pending_days: 152 },
    { id: 5, payroll_scope: 'night', is_test: false, review_state: 'confirmed', period_start: '2026-09-11', period_end: '2026-09-25' },
    { id: 6, payroll_scope: 'day', is_test: true, review_state: 'confirmed', period_start: '2026-09-11', period_end: '2026-09-25' },
  ]
  const stages = payRunStages({ period, shift: 'day', profiles: [ready, {}], reviews, runs: [] })
  assert.equal(stage(stages, 'attendance').detail, '152 days to decide')
  assert.equal(currentStageKey(stages), 'attendance')
  assert.equal(runSummary(stages).label, 'Attendance · 152 days to decide')
  assert.equal(stage(payRunStages({ period, shift: 'day', practice: true, profiles: [ready], reviews }), 'attendance').state, 'done')
})

test('drafts wait on approval, and approval is locked in draft mode for real payroll only', () => {
  const reviews = [{ id: 4, payroll_scope: 'day', review_state: 'confirmed', period_start: '2026-09-11', period_end: '2026-09-25' }]
  const draft = [{ id: 9, status: 'draft', period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day' } }]
  const real = payRunStages({ period, shift: 'day', profiles: [ready], reviews, runs: draft })
  assert.equal(stage(real, 'review').detail, 'Draft to check')
  assert.equal(stage(real, 'approve').detail, 'Turned off for now')
  assert.equal(currentStageKey(real), 'review')
  const enabled = payRunStages({ period, shift: 'day', profiles: [ready], reviews, runs: draft, finalizationEnabled: true })
  assert.equal(stage(enabled, 'approve').state, 'todo')
})

test('payment and closing drive the last stages; practice runs release test payslips', () => {
  const run = status => [{ id: 9, status, has_payment: status !== 'approved', period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day', isTest: true } }]
  const approved = payRunStages({ period, shift: 'day', practice: true, profiles: [ready], runs: [{ ...run('approved')[0], has_payment: false }] })
  assert.equal(stage(approved, 'approve').detail, 'Mark as paid')
  assert.equal(currentStageKey(approved), 'approve')
  const finished = payRunStages({ period, shift: 'day', practice: true, profiles: [ready], runs: run('locked') })
  assert.equal(stage(finished, 'payslips').detail, 'Ready to send')
  assert.deepEqual(runSummary(finished), { label: 'Practice finished', tone: 'success' })
  const closed = payRunStages({ period, shift: 'day', profiles: [ready], runs: [{ ...run('locked')[0], rule_snapshot: { payrollScope: 'day' } }], finalizationEnabled: true })
  assert.equal(runSummary(closed).label, 'Payslips released')
})

test('runs are matched by shift, practice flag and exact work dates', () => {
  const runs = [
    { id: 1, period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day' } },
    { id: 3, period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day' } },
    { id: 2, period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'night' } },
    { id: 4, period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day', isTest: true } },
  ]
  assert.deepEqual(runsForPeriod(runs, period, 'day', false).map(r => r.id), [3, 1])
  assert.deepEqual(profileGaps({ biometric_person_id: '1' }), ['Monthly salary', 'Schedule'])
})

test('a newer practice upload for the same payday starts a fresh practice run', () => {
  const review = (id, state) => ({ id, payroll_scope: 'day', is_test: true, review_state: state, period_start: '2026-09-11', period_end: '2026-09-25', pending_days: 0 })
  const finished = { id: 2, status: 'locked', has_payment: true, attendance_batch_id: 9, period_start: '2026-09-11', period_end: '2026-09-25', rule_snapshot: { payrollScope: 'day', isTest: true } }
  const base = { period, shift: 'day', practice: true, profiles: [ready], runs: [finished] }
  assert.equal(currentPayRun({ ...base, reviews: [review(9, 'confirmed')] }).id, 2)
  // Re-uploaded for other people and still being reviewed: attendance is the current step again.
  const redoing = payRunStages({ ...base, reviews: [review(9, 'confirmed'), review(12, 'draft')] })
  assert.equal(stage(redoing, 'attendance').detail, 'Ready to confirm')
  assert.equal(stage(redoing, 'review').state, 'locked')
  // Once the new upload is confirmed, pay has to be calculated for it.
  const confirmedAgain = payRunStages({ ...base, reviews: [review(9, 'confirmed'), review(12, 'confirmed')] })
  assert.equal(stage(confirmedAgain, 'review').detail, 'Calculate pay')
  assert.equal(currentPayRun({ ...base, reviews: [review(9, 'confirmed'), review(12, 'confirmed')] }), null)
})

test('payday readiness lists people not set up', () => {
  const oct15 = periodForPayday('2026-10-15')
  const person = (code, extra = {}) => ({ employee_id: code, employee_code: code, ...ready, first_effective_from: '2026-01-01', date_hired: '2025-01-01', ...extra })
  const readiness = paydayReadiness(oct15, {
    day: [person('a'), person('b', { first_effective_from: '2026-10-06' }), person('c', { date_hired: '2026-10-01', first_effective_from: '2026-10-01' }),
      person('d', { monthly_basic_salary: '0.01' }), { employee_id: 'e' }],
    night: [],
  })
  assert.equal(readiness.day.total, 5)
  // A ₱0.01 placeholder salary counts as not set up.
  assert.equal(readiness.day.ready, 3)
  assert.deepEqual(readiness.day.notSetUp.map(p => p.employee_id), ['d', 'e'])
  assert.deepEqual(profileGaps({ ...ready, monthly_basic_salary: '0.01' }), ['Monthly salary'])
  assert.equal(readiness.night.total, 0)
})

test('payday progress waits for the cutoff, then follows the least advanced shift', () => {
  const oct15 = periodForPayday('2026-10-15')
  assert.equal(paydayProgress({ period: oct15, today: '2026-10-07' }), 0)
  assert.equal(paydayProgress({ period: oct15, today: '2026-10-10' }), 0)
  const stages = (attendance, approve, payslips) => [{ key: 'attendance', state: attendance }, { key: 'approve', state: approve }, { key: 'payslips', state: payslips }]
  assert.equal(paydayProgress({ period: oct15, today: '2026-10-11', stagesByShift: [stages('todo', 'locked', 'locked')] }), 1)
  assert.equal(paydayProgress({ period: oct15, today: '2026-10-13', stagesByShift: [stages('done', 'todo', 'locked'), stages('done', 'done', 'done')] }), 2)
  assert.equal(paydayProgress({ period: oct15, today: '2026-10-15', stagesByShift: [stages('done', 'done', 'done')] }), 4)
})
