<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { RouteName } from '@/app/router/routes'
</script>

<template>
  <main class="grid min-h-dvh place-items-center p-6">
    <div class="text-center">
      <p class="text-sm font-semibold tracking-widest text-content-muted uppercase">404</p>
      <h1 class="mt-2 text-3xl font-semibold text-content">This page does not exist</h1>
      <p class="mt-2 text-content-muted">
        The link may be out of date, or the record may have been deleted.
      </p>
      <RouterLink
        :to="{ name: RouteName.Dashboard }"
        class="mt-6 inline-block rounded-md bg-brand-600 px-4 py-2 font-medium text-white transition-colors hover:bg-brand-700"
      >
        Back to the portal
      </RouterLink>
    </div>
  </main>
</template>
