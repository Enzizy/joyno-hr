<script setup>
import { computed,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { isManagementRole } from '@/utils/roles'
import { getAnnouncementAudience,listAnnouncements,getAnnouncement,saveAnnouncement,publishAnnouncement,archiveAnnouncement,readAnnouncement } from '@/services/api'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppButton from '@/components/ui/AppButton.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppConfirmModal from '@/components/ui/AppConfirmModal.vue'
import NavIcon from '@/components/layout/NavIcon.vue'
import AnnouncementEditorModal from '@/components/announcements/AnnouncementEditorModal.vue'

const auth=useAuthStore(),toast=useToastStore(),route=useRoute(),router=useRouter()
const canManage=computed(()=>isManagementRole(auth.role))
const items=ref([]),total=ref(0),people=ref([]),loading=ref(true),busy=ref(false),error=ref(''),editorError=ref('')
const status=ref('published'),shift=ref('all'),department=ref(''),search=ref(''),page=ref(1),limit=12
const editorOpen=ref(false),editing=ref(null),detail=ref(null),detailLoading=ref(false),archiveOpen=ref(false),clientKey=ref('')
const departments=computed(()=>[...new Set(people.value.map(p=>p.department))].sort((a,b)=>a.localeCompare(b)))
const tabs=computed(()=>canManage.value?[{id:'published',label:'Published'},{id:'draft',label:'Drafts'},{id:'archived',label:'Archived'},{id:'all',label:'All'}]:[{id:'published',label:'Latest'},{id:'archived',label:'Archive'}])
const totalPages=computed(()=>Math.max(1,Math.ceil(total.value/limit)))
let timer,loadSequence=0
function date(value){return value?new Intl.DateTimeFormat('en-PH',{month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'}).format(new Date(value)):''}
async function load(){
 const sequence=++loadSequence;loading.value=true;error.value=''
 try{const data=await listAnnouncements({status:status.value,shift:canManage.value?shift.value:undefined,department:canManage.value?department.value:undefined,search:search.value.trim(),limit,offset:(page.value-1)*limit});if(sequence===loadSequence){items.value=data.items;total.value=data.total}}
 catch(e){if(sequence===loadSequence)error.value=e.message}finally{if(sequence===loadSequence)loading.value=false}
}
function filter(){page.value=1;clearTimeout(timer);timer=setTimeout(load,200)}
function chooseTab(value){status.value=value;page.value=1;clearTimeout(timer);load()}
async function editor(item=null){
 busy.value=true;error.value='';editorError.value=''
 try{people.value=await getAnnouncementAudience();editing.value=item?.id?await getAnnouncement(item.id):null;clientKey.value=crypto.randomUUID();detail.value=null;editorOpen.value=true}
 catch(e){error.value=e.message}finally{busy.value=false}
}
async function save(payload){
 busy.value=true;editorError.value=''
 try{
  let saved=await saveAnnouncement({...payload,clientKey:clientKey.value,version:editing.value?.version},editing.value?.id)
  editing.value=saved
  if(payload.publish)saved=await publishAnnouncement(saved.id,saved.version)
  editorOpen.value=false;editing.value=null;status.value=payload.publish?'published':'draft';page.value=1
  if(payload.publish && saved.email_delivery?.status==='not_configured')toast.warning('Announcement published in the app. Emails were not sent because email delivery is not configured.',10000)
  else if(payload.publish && saved.email_delivery?.status==='failed')toast.warning('Announcement published in the app, but email scheduling failed. Contact your administrator.',10000)
  else toast.success(payload.publish?'Announcement published to the selected employees':'Draft saved. Employees cannot see it yet')
  await load();if(payload.publish)await open(saved.id)
 }catch(e){editorError.value=e.message}finally{busy.value=false}
}
async function open(id){
 detailLoading.value=true;error.value=''
 try{
  const item=await getAnnouncement(id)
  const ownRecipient=canManage.value?item.recipients.find(p=>Number(p.employee_id)===Number(auth.user?.employee_id)):item
  if(item.status!=='draft' && ownRecipient && !ownRecipient.read_at){
   ownRecipient.read_at=(await readAnnouncement(id)).read_at
   const card=items.value.find(a=>Number(a.id)===Number(id))
   if(card){if(canManage.value)card.read_count=Number(card.read_count || 0)+1;else card.read_at=ownRecipient.read_at}
  }
  detail.value=item
 }
 catch(e){error.value=e.message}finally{detailLoading.value=false}
}
async function closeDetail(){detail.value=null;if(route.query.announcement){const query={...route.query};delete query.announcement;await router.replace({query})}}
async function archive(){
 busy.value=true;error.value=''
  try{await archiveAnnouncement(detail.value.id,detail.value.version);archiveOpen.value=false;await closeDetail();page.value=1;toast.success('Announcement moved to the archive');await load()}
 catch(e){archiveOpen.value=false;error.value=e.message}finally{busy.value=false}
}
onMounted(async()=>{if(canManage.value){try{people.value=await getAnnouncementAudience()}catch(e){error.value=e.message}}await load();if(route.query.announcement)await open(route.query.announcement)})
watch(()=>route.query.announcement,id=>{if(id && String(detail.value?.id)!==String(id))open(id)})
onBeforeUnmount(()=>{clearTimeout(timer);loadSequence++})
</script>

<template>
 <div class="mx-auto max-w-6xl space-y-6">
  <PageHeader title="Announcements"><template v-if="canManage" #actions><AppButton :loading="busy" @click="editor()"><span class="text-lg leading-none">+</span> Create announcement</AppButton></template></PageHeader>
  <div class="flex flex-wrap gap-2 border-b border-gray-800 pb-4" aria-label="Announcement status"><button v-for="tab in tabs" :key="tab.id" class="rounded-lg px-4 py-2 text-sm font-medium" :class="status===tab.id?'bg-primary-500 text-black':'bg-gray-900 text-gray-400 hover:text-gray-100'" :aria-pressed="status===tab.id" @click="chooseTab(tab.id)">{{tab.label}}</button></div>
  <div class="flex flex-wrap gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4"><label class="min-w-48 flex-1 text-xs text-gray-400">Search announcements<input v-model="search" class="form-control mt-1.5" placeholder="Search a title or message" @input="filter"></label><template v-if="canManage"><label class="min-w-36 flex-1 text-xs text-gray-400">Recipient shift<select v-model="shift" class="form-control mt-1.5" @change="filter"><option value="all">Both shifts</option><option value="day">Day shift</option><option value="night">Night shift</option></select></label><label class="min-w-40 flex-1 text-xs text-gray-400">Recipient department<select v-model="department" class="form-control mt-1.5" @change="filter"><option value="">All departments</option><option v-for="d in departments" :key="d">{{d}}</option></select></label></template></div>
  <p v-if="error" role="alert" class="rounded-xl border border-red-800/50 p-4 text-sm text-red-200">{{error}} <button class="underline" @click="load">Try again</button></p>
  <div v-if="loading" class="rounded-xl border border-gray-800 p-8 text-sm text-gray-400" role="status">Loading announcements…</div>
  <template v-else>
   <div class="flex items-center justify-between"><p class="text-sm text-gray-400">{{total}} {{total===1?'announcement':'announcements'}}<span v-if="search || shift!=='all' || department"> matching your filters</span></p></div>
   <div v-if="items.length" class="grid gap-4 md:grid-cols-2">
    <button v-for="item in items" :key="item.id" class="group flex flex-col rounded-2xl border bg-gray-900/50 p-5 text-left transition hover:border-primary-500/50 hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" :class="item.priority==='important'?'border-primary-500/25':'border-gray-800'" :aria-label="`Open announcement: ${item.title}`" @click="open(item.id)">
     <div class="mb-4 flex flex-wrap items-center gap-2"><StatusBadge :status="item.status" /><StatusBadge v-if="item.priority==='important'" status="important" /><StatusBadge v-if="!canManage && !item.read_at" status="unread" /><span class="ml-auto text-xs text-gray-500">{{date(item.published_at || item.created_at)}}</span></div>
     <h2 class="break-words text-lg font-semibold text-gray-100 group-hover:text-primary-300">{{item.title}}</h2><p class="mt-2 mb-5 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-400">{{item.excerpt}}</p>
     <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 pt-3 text-xs text-gray-500"><span>{{item.author_name}}</span><span v-if="canManage">{{item.recipient_count}} recipients<span v-if="item.status!=='draft'"> · {{item.read_count}} read</span></span><span v-else>{{item.read_at?'Read':'Open update'}} →</span></div><p v-if="canManage" class="mt-2 text-xs text-gray-500">{{(item.shifts || []).map(s=>s==='night'?'Night':'Day').join(' + ')}} · {{item.departments?.length || 0}} departments</p>
    </button>
   </div>
   <div v-else class="flex flex-col items-center rounded-2xl border border-dashed border-gray-700 bg-gray-900/30 px-6 py-14 text-center"><span class="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-500/20 bg-primary-500/5 text-primary-300"><NavIcon name="announcement" /></span><h2 class="text-lg font-semibold text-gray-200">{{search || department || shift!=='all'?'No announcements match':status==='draft'?'No drafts yet':status==='archived'?'No archived announcements':'No announcements yet'}}</h2><p class="mt-2 max-w-sm text-sm leading-6 text-gray-500">{{search || department || shift!=='all'?'Try another shift, department or search.':canManage?'Share a company update in three steps: message, audience, then review.':'Updates addressed to you will appear here when HR publishes them.'}}</p><AppButton v-if="canManage && !search && !department && shift==='all'" variant="secondary" class="mt-5" @click="editor()">Create announcement</AppButton></div>
   <div v-if="totalPages>1" class="flex items-center justify-between"><AppButton variant="secondary" :disabled="page===1" @click="page--;load()">Previous</AppButton><p class="text-xs text-gray-500">Page {{page}} of {{totalPages}}</p><AppButton variant="secondary" :disabled="page===totalPages" @click="page++;load()">Next</AppButton></div>
  </template>
  <p v-if="detailLoading" role="status" class="text-sm text-gray-400">Opening announcement…</p>
  <AnnouncementEditorModal :show="editorOpen" :announcement="editing" :people="people" :saving="busy" :error="editorError" @close="editorOpen=false" @save="save" />
  <AppModal :show="Boolean(detail) && !archiveOpen" title="Announcement" size="lg" @close="closeDetail">
   <template v-if="detail"><div class="mb-3 flex gap-2 text-xs"><StatusBadge :status="detail.status" /><StatusBadge v-if="detail.priority==='important'" status="important" /></div><h2 class="break-words text-2xl font-semibold text-gray-100">{{detail.title}}</h2><p class="mt-2 text-xs text-gray-500">{{detail.author_name}} · {{date(detail.published_at || detail.created_at)}}</p><p class="mt-6 whitespace-pre-wrap break-words text-sm leading-7 text-gray-300">{{detail.body}}</p><section v-if="canManage" class="mt-6 border-t border-gray-800 pt-4"><h3 class="text-sm font-semibold text-gray-200">{{detail.recipients.length}} recipients<span v-if="detail.status!=='draft'" class="font-normal text-gray-500"> · {{detail.recipients.filter(p=>p.read_at).length}} read</span></h3><details class="mt-2"><summary class="cursor-pointer text-xs text-primary-300">View audience{{detail.status!=='draft'?' and read status':''}}</summary><ul class="mt-3 max-h-56 overflow-y-auto divide-y divide-gray-800 text-xs"><li v-for="p in detail.recipients" :key="p.employee_id" class="flex justify-between gap-3 py-2"><span class="text-gray-300">{{p.employee_name}}<span class="block text-gray-500">{{p.department}} · {{p.shift}}</span></span><span class="text-gray-500">{{p.read_at?'Read':!p.has_account?'No login yet':detail.status==='draft'?'Selected':'Unread'}}</span></li></ul></details></section></template>
   <template #footer><AppButton v-if="canManage && detail?.status==='draft'" @click="editor(detail)">Edit draft</AppButton><AppButton v-if="canManage && detail?.status==='published'" variant="secondary" @click="archiveOpen=true">Archive</AppButton><AppButton variant="ghost" @click="closeDetail">Close</AppButton></template>
  </AppModal>
  <AppConfirmModal :show="archiveOpen" title="Archive announcement?" message="This moves the update out of Latest. Its message, audience and read history stay available in the archive." confirm-text="Archive" :loading="busy" @close="archiveOpen=false" @confirm="archive" />
 </div>
</template>
