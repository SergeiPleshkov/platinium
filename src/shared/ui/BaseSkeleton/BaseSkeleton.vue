<script setup lang="ts">
import Skeleton from 'primevue/skeleton'

/**
 * A loading placeholder.
 *
 * Hidden from assistive technology: a screen reader gains nothing from being told there are
 * six grey rectangles. The surrounding region announces its loading state instead.
 */

interface Props {
  width?: string | undefined
  height?: string | undefined
  rounded?: boolean | undefined
}

withDefaults(defineProps<Props>(), { width: '100%', height: '1rem', rounded: false })
</script>

<template>
  <Skeleton
    :width="width"
    :height="height"
    :border-radius="rounded ? '9999px' : undefined"
    aria-hidden="true"
  />
</template>
