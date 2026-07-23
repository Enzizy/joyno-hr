<script setup>
defineProps({
  name: { type: String, required: true },
})
</script>

<template>
  <svg class="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'dashboard'">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="4" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
    </template>

    <template v-else-if="name === 'users'">
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14.7a4 4 0 0 1 3 3.8V20" />
    </template>

    <template v-else-if="name === 'user-cog'">
      <circle cx="9" cy="7" r="3.5" />
      <path d="M3 20v-1.5a5 5 0 0 1 8.5-3.6" />
      <circle cx="17.5" cy="17.5" r="2.5" />
      <path d="M17.5 13.5v1.5m0 5v1.5m4-4H20m-5 0h-1.5m6.8-2.8-1.1 1.1m-3.5 3.5-1.1 1.1m5.7 0-1.1-1.1m-3.5-3.5-1.1-1.1" />
    </template>

    <template v-else-if="name === 'task'">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M8 8h8M8 12h5M8 16h3" />
      <path d="m15 16 1.5 1.5L20 14" />
    </template>

    <template v-else-if="name === 'leave'">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4m8-4v4M3 10h18" />
      <path d="M8 15h8m-4-3v6" />
    </template>

    <template v-else-if="name === 'check'">
      <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M9 3h6v4H9z" />
      <path d="m10 15 2 2 8-9" />
    </template>

    <template v-else-if="name === 'chart'">
      <path d="M4 20V10m5 10V4m6 16v-7m5 7V7" />
      <path d="M2 20h20" />
    </template>

    <template v-else-if="name === 'lead'">
      <circle cx="9" cy="8" r="4" />
      <path d="M2.5 21a6.5 6.5 0 0 1 13 0M19 8v6m-3-3h6" />
    </template>

    <template v-else-if="name === 'client'">
      <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
      <path d="M17 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h1m3 0h1M8 11h1m3 0h1M8 15h1m3 0h1M9 21v-3h3v3" />
    </template>

    <template v-else-if="name === 'service'">
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </template>

    <template v-else-if="name === 'automation'">
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M7 12h4a4 4 0 0 0 4-4V5m-8 7h4a4 4 0 0 1 4 4v3" />
    </template>

    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </template>

    <template v-else-if="name === 'audit'">
      <path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5M8 12h7M8 16h4" />
      <circle cx="17" cy="17" r="3" />
      <path d="M17 15.5V17l1 1" />
    </template>

    <template v-else>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </template>
  </svg>
</template>
