const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanupCompletedTasks } = require('./services/taskCleanupService')

test('cleanupCompletedTasks deletes completed tasks and linked notifications after the retention period', async () => {
  let capturedSql = ''
  let capturedParams = []
  const database = {
    async query(sql, params) {
      capturedSql = sql
      capturedParams = params
      return { rows: [{ tasks_deleted: 3, notifications_deleted: 7 }] }
    },
  }

  const result = await cleanupCompletedTasks(30, database)

  assert.deepEqual(capturedParams, [30])
  assert.match(capturedSql, /status = 'completed'/)
  assert.match(capturedSql, /completed_date IS NOT NULL/)
  assert.match(capturedSql, /DELETE FROM notifications/)
  assert.match(capturedSql, /DELETE FROM tasks/)
  assert.deepEqual(result, { tasksDeleted: 3, notificationsDeleted: 7 })
})

test('cleanupCompletedTasks clamps invalid retention periods', async () => {
  const database = {
    async query(_sql, params) {
      assert.deepEqual(params, [1])
      return { rows: [{}] }
    },
  }

  assert.deepEqual(await cleanupCompletedTasks(-10, database), { tasksDeleted: 0, notificationsDeleted: 0 })
})
