<script setup lang="ts">
import { RouterView } from 'vue-router'

import { useRouteLoading } from '@/shared/composables'
import { BaseSpinner, BaseToaster } from '@/shared/ui'

/**
 * Mounted above the router outlet so the navigation indicator survives the view swap it is
 * reporting on. Inside a routed view it would unmount at the exact moment the new chunk
 * arrived — which is the only moment it exists to cover.
 */
const { isNavigating } = useRouteLoading()
</script>

<template>
  <RouterView />

  <!--
    Route components are lazy chunks. Until one downloads the router leaves the previous page
    up, so without this a click on a slow connection looks like it did nothing. `aria-live`
    announces it; the 150ms threshold in `useRouteLoading` keeps it off screen for the cached
    case, which is most of them.
  -->
  <Transition
    enter-active-class="transition-opacity duration-150"
    leave-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isNavigating"
      class="fixed inset-0 z-50 flex items-center justify-center bg-surface-50/70 backdrop-blur-[1px] dark:bg-surface-950/70"
      aria-busy="true"
    >
      <!--
        The live region is here, on the element that has the text. `role="status"` already
        implies `aria-live="polite"`, and the spinner inside is decorative so the wait is
        announced once rather than by two nested regions.
      -->
      <div
        role="status"
        class="flex items-center gap-3 rounded-lg border border-border bg-surface-0 px-5 py-4 shadow-lg dark:bg-surface-900"
      >
        <BaseSpinner size="md" decorative />
        <span class="text-sm font-medium text-content">Loading page…</span>
      </div>
    </div>
  </Transition>

  <!-- Mounted once, outside the routed views, so a toast survives navigation. -->
  <BaseToaster />
</template>
