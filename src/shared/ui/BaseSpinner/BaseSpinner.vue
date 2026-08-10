<script setup lang="ts">
/**
 * An indeterminate progress indicator.
 *
 * An SVG with a CSS rotation rather than PrimeVue's `ProgressSpinner`, because this one has to
 * work inside an overlay at three sizes and inherit `currentColor` — and because a spinner is
 * about twenty lines, which is less than a wrapper reconciling someone else's sizing API.
 *
 * Standalone, it is a live region with a visually hidden label: a spinning shape means nothing
 * to a screen reader, and a page that announces nothing reads as frozen rather than as busy.
 */

withDefaults(
  defineProps<{
    /** Announced to assistive technology. Ignored when `decorative`. */
    label?: string
    size?: 'sm' | 'md' | 'lg'
    /**
     * Drops the live region, leaving only the shape.
     *
     * For the common case of a spinner sitting inside a container that is *already* a live
     * region with its own text. Two nested live regions announce the same wait twice, which is
     * worse than announcing it once — so the outer one wins and this becomes decoration.
     */
    decorative?: boolean
  }>(),
  { label: 'Loading', size: 'md', decorative: false },
)

const SIZES = { sm: 'size-4', md: 'size-6', lg: 'size-9' } as const
</script>

<template>
  <span
    :role="decorative ? undefined : 'status'"
    :aria-hidden="decorative ? 'true' : undefined"
    class="inline-flex items-center gap-2"
  >
    <svg
      :class="[SIZES[size], 'animate-spin text-brand-600 dark:text-brand-400']"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <!-- The faint full ring gives the moving arc something to travel along. -->
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-20" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <span v-if="!decorative" class="sr-only">{{ label }}</span>
  </span>
</template>
