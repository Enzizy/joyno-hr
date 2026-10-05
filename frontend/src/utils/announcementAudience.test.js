import test from 'node:test'
import assert from 'node:assert/strict'
import { filterAnnouncementAudience,toggleMatchingRecipients } from './announcementAudience.js'

const people=[
 {id:1,first_name:'Ana',last_name:'One',employee_code:'001',shift:'day',department:'HR'},
 {id:2,first_name:'Ben',last_name:'Two',employee_code:'002',shift:'night',department:'HR'},
 {id:3,first_name:'Cara',last_name:'Three',employee_code:'003',shift:'day',department:'Sales'},
 {id:4,first_name:'Dan',last_name:'Four',employee_code:'004',shift:'night',department:'Sales'},
]
test('announcement audience intersects shift, department and case-insensitive employee search',()=>{
 assert.deepEqual(filterAnnouncementAudience(people,{shift:'day',department:'HR'}).map(p=>p.id),[1])
 assert.deepEqual(filterAnnouncementAudience(people,{shift:'night',department:'Sales',search:' FOUR '}).map(p=>p.id),[4])
 assert.deepEqual(filterAnnouncementAudience(people,{search:'003'}).map(p=>p.id),[3])
 assert.deepEqual(filterAnnouncementAudience(people,{shift:'night',search:'Ana'}),[])
})
test('select all adds only matching employees without clearing other selected departments or shifts',()=>{
 const selected=toggleMatchingRecipients([2],filterAnnouncementAudience(people,{shift:'day'}).map(p=>p.id))
 assert.deepEqual(selected,[2,1,3])
 assert.deepEqual(toggleMatchingRecipients(selected,[1,3]),[2])
 assert.deepEqual(toggleMatchingRecipients([2],[]),[2])
})
test('partial matching selection completes the whole filtered group and deduplicates IDs',()=>{
 assert.deepEqual(toggleMatchingRecipients([1,4],[1,3,3]),[1,4,3])
})
