// Reuse Tasks & meetings' delivery helper, including branding and email preferences.
function createAnnouncementEmailSender({ db, sendEmailNotification, frontendOrigin, isEmailConfigured = ()=>true }) {
  return async function sendAnnouncementEmails(announcement) {
    if (!isEmailConfigured()) return {status:'not_configured',recipients:0}
    const contacts = (await db.query(`SELECT u.id,u.email,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ',e.first_name,e.last_name)),''),u.email) AS name
      FROM users u LEFT JOIN employees e ON e.id=u.employee_id
      WHERE NULLIF(TRIM(u.email),'') IS NOT NULL AND (
        EXISTS(SELECT 1 FROM announcement_recipients r WHERE r.announcement_id=$1 AND r.employee_id=u.employee_id)
        OR ($2::boolean AND LOWER(u.role)='ceo'))
      ORDER BY u.id`, [announcement.id,announcement.notify_ceo])).rows
    const sent = new Set()
    const url = `${frontendOrigin}/announcements?announcement=${announcement.id}`
    for (const contact of contacts) {
      const email = contact.email.trim(), key = email.toLowerCase()
      if (sent.has(key)) continue
      sent.add(key)
      await sendEmailNotification({
        to:email,subject:`Announcement: ${announcement.title}`,category:'system',
        linkLabels:{[url]:'View announcement'},
        text:[`Hi ${contact.name || 'Employee'},`,'','A company announcement has been published.',
          `Title: ${announcement.title}`,`Priority: ${announcement.priority}`,`Published by: ${announcement.author_name}`,
          '',announcement.body,'',`View announcement: ${url}`].join('\n'),
      })
    }
    return {status:sent.size?'scheduled':'no_recipients',recipients:sent.size}
  }
}

module.exports = { createAnnouncementEmailSender }
