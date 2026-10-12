<script setup>
import { computed, ref } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import { payAmounts, payAttention } from '@/utils/payrollRegister'

const props = defineProps({ lines: {type:Array,default:()=>[]}, editable:Boolean, outdated:Boolean, downloads:Array, payday:String })
defineEmits(['preview','adjust','verify','attendance'])
const search = ref(''), filter = ref('all')
const money = value => `₱${Number(value || 0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const rows = computed(() => props.lines.map(line => ({line,amounts:payAmounts(line),issues:payAttention(line)})))
const attentionCount = computed(() => rows.value.filter(row=>row.issues.length).length)
const shown = computed(() => rows.value.filter(row => (filter.value!=='attention'||row.issues.length) &&
  `${row.line.employee_name} ${row.line.employee_code}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const totals = computed(() => rows.value.reduce((sum,row) => ({ earnings:sum.earnings+row.amounts.earnings,
  deductions:sum.deductions+row.amounts.deductions,net:sum.net+row.amounts.net }),{earnings:0,deductions:0,net:0}))
const breakdown = row => [['Basic',row.amounts.basic],['COLA',row.amounts.cola],['Extra earnings',row.amounts.extra],
  ['Allowances / other earnings',row.amounts.additions],['Attendance deductions',-row.amounts.time],
  ['Government contributions',-row.amounts.contributions],['Other deductions',-row.amounts.otherDeductions]].filter(([,amount])=>amount!==0)
</script>

<template>
  <section class="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
    <header class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="font-semibold">Review employee pay</h2><p class="mt-1 text-xs text-gray-500">{{lines.length}} employees<span v-if="outdated"> · Outdated draft · read only</span><span v-if="payday"> · Payment {{payday}}</span></p></div><MoreMenu :label="editable?'More':'Download'" :items="downloads || []" /></header>
    <dl class="my-5 grid grid-cols-3 gap-2 sm:gap-3">
      <div v-for="item in [{label:'Earnings',value:totals.earnings},{label:'Deductions',value:totals.deductions},{label:'Net pay',value:totals.net}]" :key="item.label" class="rounded-lg border border-gray-800 p-3"><dt class="text-xs text-gray-500">{{item.label}}</dt><dd class="mt-1 break-words text-sm font-semibold sm:text-xl" :class="item.label==='Net pay'?'text-emerald-300':'text-gray-100'">{{money(item.value)}}</dd></div>
    </dl>
    <div class="mb-4 flex flex-wrap items-center gap-3"><input v-model="search" class="form-control max-w-sm" type="search" placeholder="Name or employee ID" aria-label="Search payroll employees"><div class="flex gap-1" role="group" aria-label="Pay review filter"><button v-for="item in [{key:'all',label:'All employees'},{key:'attention',label:`Needs attention (${attentionCount})`}]" :key="item.key" class="rounded-lg px-3 py-2 text-xs font-semibold" :class="filter===item.key?'bg-primary-500 text-gray-950':'bg-gray-800 text-gray-400'" :aria-pressed="filter===item.key" @click="filter=item.key">{{item.label}}</button></div></div>
    <div class="hidden overflow-x-auto lg:block"><table class="w-full text-left text-sm"><thead class="border-b border-gray-800 text-xs text-gray-500"><tr><th class="py-3 pr-3">Employee</th><th class="px-3 py-3 text-right">Earnings</th><th class="px-3 py-3 text-right">Deductions</th><th class="px-3 py-3 text-right">Net pay</th><th class="py-3 pl-3 text-right">Actions</th></tr></thead><tbody class="divide-y divide-gray-800"><tr v-for="row in shown" :key="row.line.id">
      <td class="py-3 pr-3"><p class="font-medium">{{row.line.employee_name}}</p><p v-for="issue in row.issues" :key="issue" class="mt-1 text-xs text-amber-300">{{issue}}</p><details class="mt-1 text-xs text-gray-500"><summary class="cursor-pointer">View breakdown</summary><dl class="mt-2 max-w-sm space-y-1"><div v-for="[label,amount] in breakdown(row)" :key="label" class="flex justify-between gap-3"><dt>{{label}}</dt><dd>{{money(amount)}}</dd></div></dl><p v-if="Object.values(row.line.details?.contributionSettings || {}).includes(false)" class="mt-2">Pending IDs: {{[['sss','SSS'],['philhealth','PhilHealth'],['pagibig','Pag-IBIG']].filter(([key])=>row.line.details.contributionSettings[key]===false).map(([,label])=>label).join(', ')}}</p><button v-if="editable" class="mt-2 text-primary-300 underline" @click="$emit('attendance',row.line)">Edit attendance / overtime</button></details></td>
      <td class="px-3 py-3 text-right tabular-nums">{{money(row.amounts.earnings)}}</td><td class="px-3 py-3 text-right tabular-nums">{{money(row.amounts.deductions)}}</td><td class="px-3 py-3 text-right font-semibold tabular-nums" :class="row.amounts.net>0?'text-emerald-300':'text-red-300'">{{money(row.amounts.net)}}</td><td class="py-3 pl-3"><div class="flex justify-end gap-2"><AppButton size="sm" variant="secondary" @click="$emit('preview',row.line)">Preview payslip</AppButton><AppButton v-if="editable" size="sm" variant="outline" @click="$emit('adjust',row.line)">Adjust pay</AppButton><AppButton v-if="editable && row.line.details?.payBasisReview?.required && !row.line.details.payBasisReview.verifiedReason" size="sm" variant="secondary" @click="$emit('verify',row.line)">Verify basic pay</AppButton></div></td>
    </tr></tbody></table></div>
    <div class="divide-y divide-gray-800 lg:hidden"><article v-for="row in shown" :key="row.line.id" class="py-4"><div class="flex items-start justify-between gap-3"><p class="text-sm font-semibold">{{row.line.employee_name}}</p><strong class="whitespace-nowrap text-sm text-emerald-300">{{money(row.amounts.net)}}</strong></div><p v-for="issue in row.issues" :key="issue" class="mt-1 text-xs text-amber-300">{{issue}}</p><details class="my-2 text-xs text-gray-500"><summary class="cursor-pointer">View breakdown</summary><dl class="mt-2 space-y-1"><div v-for="[label,amount] in breakdown(row)" :key="label" class="flex justify-between gap-3"><dt>{{label}}</dt><dd>{{money(amount)}}</dd></div></dl><button v-if="editable" class="mt-2 text-primary-300 underline" @click="$emit('attendance',row.line)">Edit attendance / overtime</button></details><div class="flex flex-wrap gap-2"><AppButton size="sm" variant="secondary" @click="$emit('preview',row.line)">Preview payslip</AppButton><AppButton v-if="editable" size="sm" variant="outline" @click="$emit('adjust',row.line)">Adjust pay</AppButton><AppButton v-if="editable && row.line.details?.payBasisReview?.required && !row.line.details.payBasisReview.verifiedReason" size="sm" variant="secondary" @click="$emit('verify',row.line)">Verify basic pay</AppButton></div></article></div>
    <p v-if="!shown.length" class="py-6 text-center text-sm text-gray-500">No employees match these filters.</p>
  </section>
</template>
