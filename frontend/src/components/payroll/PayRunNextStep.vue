<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
// The one place a pay-run stage shows its status and the next thing to do.
// Floating actions reserve their own height so they never hide the final employee row.
const props = defineProps({
  title: { type: String, required: true },
  detail: { type: String, default: '' },
  tone: { type: String, default: 'todo' }, // todo | done | waiting
  floating: { type: Boolean, default: true },
})
const anchor = ref(null), bar = ref(null), geometry = ref(null), height = ref(0)
let observer
function measure() {
  if (!props.floating || !anchor.value || !bar.value) { geometry.value=null; return }
  const rect=anchor.value.getBoundingClientRect()
  geometry.value={left:`${rect.left}px`,width:`${rect.width}px`}
  height.value=bar.value.getBoundingClientRect().height
}
function stop() {
  observer?.disconnect(); observer=null
  window.removeEventListener('resize',measure)
}
function start() {
  stop()
  if (!props.floating) return
  observer=new ResizeObserver(measure)
  if(anchor.value)observer.observe(anchor.value)
  if(bar.value)observer.observe(bar.value)
  window.addEventListener('resize',measure)
  measure()
}
onMounted(start)
onActivated(start)
onDeactivated(stop)
onBeforeUnmount(stop)
watch(()=>props.floating,start,{flush:'post'})
</script>

<template>
  <div ref="anchor" :style="floating && geometry ? {height:`${height+16}px`} : {}">
  <div ref="bar" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
    :style="floating && geometry ? {...geometry,position:'fixed',bottom:'max(12px, env(safe-area-inset-bottom))',zIndex:30,boxShadow:'0 8px 28px rgb(0 0 0 / 18%)',...(tone==='done'?{background:'var(--success-bg)'}:{})} : {}"
    :class="tone === 'done' ? 'border-emerald-800/70 bg-emerald-950/20' : tone === 'waiting' ? 'border-gray-700 bg-gray-900' : 'border-primary-700/70 bg-gray-900'"
    role="region" aria-label="Next step">
    <div class="min-w-0">
      <p class="text-sm font-semibold" :class="tone === 'done' ? 'text-emerald-200' : tone === 'waiting' ? 'text-gray-200' : 'text-primary-200'">{{ title }}</p>
      <p v-if="detail" class="mt-0.5 text-xs text-gray-400">{{ detail }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot /></div>
  </div>
  </div>
</template>
