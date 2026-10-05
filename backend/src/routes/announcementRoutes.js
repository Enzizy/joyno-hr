const express = require('express')
const { ALL_ROLES, MANAGEMENT_ROLES } = require('../constants/roles')

function createAnnouncementRouter({ service, authRequired, requireRole }) {
  const router=express.Router()
  const handle=fn=>async(req,res)=>{try{res.set('Cache-Control','private, no-store');res.json(await fn(req))}catch(error){
    if (!error.status) console.error('Announcement operation failed:',error.message)
    res.status(error.status || 500).json({message:error.status?error.message:'Unable to complete the announcement. Please try again'})
  }}
  router.get('/api/announcements/audience',authRequired,requireRole(MANAGEMENT_ROLES),handle(()=>service.audience()))
  router.get('/api/announcements',authRequired,requireRole(ALL_ROLES),handle(req=>service.list(req.query,req.user)))
  router.get('/api/announcements/:id',authRequired,requireRole(ALL_ROLES),handle(req=>service.get(req.params.id,req.user)))
  router.post('/api/announcements',authRequired,requireRole(MANAGEMENT_ROLES),handle(req=>service.save(req.body,req.user)))
  router.put('/api/announcements/:id',authRequired,requireRole(MANAGEMENT_ROLES),handle(req=>service.save(req.body,req.user,req.params.id)))
  router.post('/api/announcements/:id/publish',authRequired,requireRole(MANAGEMENT_ROLES),handle(req=>service.publish(req.params.id,req.body?.version,req.user)))
  router.post('/api/announcements/:id/archive',authRequired,requireRole(MANAGEMENT_ROLES),handle(req=>service.archive(req.params.id,req.body?.version,req.user)))
  router.post('/api/announcements/:id/read',authRequired,requireRole(ALL_ROLES),handle(req=>service.markRead(req.params.id,req.user)))
  return router
}
module.exports={createAnnouncementRouter}
