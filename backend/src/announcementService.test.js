const test=require('node:test'),assert=require('node:assert/strict')
const {createAnnouncementService,validateAnnouncement}=require('./services/announcementService')

test('announcement validation requires a useful message and explicit valid recipients',()=>{
 assert.deepEqual(validateAnnouncement({title:' Update ',body:' Details ',recipientIds:[1,'1',2]}),{title:'Update',body:'Details',priority:'normal',recipientIds:[1,2]})
 for(const input of [{},{title:'',body:'ok',recipientIds:[1]},{title:'Hi',body:' ',recipientIds:[1]},{title:'Hi',body:'ok',recipientIds:[]},{title:'Hi',body:'ok',recipientIds:[0]},{title:'Hi',body:'ok',recipientIds:[1],priority:'urgent'},{title:'Hi',body:'x'.repeat(10001),recipientIds:[1]}])assert.throws(()=>validateAnnouncement(input),error=>error.status===400)
})
test('employees cannot save, publish or archive announcements even through the service directly',async()=>{
 const service=createAnnouncementService({db:{transaction:()=>{throw Error('Database must not be called')}}}),actor={id:2,role:'employee',employee_id:1}
 await assert.rejects(service.save({title:'Update',body:'Details',recipientIds:[1]},actor),error=>error.status===403)
 await assert.rejects(service.publish(1,1,actor),error=>error.status===403)
 await assert.rejects(service.archive(1,1,actor),error=>error.status===403)
})
test('employee feed SQL scopes every result to that employee and hides drafts and audience statistics',async()=>{
 const queries=[],service=createAnnouncementService({db:{query:async(sql,params)=>{queries.push({sql,params});return {rows:sql.includes('COUNT(*)::integer AS total')?[{total:0}]:[]}}}})
 await service.list({status:'all',shift:'night',department:'HR'},{id:2,role:'employee',employee_id:7})
 assert.equal(queries.length,2)
 for(const q of queries){assert.match(q.sql,/a.status<>'draft'/);assert.match(q.sql,/own.employee_id=\$1/);assert.equal(q.params[0],7)}
 assert.doesNotMatch(queries[1].sql,/recipient_count|f.department|f.shift/)
})
test('shift and department filters match the same recipient instead of two different employees',async()=>{
 const queries=[],service=createAnnouncementService({db:{query:async(sql,params)=>{queries.push({sql,params});return {rows:sql.includes('COUNT(*)::integer AS total')?[{total:0}]:[]}}}})
 await service.list({shift:'day',department:'HR'},{id:1,role:'hr'})
 assert.match(queries[0].sql,/f.shift=\$1 AND f.department=\$2/)
 assert.deepEqual(queries[0].params,['day','HR'])
})
