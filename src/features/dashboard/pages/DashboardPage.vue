<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

import { useAuthStore } from '@/features/auth'
import StatTile from '@/features/dashboard/components/StatTile.vue'
import { useDashboardStore } from '@/features/dashboard/store'
import { EVENT_STATUS_LABELS } from '@/features/events'
import { formatDate } from '@/shared/utils/date'
import { formatMoney } from '@/shared/utils/money'
import { BaseBadge, BaseButton } from '@/shared/ui'

/**
 * Portal overview.
 *
 * Every figure arrives pre-aggregated from `/api/stats`. Nothing here loads a collection in
 * order to count it.
 */

const auth = useAuthStore()
const dashboard = useDashboardStore()

onMounted(() => {
  void dashboard.fetchStats()
})

const number = new Intl.NumberFormat('en-GB')

const stats = computed(() => dashboard.stats)

/** One formatted amount per currency — never joined into a single figure. */
const inventoryValues = computed(() =>
  (stats.value?.inventoryValue ?? []).map((entry) => formatMoney(entry.totalMinor, entry.currency)),
)
</script>

<template>
  <div>
    <header class="mb-6">
      <h1 class="text-2xl font-semibold text-content">Dashboard</h1>
      <p class="mt-1 text-sm text-content-muted">
        Signed in as {{ auth.displayName }} ({{ auth.role }}).
      </p>
    </header>

    <div
      v-if="dashboard.hasError"
      role="alert"
      class="rounded-lg border border-border bg-surface-0 px-6 py-12 text-center dark:bg-surface-900"
    >
      <i
        class="pi pi-exclamation-triangle text-3xl text-red-600 dark:text-red-400"
        aria-hidden="true"
      />
      <p class="mt-3 font-medium text-content">Could not load the dashboard</p>
      <p class="mt-1 text-sm text-content-muted">{{ dashboard.errorMessage }}</p>
      <BaseButton
        class="mt-4"
        variant="secondary"
        icon="pi pi-refresh"
        label="Try again"
        @click="dashboard.fetchStats()"
      />
    </div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Events"
          icon="pi pi-calendar"
          :value="number.format(stats?.events.total ?? 0)"
          :detail="`${stats?.events.published ?? 0} published · ${stats?.events.upcoming ?? 0} upcoming`"
          :loading="dashboard.isLoading"
        />
        <StatTile
          label="Tickets"
          icon="pi pi-ticket"
          :value="number.format(stats?.tickets.total ?? 0)"
          :detail="`${stats?.tickets.onSale ?? 0} on sale · ${stats?.tickets.soldOut ?? 0} sold out`"
          :loading="dashboard.isLoading"
        />
        <StatTile
          label="Inventory"
          icon="pi pi-box"
          :value="number.format(stats?.tickets.inventory ?? 0)"
          detail="Tickets remaining across all events"
          :loading="dashboard.isLoading"
        />
        <StatTile
          label="Inventory value"
          icon="pi pi-wallet"
          :values="inventoryValues.length ? inventoryValues : ['—']"
          detail="Kept per currency, never summed across them"
          :loading="dashboard.isLoading"
        />
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <section class="rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900">
          <h2 class="font-medium text-content">Upcoming events</h2>
          <p
            v-if="!dashboard.isLoading && !stats?.upcomingEvents.length"
            class="mt-3 text-sm text-content-muted"
          >
            Nothing scheduled.
          </p>
          <ul class="mt-3 divide-y divide-border">
            <li
              v-for="event in stats?.upcomingEvents ?? []"
              :key="event.id"
              class="flex items-center justify-between gap-3 py-2.5"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-content">{{ event.name }}</p>
                <p class="text-xs text-content-muted">
                  {{ formatDate(event.startDate) }} · {{ event.venue }}
                </p>
              </div>
              <BaseBadge
                :label="EVENT_STATUS_LABELS[event.status]"
                :tone="event.status === 'published' ? 'success' : 'neutral'"
              />
            </li>
          </ul>
        </section>

        <section class="rounded-lg border border-border bg-surface-0 p-4 dark:bg-surface-900">
          <h2 class="font-medium text-content">Busiest events</h2>
          <p class="mt-0.5 text-xs text-content-muted">By number of ticket types.</p>
          <ul class="mt-3 divide-y divide-border">
            <li
              v-for="entry in stats?.busiestEvents ?? []"
              :key="entry.eventId"
              class="flex items-center justify-between gap-3 py-2.5"
            >
              <p class="min-w-0 truncate text-sm text-content">{{ entry.eventName }}</p>
              <span class="shrink-0 text-sm tabular-nums text-content-muted">
                {{ entry.ticketCount }}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <nav class="mt-6 flex flex-wrap gap-3" aria-label="Manage">
        <RouterLink
          v-for="link in [
            { to: '/events', label: 'Manage events' },
            { to: '/tickets', label: 'Manage tickets' },
            { to: '/categories', label: 'Manage categories' },
          ]"
          :key="link.to"
          :to="link.to"
          class="rounded-md border border-border px-3 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-100 dark:hover:bg-surface-800"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </template>
  </div>
</template>
