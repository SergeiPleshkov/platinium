<script setup lang="ts">
import { BaseButton } from '@/shared/ui'

/**
 * Placeholder landing view for the toolchain phase. Phase 3 replaces this with the login
 * page and the authenticated portal shell.
 */

const checks = [
  { label: 'Vue 3 + TypeScript', detail: 'strict, with noUncheckedIndexedAccess' },
  { label: 'Vue Router', detail: 'lazy-loaded routes' },
  { label: 'Pinia', detail: 'setup stores' },
  { label: 'PrimeVue', detail: 'behind the shared/ui adapter layer' },
  { label: 'Tailwind', detail: 'consuming PrimeVue design tokens' },
  { label: 'Vitest', detail: 'jsdom + Testing Library' },
]
</script>

<template>
  <main class="app-container flex min-h-dvh flex-col justify-center py-16">
    <div class="mx-auto w-full max-w-2xl">
      <p class="text-sm font-semibold tracking-widest text-brand-600 uppercase dark:text-brand-400">
        Phase 1
      </p>
      <h1 class="mt-2 text-3xl font-semibold text-content sm:text-4xl">Ticket Admin Portal</h1>
      <p class="mt-3 text-content-muted">Toolchain is wired. The portal itself lands in phase 3.</p>

      <ul class="mt-8 grid gap-3 sm:grid-cols-2">
        <li
          v-for="check in checks"
          :key="check.label"
          class="rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900"
        >
          <p class="font-medium text-content">{{ check.label }}</p>
          <p class="mt-0.5 text-sm text-content-muted">{{ check.detail }}</p>
        </li>
      </ul>

      <div class="mt-8 flex flex-wrap gap-3">
        <BaseButton variant="primary">Primary</BaseButton>
        <BaseButton variant="secondary">Secondary</BaseButton>
        <BaseButton variant="ghost">Ghost</BaseButton>
        <BaseButton variant="danger">Danger</BaseButton>
      </div>
    </div>
  </main>
</template>
