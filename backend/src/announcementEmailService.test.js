const test=require('node:test'),assert=require('node:assert/strict')
const {createAnnouncementEmailSender}=require('./services/announcementEmailService')

test('announcement emails reuse the notification helper, target the saved audience and deduplicate CEO overlap',async()=>{
 const queries=[],messages=[]
 const send=createAnnouncementEmailSender({
  db:{query:async(sql,params)=>{queries.push({sql,params});return {rows:[
   {id:2,email:'ana@example.test',name:'Ana Fixture'},
   {id:4,email:'ceo@example.test',name:'CEO'},
   {id:5,email:'ANA@example.test',name:'Selected CEO'},
  ]}}},
  sendEmailNotification:async message=>messages.push(message),frontendOrigin:'https://hr.example.test',
 })
 await send({id:12,title:'Team update',body:'First line\nSecond line',priority:'important',author_name:'HR',notify_ceo:true})
 assert.deepEqual(queries[0].params,[12,true])
 assert.match(queries[0].sql,/r.announcement_id=\$1 AND r.employee_id=u.employee_id/)
 assert.match(queries[0].sql,/\$2::boolean AND LOWER\(u.role\)='ceo'/)
 assert.deepEqual(messages.map(m=>m.to),['ana@example.test','ceo@example.test'])
 assert.equal(messages[0].category,'system')
 assert.equal(messages[0].subject,'Announcement: Team update')
 assert.match(messages[0].text,/Hi Ana Fixture,/)
 assert.match(messages[0].text,/First line\nSecond line/)
 assert.equal(messages[0].linkLabels['https://hr.example.test/announcements?announcement=12'],'View announcement')
})

test('no linked email contacts schedules no delivery',async()=>{
 const send=createAnnouncementEmailSender({db:{query:async(sql,params)=>{
  assert.deepEqual(params,[13,false]);assert.match(sql,/NULLIF\(TRIM\(u.email\),''\) IS NOT NULL/);return {rows:[]}
 }},sendEmailNotification:()=>assert.fail('No mail should be scheduled'),frontendOrigin:'https://hr.example.test'})
 await send({id:13,notify_ceo:false})
})
