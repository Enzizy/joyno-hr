<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import PayRunNextStep from '@/components/payroll/PayRunNextStep.vue'
import { getPayrollPayslipPdf, getPayrollPayslipsPdf, getPayslipDeliveries, lockPayrollRun, recordPayrollPayment, removeTestPayslips, sendPayrollPayslip } from '@/services/api'
import { useToastStore } from '@/stores/toastStore'

// The workbook's PAYSLIP01 (everyone) and PAYSLIP02 (one person, by filter) in one page:
// a searchable list with send status on the left, the selected payslip on the right.
// HR chooses an employee copy or a two-copy signing sheet. Email contains one employee copy.
// After approval HR chooses how payslips go out: release to My payslips (recording the date paid)
// and/or email, in either order. Practice payslips become visible only to selected recipients after a send.
const props = defineProps({
  run: { type: Object, required: true },
  practice: Boolean,
  canSend: Boolean,
  canRelease: Boolean,
})
const emit = defineEmits(['changed', 'review'])
const toast = useToastStore()

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const stamp = (value) => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const lines = computed(() => [...(props.run.lines || [])].sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name))))
const released = computed(() => props.run.status === 'locked' && Boolean(props.run.payment))
const approved = computed(() => ['approved', 'locked'].includes(props.run.status))
const netTotal = computed(() => Math.round(lines.value.reduce((sum, line) => sum + Number(line.net_pay || 0), 0) * 100) / 100)
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const deliveries = ref(new Map())
const removedAt = ref(null)
const search = ref('')
const emailFilter=ref('all'),copies=ref(2),mobilePreview=ref(false)
const selected = ref(new Set())
const currentId = ref(lines.value[0]?.id ?? null)
const busy = ref(false)
const progress = ref('')
const confirmSend = ref(null)
const confirmRemove = ref(false)

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return lines.value.filter(line=>(!q || `${line.employee_name} ${line.employee_code}`.toLowerCase().includes(q)) &&
    (emailFilter.value==='all' || (emailFilter.value==='pending' && !delivery(line).sentAt) ||
      (emailFilter.value==='issues' && (delivery(line).emailProblem || delivery(line).failed))))
})
const current = computed(() => lines.value.find((line) => line.id === currentId.value) || null)
const ticked = computed(() => lines.value.filter((line) => selected.value.has(line.id)))
const allShownTicked = computed(() => shown.value.length > 0 && shown.value.every((line) => selected.value.has(line.id)))
// Approved real pay can be emailed before or after release. Practice payslips wait for the practice run to finish.
const sendBlocked = computed(() => !props.canSend ? 'Sending real payslips is turned off for now.'
  : props.practice ? (!released.value ? 'Finish the practice run first.' : removedAt.value ? 'These test payslips were removed from employee pages.' : '')
  : !approved.value ? 'Approve pay first.' : '')
const delivery = (line) => deliveries.value.get(line.id) || {}
const sentCount = computed(() => lines.value.filter((line) => delivery(line).sentAt).length)
function statusOf(line) {
  const info = delivery(line)
  if (info.sentAt) return { tone: 'text-emerald-300', text: `Email sent ${stamp(info.sentAt)}` }
  if (info.emailProblem) return { tone: 'text-amber-300', text: `⚠ ${info.emailProblem}` }
  if (info.failed) return { tone: 'text-red-300', text: `✕ ${info.failed}` }
  return { tone: 'text-gray-500', text: 'Not emailed' }
}
const portalAvailable=line=>released.value && (!props.practice || (delivery(line).sentAt && !removedAt.value))

function toggle(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}
function toggleShown() {
  const next = new Set(selected.value)
  for (const line of shown.value) allShownTicked.value ? next.delete(line.id) : next.add(line.id)
  selected.value = next
}

async function loadDeliveries() {
  try {
    const result = await getPayslipDeliveries(props.run.id)
    const previous = deliveries.value
    deliveries.value = new Map(result.lines.map((entry) => [entry.lineId, { ...entry, failed: entry.sentAt ? '' : entry.failed || previous.get(entry.lineId)?.failed || '' }]))
    removedAt.value = result.testPayslipsRemovedAt
  } catch (error) { toast.error(error.message || 'Unable to load email status.') }
}

// The selected payslip, shown as the real PDF so it matches what is printed and emailed.
const pdfUrl = ref('')
const pdfLoading = ref(false)
let pdfRequest = 0
async function showPdf() {
  const line = current.value
  const request = ++pdfRequest
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = ''
  if (!line) return
  pdfLoading.value = true
  try {
    const blob = await getPayrollPayslipPdf(props.run.id, line.id, { copies: Number(copies.value) })
    if (request === pdfRequest) pdfUrl.value = URL.createObjectURL(blob)
  } catch (error) { if (request === pdfRequest) toast.error(error.message || 'Unable to load the payslip.') }
  finally { if (request === pdfRequest) pdfLoading.value = false }
}
watch(currentId, showPdf)
watch(copies,showPdf)
onMounted(() => { loadDeliveries(); showPdf() })
onBeforeUnmount(() => { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value) })

const fileStem = computed(() => `${props.practice ? 'TEST-' : ''}payslips-${String(props.run.payday || props.run.pay_date || '').slice(0, 10)}`)
// Opening the tab before the download keeps the browser from blocking it.
async function openPdf(load) {
  const tab = window.open('', '_blank')
  if (tab) tab.document.title = 'Loading payslips…'
  busy.value = true
  try {
    const url = URL.createObjectURL(await load())
    if (tab) tab.location.href = url
    else { savePdfUrl(url, `${fileStem.value}-print.pdf`); toast.success('The browser blocked the print tab, so the PDF was saved instead.') }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (error) { tab?.close(); toast.error(error.message || 'Unable to prepare the PDF.') }
  finally { busy.value = false }
}
function savePdfUrl(url, name) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
}
async function savePdf(load, name) {
  busy.value = true
  try {
    const url = URL.createObjectURL(await load())
    savePdfUrl(url, name)
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (error) { toast.error(error.message || 'Unable to save the PDF.') }
  finally { busy.value = false }
}
const code = (line) => String(line.employee_code || line.id).replace(/[^a-zA-Z0-9_-]/g, '_')
const printOne = () => openPdf(() => getPayrollPayslipPdf(props.run.id, current.value.id, { copies: Number(copies.value) }))
const saveOne = () => savePdf(() => getPayrollPayslipPdf(props.run.id, current.value.id, { copies: Number(copies.value) }), `${props.practice ? 'TEST-' : ''}payslip-${code(current.value)}-${String(props.run.payday).slice(0, 10)}.pdf`)
// With nobody ticked, actions apply to everyone (practice runs always need a pick: test payslips go only to chosen people).
const targets = computed(() => ticked.value.length ? ticked.value : props.practice ? [] : lines.value)
const unsentTargets = computed(() => targets.value.filter((line) => !delivery(line).sentAt))
const scope = computed(() => ticked.value.length ? 'selected' : 'all')
const emailLabel = computed(() => ticked.value.length ? `Email selected (${ticked.value.length})` : props.practice ? 'Email selected' : unsentTargets.value.length ? `Email all (${unsentTargets.value.length})` : 'Everyone emailed')
const printTargets = () => openPdf(() => getPayrollPayslipsPdf(props.run.id, { lineIds: targets.value.map((line) => line.id), copies: Number(copies.value) }))
const saveTargets = () => savePdf(() => getPayrollPayslipsPdf(props.run.id, { lineIds: targets.value.map((line) => line.id), copies: Number(copies.value) }), `${fileStem.value}.pdf`)
const previewActions=computed(()=>[{label:'Print this payslip',onSelect:printOne},{label:'Download this PDF',onSelect:saveOne}])

const releaseForm = ref(null)
function beginRelease() {
  const payday = String(props.run.payday || '').slice(0, 10)
  releaseForm.value = { reference: '', paidOn: payday && payday < today ? payday : today, alsoEmail: false, paid: Boolean(props.run.payment) }
}
async function release() {
  const form = releaseForm.value
  busy.value = true
  let run = props.run
  try {
    if (!run.payment) { const paid = await recordPayrollPayment(run.id, { paidOn: form.paidOn, reference: form.reference, expectedTotal: netTotal.value }); run = paid.run || paid }
    if (run.status !== 'locked') { const locked = await lockPayrollRun(run.id); run = locked.run || locked }
    releaseForm.value = null
    emit('changed', run)
    toast.success(props.practice ? 'Practice run finished. Tick who gets a test payslip.' : 'Released. Every employee can see their payslip in My payslips.')
    if (form.alsoEmail && !props.practice) askToSend(lines.value)
  } catch (error) {
    toast.error(error.message || 'Unable to release payslips.')
    emit('changed')
  } finally { busy.value = false }
}

// Sending: always confirm the exact people and addresses first; already-sent payslips are skipped.
function askToSend(list) {
  const pending = list.filter((line) => !delivery(line).sentAt)
  confirmSend.value = {
    ready: pending.filter((line) => delivery(line).email),
    missing: pending.filter((line) => !delivery(line).email),
    alreadySent: list.length - pending.length,
  }
}
async function send() {
  const list = confirmSend.value.ready
  confirmSend.value = null
  busy.value = true
  let sent = 0, failed = 0
  for (const [index, line] of list.entries()) {
    progress.value = `${index + 1} of ${list.length}`
    try {
      await sendPayrollPayslip(props.run.id, line.id)
      sent += 1
    } catch (error) {
      failed += 1
      deliveries.value = new Map(deliveries.value).set(line.id, { ...delivery(line), failed: error.message || 'Not sent' })
    }
  }
  progress.value = ''
  busy.value = false
  await loadDeliveries()
  emit('changed')
  selected.value = new Set(ticked.value.filter(line=>!delivery(line).sentAt).map(line=>line.id))
  toast[failed ? 'warning' : 'success'](failed ? `${sent} emailed, ${failed} failed. Press Email again to retry only the ones that failed.` : `${sent} ${sent === 1 ? 'payslip' : 'payslips'} emailed.`)
}
async function removeFromPages() {
  confirmRemove.value = false
  busy.value = true
  try {
    await removeTestPayslips(props.run.id)
    await loadDeliveries()
    toast.success('Test payslips removed from employee pages.')
  } catch (error) { toast.error(error.message || 'Unable to remove the test payslips.') }
  finally { busy.value = false }
}
</script>

<template>
  <section class="space-y-4">
    <div v-if="practice" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-800/50 bg-sky-950/20 px-4 py-3 text-sm">
      <p class="text-sky-100"><strong>Test payslips.</strong> Only selected recipients get a test payslip in My payslips and by email. Each is marked as a test, and emails start with [TEST].
        <span class="block text-xs text-sky-300">{{ removedAt ? `Removed from employee pages ${stamp(removedAt)}.` : `${sentCount} of ${lines.length} sent so far.` }}</span></p>
      <AppButton v-if="!released && approved" size="sm" :disabled="busy || !canRelease" @click="beginRelease">Finish practice run</AppButton>
      <AppButton v-else-if="sentCount && !removedAt" size="sm" variant="secondary" :disabled="busy" @click="confirmRemove = true">Remove from employee pages</AppButton>
    </div>
    <p v-else-if="released" class="rounded-xl border border-emerald-800/50 bg-emerald-950/15 px-4 py-3 text-sm text-emerald-200">Released to My payslips {{ stamp(run.locked_at) }} · every employee can see their payslip. Emailing is optional.</p>
    <section v-else-if="approved" class="rounded-xl border border-primary-700/60 bg-gray-900 p-5">
      <h2 class="font-semibold text-gray-100">Pay is approved · payslips are not out yet</h2>
      <p class="mt-1 text-sm text-gray-400">Choose how employees get their payslips: one or both, now or later. Print signing sheets any time below.</p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col rounded-lg border border-gray-800 p-4"><p class="font-medium text-gray-100">My payslips</p><p class="mt-1 flex-1 text-xs text-gray-400">Every employee sees their payslip on their own My payslips page. Records the date you paid.</p><AppButton class="mt-3 self-start" :disabled="busy || !canRelease" @click="beginRelease">Release to My payslips</AppButton></div>
        <div class="flex flex-col rounded-lg border border-gray-800 p-4"><p class="font-medium text-gray-100">Email</p><p class="mt-1 flex-1 text-xs text-gray-400">Each employee gets their own payslip by email. {{ sentCount }} of {{ lines.length }} emailed so far.</p><AppButton class="mt-3 self-start" variant="outline" :disabled="busy || Boolean(sendBlocked) || !unsentTargets.length" @click="askToSend(targets)">{{ emailLabel }}</AppButton></div>
      </div>
    </section>
    <p v-else class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-400">Pay is not approved yet. <button type="button" class="font-semibold text-primary-300 underline" @click="emit('review')">Go to Review &amp; approve</button></p>

    <h2 class="font-semibold text-gray-100">Payslips</h2>
    <p v-if="sendBlocked && approved" class="-mt-2 text-xs text-gray-500">{{ sendBlocked }}</p>

    <div class="flex flex-wrap items-center gap-3"><div role="group" aria-label="Email filter" class="flex gap-1"><button v-for="item in [{key:'all',label:'All'},{key:'pending',label:'Not emailed'},{key:'issues',label:'Email issues'}]" :key="item.key" class="rounded-lg px-3 py-2 text-xs font-semibold" :class="emailFilter===item.key?'bg-primary-500 text-gray-950':'bg-gray-800 text-gray-400'" :aria-pressed="emailFilter===item.key" @click="emailFilter=item.key">{{item.label}}</button></div><label class="flex items-center gap-2 text-xs text-gray-500">PDF format<select v-model.number="copies" class="form-control w-auto"><option :value="2">Signing sheet · two copies</option><option :value="1">Employee copy</option></select></label></div>
    <div class="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div class="overflow-hidden rounded-xl border border-gray-800 bg-gray-900" :class="mobilePreview?'hidden lg:block':''">
        <div class="border-b border-gray-800 p-3"><input v-model="search" type="search" placeholder="Find an employee" aria-label="Find an employee" class="form-control"></div>
        <label class="flex cursor-pointer items-center gap-3 border-b border-gray-800 px-3 py-2 text-xs text-gray-400"><input type="checkbox" :checked="allShownTicked" @change="toggleShown">Select all {{shown.length}} matching employees</label>
        <ul class="max-h-[34rem] divide-y divide-gray-800 overflow-y-auto">
          <li v-for="line in shown" :key="line.id" class="flex items-center gap-3 px-3 py-2.5" :class="line.id === currentId ? 'bg-primary-950/30' : 'hover:bg-gray-800/40'">
            <input type="checkbox" :checked="selected.has(line.id)" :aria-label="`Select ${line.employee_name}`" @change="toggle(line.id)">
            <button type="button" class="min-w-0 flex-1 text-left" @click="currentId = line.id;mobilePreview=true">
              <span class="block truncate text-sm font-medium" :class="line.id === currentId ? 'text-primary-200' : 'text-gray-100'">{{ line.employee_name }}</span>
              <span class="block text-[11px] text-gray-500">{{portalAvailable(line)?'In My payslips':practice?'Not published':'Not in My payslips yet'}}</span><span class="block truncate text-xs" :class="statusOf(line).tone">{{ statusOf(line).text }}</span>
            </button>
            <span class="shrink-0 text-xs font-semibold text-gray-300">{{ money(line.net_pay) }}</span>
          </li>
          <li v-if="!shown.length" class="px-3 py-4 text-sm text-gray-500">No one matches “{{ search }}”.</li>
        </ul>
      </div>

      <div class="min-h-[34rem] flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900" :class="mobilePreview?'flex':'hidden lg:flex'"><button class="px-4 py-3 text-left text-sm text-primary-300 lg:hidden" @click="mobilePreview=false">← Back to employees</button>
        <div v-if="current" class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <div class="min-w-0"><p class="truncate font-semibold text-gray-100">{{ current.employee_name }}</p><p class="truncate text-xs" :class="statusOf(current).tone">{{ delivery(current).email || statusOf(current).text }}</p></div>
          <MoreMenu label="More" :items="previewActions" />
        </div>
        <div class="flex-1 bg-gray-950">
          <p v-if="pdfLoading" class="p-6 text-sm text-gray-400" role="status">Loading payslip…</p>
          <iframe v-else-if="pdfUrl" :src="pdfUrl" :title="`Payslip for ${current?.employee_name}`" class="h-full min-h-[34rem] w-full" />
          <p v-else class="p-6 text-sm text-gray-500">Pick someone on the left.</p>
        </div>
      </div>
    </div>

    <PayRunNextStep :title="ticked.length ? `${ticked.length} of ${lines.length} selected` : practice ? 'Tick who gets a test payslip' : `${lines.length} payslips · ${released ? 'in My payslips' : 'not in My payslips yet'} · ${sentCount} emailed`" :detail="progress?`Sending ${progress}`:copies===2?'PDF: signing sheet, two copies per Legal page':'PDF: employee copy'">
      <AppButton v-if="ticked.length" size="sm" variant="outline" :disabled="busy" @click="selected = new Set()">Clear selection</AppButton>
      <AppButton size="sm" variant="outline" :disabled="busy || !targets.length" @click="printTargets">Print {{scope}}</AppButton>
      <AppButton size="sm" variant="outline" :disabled="busy || !targets.length" @click="saveTargets">Download {{scope}}</AppButton>
      <AppButton size="sm" :disabled="busy || !unsentTargets.length || Boolean(sendBlocked)" :title="sendBlocked || 'Emails each employee their own payslip'" @click="askToSend(targets)">{{emailLabel}}</AppButton>
    </PayRunNextStep>

    <AppModal :show="Boolean(confirmSend)" :title="practice ? 'Email test payslips' : 'Email payslips'" @close="confirmSend = null">
      <div v-if="confirmSend" class="space-y-4 text-sm">
        <p v-if="confirmSend.ready.length" class="text-gray-300">Each selected employee receives their own payslip by email.{{practice?' The test payslip also appears in their My payslips page.':released?' Their payslip is also in My payslips.':' It is not in My payslips until you release it there.'}} No one else receives anything.</p>
        <ul v-if="confirmSend.ready.length" class="max-h-64 divide-y divide-gray-800 overflow-y-auto rounded-lg border border-gray-800">
          <li v-for="line in confirmSend.ready" :key="line.id" class="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><span class="font-medium text-gray-100">{{ line.employee_name }}</span><span class="text-gray-400">{{ delivery(line).email }}</span></li>
        </ul>
        <p v-if="confirmSend.missing.length" class="text-amber-200">Not sent — no usable account email: {{ confirmSend.missing.map((line) => line.employee_name).join(', ') }}. Add their account email under Settings → Accounts.</p>
        <p v-if="confirmSend.alreadySent" class="text-gray-500">{{ confirmSend.alreadySent }} already sent; they are skipped.</p>
        <p v-if="!confirmSend.ready.length" class="text-gray-400">There is no one left to email.</p>
      </div>
      <template #footer><AppButton variant="secondary" @click="confirmSend = null">Cancel</AppButton><AppButton :disabled="!confirmSend?.ready.length" @click="send">Email {{ confirmSend?.ready.length || 0 }} {{confirmSend?.ready.length===1?'payslip':'payslips'}}</AppButton></template>
    </AppModal>

    <AppModal :show="Boolean(releaseForm)" :title="practice ? 'Finish practice run' : 'Release to My payslips'" @close="releaseForm = null">
      <div v-if="releaseForm" class="space-y-4 text-sm">
        <p class="text-gray-300">{{ practice ? 'Practice: nothing is paid. Test payslips then go only to the people you tick.' : `All ${lines.length} employees will see their payslip on their My payslips page.` }}</p>
        <template v-if="!releaseForm.paid">
          <label class="block text-gray-300">Date paid<input v-model="releaseForm.paidOn" type="date" :max="today" class="form-control mt-1.5 max-w-xs"></label>
          <label class="block text-gray-300">Bank reference <span class="text-gray-500">(optional)</span><input v-model="releaseForm.reference" maxlength="200" placeholder="e.g. the transfer or batch number" class="form-control mt-1.5"></label>
          <p class="text-xs text-gray-500">The system does not send money. The date records when you paid.</p>
        </template>
        <label v-if="!practice && !sendBlocked" class="flex items-center gap-2 text-gray-300"><input v-model="releaseForm.alsoEmail" type="checkbox"> Also email each employee their payslip</label>
      </div>
      <template #footer><AppButton variant="secondary" @click="releaseForm = null">Cancel</AppButton><AppButton :loading="busy" :disabled="!releaseForm?.paidOn" @click="release">{{ practice ? 'Finish practice run' : 'Release' }}</AppButton></template>
    </AppModal>

    <AppModal :show="confirmRemove" title="Remove test payslips from employee pages?" @close="confirmRemove = false">
      <p class="text-sm text-gray-300">The {{ sentCount }} test {{ sentCount === 1 ? 'payslip' : 'payslips' }} you sent will no longer show under My payslips, and this run's test payslips cannot be sent again. Emails already sent cannot be taken back.</p>
      <template #footer><AppButton variant="secondary" @click="confirmRemove = false">Keep them</AppButton><AppButton variant="danger" @click="removeFromPages">Remove</AppButton></template>
    </AppModal>
  </section>
</template>
