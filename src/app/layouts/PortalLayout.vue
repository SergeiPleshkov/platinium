<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/features/auth'
import { NAVIGATION, RouteName } from '@/app/router/routes'
import { useResponsiveLayout } from '@/shared/composables'
import { BaseButton } from '@/shared/ui'

/**
 * The authenticated shell: navigation, identity, and the router outlet.
 *
 * Below `lg` the sidebar becomes an off-canvas drawer rather than shrinking — a 200px-wide
 * nav column on a phone leaves no room for the tables this portal exists to show.
 */

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { isDesktop } = useResponsiveLayout()

const drawerOpen = ref(false)

// Navigating from the drawer should close it; leaving it open covers the page just reached.
watch(
  () => route.fullPath,
  () => {
    drawerOpen.value = false
  },
)

async function signOut(): Promise<void> {
  await auth.logout()
  await router.push({ name: RouteName.Login })
}
</script>

<template>
  <div class="min-h-dvh bg-surface-50 dark:bg-surface-950">
    <!-- Lets a keyboard user reach the content without tabbing the whole nav on every page. -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
    >
      Skip to content
    </a>

    <header
      class="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface-0 px-4 dark:bg-surface-900"
    >
      <BaseButton
        v-if="!isDesktop"
        variant="ghost"
        icon="pi pi-bars"
        :label="drawerOpen ? 'Close navigation' : 'Open navigation'"
        :aria-expanded="drawerOpen"
        aria-controls="primary-navigation"
        @click="drawerOpen = !drawerOpen"
      />

      <RouterLink
        :to="{ name: RouteName.Dashboard }"
        class="font-semibold text-content hover:text-brand-600 dark:hover:text-brand-400"
      >
        Ticket Admin
      </RouterLink>

      <div class="ml-auto flex items-center gap-3">
        <div class="hidden text-right sm:block">
          <p class="text-sm font-medium text-content">{{ auth.displayName }}</p>
          <p class="text-xs text-content-muted capitalize">{{ auth.role }}</p>
        </div>
        <span
          class="grid size-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {{ auth.initials }}
        </span>
        <BaseButton variant="secondary" size="sm" @click="signOut">Sign out</BaseButton>
      </div>
    </header>

    <div class="flex">
      <!-- Backdrop only exists in drawer mode; clicking it is the expected way out. -->
      <div
        v-if="drawerOpen && !isDesktop"
        class="fixed inset-0 z-30 bg-black/40"
        aria-hidden="true"
        @click="drawerOpen = false"
      />

      <nav
        id="primary-navigation"
        :class="[
          'z-40 w-64 shrink-0 border-r border-border bg-surface-0 p-3 dark:bg-surface-900',
          isDesktop
            ? 'sticky top-16 h-[calc(100dvh-4rem)]'
            : 'fixed top-16 bottom-0 left-0 transition-transform duration-200',
          !isDesktop && !drawerOpen ? '-translate-x-full' : 'translate-x-0',
        ]"
        aria-label="Primary"
        :aria-hidden="!isDesktop && !drawerOpen"
      >
        <ul class="flex flex-col gap-1">
          <li v-for="item in NAVIGATION" :key="item.name">
            <RouterLink
              :to="{ name: item.name }"
              class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
              active-class="bg-brand-50 text-brand-700 dark:bg-surface-800 dark:text-brand-400"
            >
              <i :class="item.icon" aria-hidden="true" />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <main id="main-content" class="min-w-0 flex-1 p-4 sm:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
