<script setup lang="ts">
import { useAuthStore } from '@/features/auth'

/**
 * Placeholder dashboard. Phase 8 replaces this with server-aggregated statistics; the entity
 * pages it links to arrive in phases 5–7.
 */

const auth = useAuthStore()

const upcoming = [
  { title: 'Categories', detail: 'Ticket tiers and their descriptions', phase: 'Phase 5' },
  { title: 'Events', detail: 'Dates, venues and publication status', phase: 'Phase 6' },
  { title: 'Tickets', detail: 'Pricing, inventory and availability', phase: 'Phase 7' },
]
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-content">Dashboard</h1>
      <p class="mt-1 text-sm text-content-muted">
        Signed in as {{ auth.displayName }} ({{ auth.role }}).
      </p>
    </header>

    <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <li
        v-for="item in upcoming"
        :key="item.title"
        class="rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900"
      >
        <p class="text-xs font-semibold tracking-wide text-content-muted uppercase">
          {{ item.phase }}
        </p>
        <h2 class="mt-1 font-medium text-content">{{ item.title }}</h2>
        <p class="mt-1 text-sm text-content-muted">{{ item.detail }}</p>
      </li>
    </ul>
  </div>
</template>
