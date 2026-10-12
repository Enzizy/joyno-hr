<script setup>
import { useRoute } from 'vue-router'
import NavIcon from '@/components/layout/NavIcon.vue'

defineProps({ items: { type: Array, required: true }, label: { type: String, default: 'Workspace sections' } })
const route = useRoute()
const active = item => route.path === (typeof item.to === 'string' ? item.to : item.to.path)
</script>

<template>
  <nav class="section-nav" :aria-label="label">
    <RouterLink v-for="item in items" :key="item.label" :to="item.to" class="section-nav__link" :class="{ 'section-nav__link--active': active(item) }" :aria-current="active(item) ? 'page' : undefined">
      <NavIcon v-if="item.icon" :name="item.icon" class="h-4 w-4" />
      {{ item.label }}
    </RouterLink>
  </nav>
</template>
