<script setup lang="ts">
import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'

/**
 * Per-record reasons from a bulk operation that partly, or wholly, failed.
 *
 * On the page rather than in a toast: this is a list somebody has to read and act on, and a
 * toast that auto-dismisses is the wrong container for it. It carries its own accessible name
 * because the error toast is also an `alert`, and two unnamed alerts are indistinguishable to
 * anything querying the page.
 */

export interface BulkFailureItem {
  id: string
  label: string
  reason: string
}

defineProps<{ failures: readonly BulkFailureItem[] }>()

const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div
    v-if="failures.length > 0"
    class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
    role="alert"
    aria-label="Bulk action failures"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-content">{{ failures.length }} could not be changed</p>
        <ul class="mt-2 space-y-1">
          <li v-for="failure in failures" :key="failure.id" class="text-sm text-content-muted">
            <span class="font-medium text-content">{{ failure.label }}</span>
            — {{ failure.reason }}
          </li>
        </ul>
      </div>
      <BaseButton
        variant="ghost"
        size="sm"
        icon="pi pi-times"
        aria-label="Dismiss failure report"
        @click="emit('dismiss')"
      />
    </div>
  </div>
</template>
