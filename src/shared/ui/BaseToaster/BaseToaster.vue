<script setup lang="ts">
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { watch } from 'vue'

import { useNotifications } from '@/shared/composables/useNotifications'

/**
 * Renders the notification queue.
 *
 * The bridge between our PrimeVue-agnostic `useNotifications` queue and PrimeVue's imperative
 * toast service. Keeping the queue ours means features raise notifications without importing
 * the UI kit, and notification policy stays unit-testable without mounting anything.
 *
 * Mounted once, by the app shell.
 */

const toast = useToast()
const { notifications, dismiss } = useNotifications()

watch(
  notifications,
  (current) => {
    for (const notification of current) {
      toast.add({
        severity: notification.severity,
        summary: notification.summary,
        ...(notification.detail === undefined ? {} : { detail: notification.detail }),
        // `life: null` means "stays until dismissed", which PrimeVue expresses as no life.
        ...(notification.life === null ? {} : { life: notification.life }),
      })
      // Handed off — drop it from our queue so it cannot be shown twice.
      dismiss(notification.id)
    }
  },
  { deep: true },
)
</script>

<template>
  <Toast position="bottom-right" />
</template>
