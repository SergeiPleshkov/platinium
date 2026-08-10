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
        Just the spinner. A card around it, with "Loading page…" written next to a shape that
        already means exactly that, was saying the same thing three ways.
        Not `decorative` here: with the visible label gone, the spinner's own live region and
        hidden label are the only things left to announce the wait to a screen reader.
      -->
      <BaseSpinner size="lg" label="Loading page" />
    </div>
  </Transition>

  <!-- Mounted once, outside the routed views, so a toast survives navigation. -->
  <BaseToaster />
</template>
