const db = require('../db')

async function cleanupCompletedTasks(days = 30, database = db) {
  const safeDays = Math.max(1, Number(days) || 30)
  const { rows } = await database.query(
    `WITH expired_tasks AS (
       SELECT id
       FROM tasks
       WHERE status = 'completed'
         AND completed_date IS NOT NULL
         AND completed_date < NOW() - ($1::text || ' days')::interval
     ),
     deleted_notifications AS (
       DELETE FROM notifications n
       USING expired_tasks e
       WHERE n.target_table = 'tasks'
         AND n.target_id = e.id
       RETURNING n.id
     ),
     deleted_tasks AS (
       DELETE FROM tasks t
       USING expired_tasks e
       WHERE t.id = e.id
       RETURNING t.id
     )
     SELECT
       (SELECT COUNT(*)::int FROM deleted_tasks) AS tasks_deleted,
       (SELECT COUNT(*)::int FROM deleted_notifications) AS notifications_deleted`,
    [safeDays]
  )

  return {
    tasksDeleted: Number(rows[0]?.tasks_deleted || 0),
    notificationsDeleted: Number(rows[0]?.notifications_deleted || 0),
  }
}

module.exports = { cleanupCompletedTasks }
