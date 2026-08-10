<script setup lang="ts">
import { BaseSkeleton } from '@/shared/ui'

/**
 * A single headline figure.
 *
 * Rendered as a definition list so the label and value are programmatically associated —
 * a big number with a small word above it is only a statistic to someone who can see the
 * layout.
 */

interface Props {
  label: string
  /** A single headline figure. Ignored when `values` is supplied. */
  value?: string | undefined
  /**
   * Several figures that must not be combined — per-currency totals, most obviously.
   * Stacked and set smaller, because three long amounts at headline size stop being scannable.
   */
  values?: readonly string[] | undefined
  detail?: string | undefined
  icon?: string | undefined
  loading?: boolean | undefined
}

withDefaults(defineProps<Props>(), { loading: false })
</script>

<template>
  <div class="rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900">
    <dl>
      <dt class="flex items-center gap-2 text-sm text-content-muted">
        <i v-if="icon" :class="icon" aria-hidden="true" />
        {{ label }}
      </dt>
      <dd class="mt-2">
        <BaseSkeleton v-if="loading" width="5rem" height="1.75rem" />
        <ul v-else-if="values?.length" class="flex flex-col gap-0.5">
          <li
            v-for="entry in values"
            :key="entry"
            class="text-base font-semibold tabular-nums text-content"
          >
            {{ entry }}
          </li>
        </ul>
        <span v-else class="text-2xl font-semibold tabular-nums text-content">{{ value }}</span>
      </dd>
      <dd v-if="detail && !loading" class="mt-1 text-xs text-content-muted">{{ detail }}</dd>
    </dl>
  </div>
</template>
