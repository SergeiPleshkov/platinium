<script setup lang="ts">
import { computed } from 'vue'

/**
 * A status pill.
 *
 * Hand-rolled rather than wrapping PrimeVue's `Tag`, because status colour needs to be a
 * lookup this application owns, and because colour alone must never be the only signal
 * the label always carries the meaning for anyone who cannot distinguish the hues.
 */

export type BadgeTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger'

interface Props {
  label: string
  tone?: BadgeTone | undefined
}

const props = withDefaults(defineProps<Props>(), { tone: 'neutral' })

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

const toneClass = computed(() => TONE_CLASSES[props.tone])
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      toneClass,
    ]"
  >
    {{ label }}
  </span>
</template>
