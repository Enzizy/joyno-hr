const { isManagementRole } = require('../constants/roles')

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }) }
function positiveId(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) fail('Invalid announcement ID')
  return id
}
function validateAnnouncement(input = {}) {
  if (typeof input.title !== 'string' || typeof input.body !== 'string') fail('Enter a title and message')
  const title = String(input.title || '').trim(), body = String(input.body || '').trim()
  if (!title || title.length > 180) fail('Enter an announcement title of up to 180 characters')
  if (!body || body.length > 10000) fail('Enter a message of up to 10,000 characters')
  const priority = input.priority || 'normal'
  if (!['normal', 'important'].includes(priority)) fail('Invalid announcement priority')
  if (input.notifyCeo !== undefined && typeof input.notifyCeo !== 'boolean') fail('CEO notification must be on or off')
  if (!Array.isArray(input.recipientIds) || input.recipientIds.length > 5000) fail('Choose announcement recipients')
  if (input.recipientIds.some(value=>!['string','number'].includes(typeof value))) fail('Choose valid employees')
  const recipientIds = [...new Set(input.recipientIds.map(Number))]
  if (!recipientIds.length || recipientIds.some(id => !Number.isSafeInteger(id) || id < 1)) fail('Choose at least one valid employee')
  return { title, body, priority, recipientIds, notifyCeo:input.notifyCeo===true }
}
function requireManagement(actor) {
  if (!isManagementRole(actor?.role)) fail('Only HR, Admin or CEO can manage announcements', 403)
}

function createAnnouncementService({ db, sendAnnouncementEmails = async()=>{} }) {
  async function audience() {
    return (await db.query(`SELECT e.id,e.employee_code,e.first_name,e.last_name,
      COALESCE(NULLIF(TRIM(e.department),''),'Unassigned') AS department,
      LOWER(COALESCE(e.shift,'day')) AS shift,
      EXISTS(SELECT 1 FROM users u WHERE u.employee_id=e.id) AS has_account
      FROM employees e WHERE LOWER(e.status) IN ('active','on_leave')
      ORDER BY e.last_name,e.first_name,e.id`)).rows
  }
  async function getWith(tx, id, actor) {
    const management = isManagementRole(actor?.role)
    const item = (await tx.query(`SELECT a.*,COALESCE(NULLIF(TRIM(CONCAT_WS(' ',e.first_name,e.last_name)),''),u.email,'HR') AS author_name
      FROM announcements a LEFT JOIN users u ON u.id=a.created_by LEFT JOIN employees e ON e.id=u.employee_id
      WHERE a.id=$1 AND ($2::boolean OR (a.status<>'draft' AND EXISTS(
        SELECT 1 FROM announcement_recipients r WHERE r.announcement_id=a.id AND r.employee_id=$3)))`,
    [positiveId(id), management, actor.employee_id || null])).rows[0]
    if (!item) fail('Announcement not found', 404)
    if (management) {
      item.recipients = (await tx.query(`SELECT r.*,EXISTS(SELECT 1 FROM users u WHERE u.employee_id=r.employee_id) AS has_account
        FROM announcement_recipients r WHERE announcement_id=$1 ORDER BY employee_name,employee_id`, [id])).rows
    } else {
      // Employees receive no other employee's names, IDs or read receipts.
      item.read_at = (await tx.query('SELECT read_at FROM announcement_recipients WHERE announcement_id=$1 AND employee_id=$2', [id, actor.employee_id])).rows[0]?.read_at
      delete item.client_key
    }
    return item
  }
  async function list(query, actor) {
    const management = isManagementRole(actor?.role), filters = [], params = []
    const add = (sql, value) => { params.push(value); filters.push(sql.replace('?', `$${params.length}`)) }
    if (!management) {
      filters.push("a.status<>'draft'")
      add('EXISTS(SELECT 1 FROM announcement_recipients own WHERE own.announcement_id=a.id AND own.employee_id=?)', actor.employee_id || null)
    }
    if (query.status && query.status !== 'all') {
      if (!['draft','published','archived'].includes(query.status)) fail('Invalid status filter')
      add('a.status=?', query.status)
    }
    if (query.search) add("CONCAT_WS(' ',a.title,a.body) ILIKE ?", `%${String(query.search).slice(0,200)}%`)
    const audienceFilters = []
    if (management && query.shift && query.shift !== 'all') {
      if (!['day','night'].includes(query.shift)) fail('Invalid shift filter')
      params.push(query.shift); audienceFilters.push(`f.shift=$${params.length}`)
    }
    if (management && query.department) {
      params.push(String(query.department).slice(0,100)); audienceFilters.push(`f.department=$${params.length}`)
    }
    if (audienceFilters.length) filters.push(`EXISTS(SELECT 1 FROM announcement_recipients f WHERE f.announcement_id=a.id AND ${audienceFilters.join(' AND ')})`)
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const total = Number((await db.query(`SELECT COUNT(*)::integer AS total FROM announcements a ${where}`, params)).rows[0].total)
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit,10) || 12))
    const offset = Math.min(1000000,Math.max(0, Number.parseInt(query.offset,10) || 0))
    const stats = management ? `s.recipient_count,s.read_count,s.shifts,s.departments` : 'own.read_at'
    if (!management) params.push(actor.employee_id || null)
    const statsJoin = management ? `LEFT JOIN LATERAL (SELECT COUNT(*)::integer AS recipient_count,
      COUNT(read_at)::integer AS read_count,ARRAY_AGG(DISTINCT shift) AS shifts,
      ARRAY_AGG(DISTINCT department) AS departments FROM announcement_recipients WHERE announcement_id=a.id) s ON TRUE`
      : `LEFT JOIN announcement_recipients own ON own.announcement_id=a.id AND own.employee_id=$${params.length}`
    const items = (await db.query(`SELECT a.id,a.title,LEFT(a.body,240) AS excerpt,a.priority,a.status,a.version,a.created_at,a.updated_at,a.published_at,
      COALESCE(NULLIF(TRIM(CONCAT_WS(' ',e.first_name,e.last_name)),''),u.email,'HR') AS author_name,${stats}
      FROM announcements a LEFT JOIN users u ON u.id=a.created_by LEFT JOIN employees e ON e.id=u.employee_id
      ${statsJoin} ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    [...params,limit,offset])).rows
    return { items, total, limit, offset }
  }
  async function audit(tx, actor, action, id) {
    await tx.query('INSERT INTO audit_logs(user_id,action,target_table,target_id) VALUES($1,$2,$3,$4)', [actor.id,action,'announcements',id])
  }
  async function setRecipients(tx, id, recipientIds) {
    const people = (await tx.query(`SELECT id,CONCAT_WS(' ',first_name,last_name) AS name,
      COALESCE(NULLIF(TRIM(department),''),'Unassigned') AS department,LOWER(COALESCE(shift,'day')) AS shift
      FROM employees WHERE id=ANY($1::integer[]) AND LOWER(status) IN ('active','on_leave') FOR SHARE`, [recipientIds])).rows
    if (people.length !== recipientIds.length) fail('Some recipients are no longer active. Reload the employee list and review your selection', 409)
    await tx.query('DELETE FROM announcement_recipients WHERE announcement_id=$1', [id])
    await tx.query(`INSERT INTO announcement_recipients(announcement_id,employee_id,employee_name,department,shift)
      SELECT $1,p.id,p.name,p.department,p.shift FROM jsonb_to_recordset($2::jsonb)
      AS p(id integer,name text,department text,shift text)`, [id,JSON.stringify(people)])
  }
  async function save(input, actor, id = null) {
    requireManagement(actor)
    const data = validateAnnouncement(input)
    if (!id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.clientKey || '')) fail('A valid draft key is required')
    return db.transaction(async tx => {
      let item
      if (id) {
        id = positiveId(id)
        item = (await tx.query('SELECT * FROM announcements WHERE id=$1 FOR UPDATE', [id])).rows[0]
        if (!item) fail('Announcement not found',404)
        if (item.status !== 'draft') fail('Published announcements are retained. Create a new announcement for changes',409)
        if (Number(input.version) !== item.version) fail('This draft changed. Reload it before saving',409)
        await tx.query('UPDATE announcements SET title=$1,body=$2,priority=$3,notify_ceo=$4,version=version+1,updated_at=NOW() WHERE id=$5', [data.title,data.body,data.priority,data.notifyCeo,id])
      } else {
        // Retry after a network interruption must not create a second draft.
        await tx.query('SELECT pg_advisory_xact_lock(62411,hashtext($1))', [input.clientKey])
        item = (await tx.query('SELECT * FROM announcements WHERE client_key=$1', [input.clientKey])).rows[0]
        if (item) {
          if (Number(item.created_by) !== Number(actor.id)) fail('Draft key is already in use',409)
          const existing=await getWith(tx,item.id,actor)
          const sameRecipients=JSON.stringify(existing.recipients.map(p=>p.employee_id).sort((a,b)=>a-b))===JSON.stringify([...data.recipientIds].sort((a,b)=>a-b))
          if (existing.title!==data.title || existing.body!==data.body || existing.priority!==data.priority || existing.notify_ceo!==data.notifyCeo || !sameRecipients) fail('This draft was already saved with different details. Open it from Drafts before changing or publishing it',409)
          return existing
        }
        id = (await tx.query(`INSERT INTO announcements(title,body,priority,created_by,client_key,notify_ceo) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [data.title,data.body,data.priority,actor.id,input.clientKey,data.notifyCeo])).rows[0].id
      }
      await setRecipients(tx,id,data.recipientIds)
      await audit(tx,actor,item?'update_announcement_draft':'create_announcement_draft',id)
      return getWith(tx,id,actor)
    })
  }
  async function publish(id, version, actor) {
    requireManagement(actor); id=positiveId(id)
    const result=await db.transaction(async tx => {
      const item = (await tx.query('SELECT * FROM announcements WHERE id=$1 FOR UPDATE', [id])).rows[0]
      if (!item) fail('Announcement not found',404)
      if (item.status === 'published') return {announcement:await getWith(tx,id,actor),newlyPublished:false}
      if (item.status !== 'draft' || Number(version) !== item.version) fail('This draft changed. Reload and review before publishing',409)
      const recipients = (await tx.query(`SELECT r.employee_id,e.status FROM announcement_recipients r JOIN employees e ON e.id=r.employee_id
        WHERE r.announcement_id=$1 FOR SHARE OF e`, [id])).rows
      if (!recipients.length || recipients.some(r=>!['active','on_leave'].includes(String(r.status).toLowerCase()))) fail('Recipients changed. Edit the draft and review the active employees before publishing',409)
      await tx.query("UPDATE announcements SET status='published',published_at=NOW(),updated_at=NOW(),version=version+1 WHERE id=$1", [id])
      await tx.query(`INSERT INTO notifications(user_id,type,title,message,target_table,target_id)
        SELECT u.id,'announcement_published',$2,LEFT($3,240),'announcements',$1 FROM users u
        WHERE EXISTS(SELECT 1 FROM announcement_recipients r WHERE r.announcement_id=$1 AND r.employee_id=u.employee_id)
          OR ($4::boolean AND LOWER(u.role)='ceo')`, [id,item.title,item.body,item.notify_ceo])
      await audit(tx,actor,'publish_announcement',id)
      return {announcement:await getWith(tx,id,actor),newlyPublished:true}
    })
    // Mail scheduling runs after commit; retries of an already-published announcement do not resend.
    if(result.newlyPublished){
      try{result.announcement.email_delivery=await sendAnnouncementEmails(result.announcement)}catch(error){
        console.error('Announcement email scheduling failed:',error.message)
        result.announcement.email_delivery={status:'failed'}
      }
    }
    return result.announcement
  }
  async function archive(id, version, actor) {
    requireManagement(actor); id=positiveId(id)
    return db.transaction(async tx => {
      const item=(await tx.query('SELECT * FROM announcements WHERE id=$1 FOR UPDATE',[id])).rows[0]
      if (!item) fail('Announcement not found',404)
      if (item.status==='archived') return getWith(tx,id,actor)
      if (item.status!=='published' || Number(version)!==item.version) fail('Reload the published announcement before archiving',409)
      await tx.query("UPDATE announcements SET status='archived',archived_at=NOW(),updated_at=NOW(),version=version+1 WHERE id=$1",[id])
      await audit(tx,actor,'archive_announcement',id)
      return getWith(tx,id,actor)
    })
  }
  async function markRead(id, actor) {
    id=positiveId(id)
    const result=await db.query(`UPDATE announcement_recipients r SET read_at=COALESCE(read_at,NOW())
      FROM announcements a WHERE a.id=r.announcement_id AND a.id=$1 AND a.status<>'draft' AND r.employee_id=$2 RETURNING r.read_at`,[id,actor.employee_id || null])
    if (!result.rows.length) fail('Announcement not found',404)
    return result.rows[0]
  }
  return { audience,list,get:(id,actor)=>getWith(db,id,actor),save,publish,archive,markRead }
}

module.exports = { createAnnouncementService, validateAnnouncement }
