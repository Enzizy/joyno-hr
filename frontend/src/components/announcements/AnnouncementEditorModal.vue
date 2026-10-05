<script setup>
import { computed,nextTick,onBeforeUnmount,ref,watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { filterAnnouncementAudience,toggleMatchingRecipients } from '@/utils/announcementAudience'

const props=defineProps({show:Boolean,announcement:Object,people:{type:Array,default:()=>[]},saving:Boolean,error:String})
const emit=defineEmits(['close','save'])
const step=ref(1),title=ref(''),body=ref(''),priority=ref('normal'),selectedIds=ref([]),shift=ref('all'),department=ref(''),search=ref(''),validation=ref(''),heading=ref(null)
const departments=computed(()=>[...new Set(props.people.map(p=>p.department))].sort((a,b)=>a.localeCompare(b)))
const matching=computed(()=>filterAnnouncementAudience(props.people,{shift:shift.value,department:department.value,search:search.value}))
const selected=computed(()=>props.people.filter(p=>selectedIds.value.includes(Number(p.id))))
const unavailable=computed(()=>selectedIds.value.filter(id=>!props.people.some(p=>Number(p.id)===id)))
const allMatching=computed(()=>matching.value.length>0 && matching.value.every(p=>selectedIds.value.includes(Number(p.id))))
const selectedOutside=computed(()=>selected.value.filter(p=>!matching.value.some(m=>m.id===p.id)).length)
const withoutAccount=computed(()=>selected.value.filter(p=>!p.has_account).length)
const dayCount=computed(()=>selected.value.filter(p=>p.shift==='day').length),nightCount=computed(()=>selected.value.filter(p=>p.shift==='night').length)
const selectedDepartments=computed(()=>[...new Set(selected.value.map(p=>p.department))].sort())
const dirty=computed(()=>title.value.trim() || body.value.trim() || selectedIds.value.length)
const discarding=ref(false)
let previousFocus
watch(()=>props.show,async(show)=>{
  if(!show){previousFocus?.focus();return}
  previousFocus=document.activeElement
  step.value=1;validation.value='';discarding.value=false;shift.value='all';department.value='';search.value=''
  title.value=props.announcement?.title || '';body.value=props.announcement?.body || '';priority.value=props.announcement?.priority || 'normal'
  selectedIds.value=(props.announcement?.recipients || []).map(p=>Number(p.employee_id))
  await nextTick();heading.value?.focus()
})
async function go(next){
  validation.value=''
  if(next>step.value && step.value===1 && (!title.value.trim() || !body.value.trim())){validation.value='Add a title and message before choosing recipients.';return}
  if(next>step.value && step.value===2 && (!selectedIds.value.length || unavailable.value.length)){validation.value=unavailable.value.length?'Remove unavailable employees before continuing.':'Choose at least one employee.';return}
  step.value=next;await nextTick();heading.value?.focus()
}
function toggle(id){selectedIds.value=selectedIds.value.includes(Number(id))?selectedIds.value.filter(x=>x!==Number(id)):[...selectedIds.value,Number(id)]}
function close(){if(props.saving)return;if(dirty.value)discarding.value=true;else emit('close')}
function save(publish){emit('save',{title:title.value.trim(),body:body.value.trim(),priority:priority.value,recipientIds:[...selectedIds.value],publish})}
function trapFocus(event){
  if(event.key!=='Tab')return
  const dialog=heading.value?.closest('[role="dialog"]')
  const controls=[...dialog?.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]') || []].filter(el=>el.getClientRects().length)
  if(!controls.length)return
  if(event.shiftKey && (document.activeElement===controls[0] || document.activeElement===heading.value)){event.preventDefault();controls.at(-1).focus()}
  else if(!event.shiftKey && document.activeElement===controls.at(-1)){event.preventDefault();controls[0].focus()}
}
watch(()=>props.show,show=>{if(show)document.addEventListener('keydown',trapFocus);else document.removeEventListener('keydown',trapFocus)})
onBeforeUnmount(()=>document.removeEventListener('keydown',trapFocus))
</script>

<template>
 <AppModal :show="show" :title="announcement ? 'Edit announcement' : 'Create announcement'" size="lg" @close="close">
  <ol class="mb-6 grid grid-cols-3 gap-2" aria-label="Announcement steps">
   <li v-for="(label,index) in ['Message','Audience','Review']" :key="label" class="flex items-center gap-2 border-b-2 pb-3 text-sm" :class="step===index+1?'border-primary-500 text-primary-300':'border-gray-800 text-gray-500'" :aria-current="step===index+1?'step':undefined"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs" :class="step>=index+1?'bg-primary-500 text-black':'bg-gray-800 text-gray-400'">{{step>index+1?'✓':index+1}}</span>{{label}}</li>
  </ol>
  <div v-if="discarding" class="mb-5 rounded-xl border border-amber-800/50 bg-amber-950/20 p-4" role="alert"><p class="font-medium text-amber-200">Close without saving?</p><p class="mt-1 text-sm text-gray-400">Your unsaved changes will be discarded.</p><div class="mt-3 flex gap-2"><AppButton size="sm" variant="secondary" @click="discarding=false">Keep editing</AppButton><AppButton size="sm" variant="ghost" @click="emit('close')">Discard changes</AppButton></div></div>
  <h2 ref="heading" tabindex="-1" class="text-xl font-semibold text-gray-100 outline-none">{{step===1?'What do employees need to know?':step===2?'Who should receive this?':'Ready to share?'}}</h2>
  <p class="mt-1 mb-5 text-sm text-gray-400">{{step===1?'Keep the title clear and put the useful details in your message.':step===2?'Filter the list, then select employees. You can add more from another group.':'Check the message and recipients before publishing.'}}</p>
  <p v-if="validation || error" role="alert" class="mb-4 rounded-lg border border-red-800/50 p-3 text-sm text-red-200">{{validation || error}}</p>
  <div v-if="step===1" class="space-y-5">
   <label class="block text-sm font-medium text-gray-300">Title <span class="text-red-400">*</span><input v-model="title" maxlength="180" class="form-control mt-2" placeholder="e.g. Team update for October" :disabled="saving"></label>
   <label class="block text-sm font-medium text-gray-300">Message <span class="text-red-400">*</span><textarea v-model="body" maxlength="10000" rows="7" class="form-control mt-2 min-h-40 resize-y leading-relaxed" placeholder="Share the update, important dates, and anything employees need to do." :disabled="saving"/><span class="mt-1 block text-right text-xs font-normal text-gray-500">{{body.length.toLocaleString()}} / 10,000</span></label>
   <fieldset><legend class="mb-2 text-sm font-medium text-gray-300">Priority</legend><div class="flex gap-2"><button v-for="p in ['normal','important']" :key="p" type="button" class="rounded-lg border px-4 py-2 text-sm capitalize" :class="priority===p?'border-primary-500 bg-primary-500/10 text-primary-300':'border-gray-700 text-gray-400'" :aria-pressed="priority===p" @click="priority=p">{{p==='normal'?'Standard':'Important'}}</button></div></fieldset>
  </div>
  <div v-else-if="step===2" class="space-y-4">
   <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-500/20 bg-primary-500/5 px-4 py-3" aria-live="polite"><div><span class="font-semibold text-primary-300">{{selectedIds.length}} selected</span><span v-if="selectedOutside" class="ml-2 text-xs text-gray-400">{{selectedOutside}} outside these filters</span></div><button v-if="selectedIds.length" type="button" class="text-xs text-gray-400 underline hover:text-gray-100" @click="selectedIds=[]">Clear selection</button></div>
   <div class="flex gap-2" role="group" aria-label="Recipient shift"><button v-for="s in ['all','day','night']" :key="s" type="button" class="flex-1 rounded-lg border px-3 py-2 text-sm" :class="shift===s?'border-primary-500 bg-primary-500/10 text-primary-300':'border-gray-700 text-gray-400'" :aria-pressed="shift===s" @click="shift=s">{{s==='all'?'Both shifts':s==='day'?'Day shift':'Night shift'}}</button></div>
   <div class="grid grid-cols-2 gap-3"><label class="min-w-0 text-sm text-gray-300">Department<select v-model="department" class="form-control mt-1.5"><option value="">All departments</option><option v-for="d in departments" :key="d">{{d}}</option></select></label><label class="min-w-0 text-sm text-gray-300">Find an employee<input v-model="search" class="form-control mt-1.5" placeholder="Name or ID"></label></div>
   <div class="overflow-hidden rounded-xl border border-gray-800"><div class="flex items-center justify-between gap-2 border-b border-gray-800 bg-gray-950/40 px-4 py-3"><span class="text-xs text-gray-400">{{matching.length}} matching employees</span><button type="button" :disabled="!matching.length" class="text-sm font-semibold text-primary-300 disabled:opacity-40" @click="selectedIds=toggleMatchingRecipients(selectedIds,matching.map(p=>p.id))">{{allMatching?'Deselect matching':`Select all ${matching.length} matching`}}</button></div>
    <div class="max-h-64 overflow-y-auto"><label v-for="p in matching" :key="p.id" class="flex cursor-pointer items-center gap-3 border-b border-gray-800/60 px-4 py-3 last:border-0 hover:bg-gray-800/40" :class="selectedIds.includes(Number(p.id))?'bg-primary-500/5':''"><input type="checkbox" :checked="selectedIds.includes(Number(p.id))" :aria-label="`Select ${p.first_name} ${p.last_name}`" class="h-4 w-4 shrink-0 accent-primary-500" @change="toggle(p.id)"><span class="min-w-0 flex-1"><span class="block text-sm font-medium text-gray-200">{{p.first_name}} {{p.last_name}}</span><span class="mt-0.5 block text-xs text-gray-500">{{p.department}} · ID {{p.employee_code}}<span v-if="!p.has_account"> · No login yet</span></span></span><span class="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-400">{{p.shift==='night'?'Night':'Day'}}</span></label><p v-if="!matching.length" class="px-4 py-10 text-center text-sm text-gray-500">No employees match. Try another shift, department or name.</p></div>
   </div>
   <p class="text-xs text-gray-500">Select all applies to the filtered list. Changing filters keeps your existing selections.</p>
   <p v-if="unavailable.length" class="rounded-lg border border-amber-800/50 p-3 text-sm text-amber-200">{{unavailable.length}} previously selected employees are no longer available. <button class="underline" @click="selectedIds=selectedIds.filter(id=>!unavailable.includes(id))">Remove unavailable employees</button></p>
  </div>
  <div v-else class="space-y-5">
   <article class="rounded-xl border border-gray-700 bg-gray-950/40 p-5"><span v-if="priority==='important'" class="mb-3 inline-block rounded-full bg-primary-500/15 px-2.5 py-1 text-xs font-medium text-primary-300">Important</span><h3 class="break-words text-xl font-semibold text-gray-100">{{title}}</h3><p class="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-gray-300">{{body}}</p></article>
   <section class="rounded-xl border border-gray-800 p-4"><div class="flex items-center justify-between"><h3 class="font-semibold text-gray-200">{{selected.length}} recipients</h3><button class="text-sm text-primary-300" @click="go(2)">Edit audience</button></div><p class="mt-2 text-sm text-gray-400">{{dayCount}} day shift · {{nightCount}} night shift</p><div class="mt-3 flex flex-wrap gap-2"><span v-for="d in selectedDepartments" :key="d" class="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-400">{{d}}</span></div><details class="mt-3"><summary class="cursor-pointer text-xs text-gray-400">View selected employees</summary><ul class="mt-2 max-h-40 overflow-y-auto space-y-1 text-xs text-gray-400"><li v-for="p in selected" :key="p.id">{{p.first_name}} {{p.last_name}} · {{p.department}} · {{p.shift}}</li></ul></details></section>
   <p class="text-xs leading-5 text-gray-500">Publishing adds this announcement to the selected employees’ page and sends an in-app notification. <span v-if="withoutAccount">{{withoutAccount}} selected employees have no login yet; they can view it once an account is linked.</span> A saved draft is visible only to HR/Admin/CEO.</p>
  </div>
  <template #footer><div class="flex w-full flex-wrap items-center justify-between gap-3"><AppButton variant="ghost" :disabled="saving" @click="step===1?close():go(step-1)">{{step===1?'Cancel':'← Back'}}</AppButton><div class="flex gap-2"><template v-if="step===3"><AppButton variant="secondary" :disabled="saving" @click="save(false)">Save draft</AppButton><AppButton :loading="saving" @click="save(true)">Publish announcement</AppButton></template><AppButton v-else :disabled="saving" @click="go(step+1)">{{step===1?'Choose audience →':'Review announcement →'}}</AppButton></div></div></template>
 </AppModal>
</template>
