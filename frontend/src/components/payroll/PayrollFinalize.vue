<script setup>
import AppButton from '@/components/ui/AppButton.vue'
import MoreMenu from '@/components/ui/MoreMenu.vue'
import PayRunNextStep from '@/components/payroll/PayRunNextStep.vue'
import { formatWorkDate } from '@/utils/payrollPeriods'
// Stage 3: one action releases the checked payroll. Approving, recording the payment and closing
// stay separate audited steps on the server; "release" runs whichever of them remain.
defineProps({run:Object,total:Number,count:Number,agencies:Array,issues:Array,warnings:Array,downloads:Array,busy:Boolean,enabled:Boolean,practice:Boolean})
defineEmits(['release','resolve','review','payslips'])
const money=value=>`₱${Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const stamp=value=>value?new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}):''
const actor=(run,action)=>[...(run.events||[])].reverse().find(event=>event.action===action)?.actor_name || ''
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-xl border border-gray-800 bg-gray-900 p-5"><header class="flex items-center justify-between gap-3"><h2 class="font-semibold">{{run.status==='locked'?'Payroll released':'Approve & release'}}</h2><MoreMenu label="Download" :items="downloads||[]" /></header><p class="mt-5 text-sm text-gray-500">Net pay to {{count}} employees</p><p class="mt-1 text-3xl font-semibold text-emerald-300">{{money(total)}}</p><button class="mt-3 text-sm text-primary-300 underline" @click="$emit('review')">View pay breakdown</button><details v-if="agencies?.length" class="mt-5 border-t border-gray-800 pt-3"><summary class="cursor-pointer text-sm font-medium">Agency remittances · {{money(agencies.reduce((sum,item)=>sum+item.amount,0))}}</summary><p class="mt-2 text-xs text-gray-500">Employee and employer shares, paid separately to each agency.</p><dl class="mt-2 space-y-1 text-sm"><div v-for="item in agencies" :key="item.name" class="flex justify-between gap-3"><dt>{{item.name}}</dt><dd>{{money(item.amount)}}</dd></div></dl></details></div>
    <section v-if="run.status==='draft' && issues?.length" class="rounded-xl border p-4" style="border-color:var(--warning-border);background:var(--warning-bg);color:var(--warning-text)" role="status" aria-label="Payroll blockers"><h3 class="text-sm font-semibold">{{issues.length}} {{issues.length===1?'thing':'things'}} to resolve before release</h3><ul class="mt-3 space-y-3"><li v-for="issue in issues" :key="issue.key" class="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{{issue.text}}</span><AppButton variant="secondary" size="sm" @click="$emit('resolve',issue)">{{issue.actionLabel}}</AppButton></li></ul></section>
    <details v-if="run.status==='draft' && warnings?.length" class="rounded-lg border border-gray-800 px-4 py-3 text-sm"><summary class="cursor-pointer">Additional checks ({{warnings.length}})</summary><ul class="mt-3 space-y-3"><li v-for="warning in warnings" :key="warning.text"><p>{{warning.text}}</p><p class="mt-1 text-xs text-gray-500">{{warning.detail}}</p></li></ul></details>
    <details v-if="run.approved_at" class="rounded-lg border border-gray-800 px-4 py-3 text-sm"><summary class="cursor-pointer">History</summary><ol class="mt-3 space-y-2 text-xs text-gray-500"><li>Approved {{stamp(run.approved_at)}}<span v-if="actor(run,'approved')"> · {{actor(run,'approved')}}</span></li><li v-if="run.payment">Paid {{formatWorkDate(run.payment.paid_on)}} · {{run.payment.reference}}<span v-if="actor(run,practice?'practice_payment_recorded':'payment_recorded')"> · {{actor(run,practice?'practice_payment_recorded':'payment_recorded')}}</span></li><li v-if="run.locked_at">Released {{stamp(run.locked_at)}}<span v-if="actor(run,'locked')"> · {{actor(run,'locked')}}</span></li></ol></details>
    <PayRunNextStep v-if="run.status==='draft' && !issues?.length" :title="enabled?'Ready to release':'Release is turned off'" :detail="enabled?(practice?'Practice: nothing is paid. You pick who gets a test payslip next.':'Locks the amounts and puts every payslip in My payslips.'):'Releasing real payroll is turned off for now.'"><AppButton :loading="busy" :disabled="!enabled" @click="$emit('release')">{{practice?'Release practice payroll':'Approve & release payroll'}}</AppButton></PayRunNextStep>
    <PayRunNextStep v-else-if="run.status==='approved'" title="Release not finished" detail="This payroll is approved but its payslips are not out yet."><AppButton :loading="busy" @click="$emit('release')">Finish releasing</AppButton></PayRunNextStep>
    <PayRunNextStep v-else-if="run.status==='locked'" :title="practice?'Practice payroll finished':'Payroll released'" :detail="practice?'Send test payslips to the people you pick.':'Every employee can see their payslip in My payslips.'" tone="done"><AppButton @click="$emit('payslips')">Go to payslips →</AppButton></PayRunNextStep>
  </section>
</template>
