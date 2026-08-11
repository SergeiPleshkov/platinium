<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useAuthStore } from '@/features/auth'
import StatTile from '@/features/dashboard/components/StatTile.vue'
import { useDashboardStore } from '@/features/dashboard/store'
import { EVENT_STATUS_LABELS } from '@/features/events'
import { formatDate } from '@/shared/utils/date'
import { useSortableList } from '@/shared/composables'
import { formatMoney } from '@/shared/utils/money'
import { BaseBadge, BaseButton } from '@/shared/ui'

/**
 * Portal overview.
 *
 * Every figure arrives pre-aggregated from `/api/stats`. Nothing here loads a collection in
 * order to count it.
 *
 * Deliberately renders no navigation. `PortalLayout`'s sidebar is the single source of it,
 * driven by `NAVIGATION` in the router. This page previously repeated those destinations as
 * literal path strings — the only hardcoded routes in the codebase — because the boundary
 * rule stops a feature importing `app/`. That was working around the boundary rather than
 * respecting it, and it gave up the guarantee `RouteName` exists for: a renamed path would
 * have kept the sidebar working while silently 404ing here.
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

/* ---- arrangeable tiles ---- */

interface TileDescriptor {
  id: string
  label: string
  icon: string
  value?: string
  values?: string[]
  detail: string
}

/**
 * The tiles as *data*, in their default order.
 *
 * Written out as four `<StatTile>` elements before, which is perfectly readable and cannot be
 * reordered — you cannot permute markup at runtime. Describing them lets one `v-for` render
 * whatever arrangement the user has chosen, and it is also where the stable ids come from:
 * the persisted order refers to `events`, not to "the first one".
 */
const tiles = computed<TileDescriptor[]>(() => [
  {
    id: 'events',
    label: 'Events',
    icon: 'pi pi-calendar',
    value: number.format(stats.value?.events.total ?? 0),
    detail: `${stats.value?.events.published ?? 0} published · ${stats.value?.events.upcoming ?? 0} upcoming`,
  },
  {
    id: 'tickets',
    label: 'Tickets',
    icon: 'pi pi-ticket',
    value: number.format(stats.value?.tickets.total ?? 0),
    detail: `${stats.value?.tickets.onSale ?? 0} on sale · ${stats.value?.tickets.soldOut ?? 0} sold out`,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'pi pi-box',
    value: number.format(stats.value?.tickets.inventory ?? 0),
    detail: 'Tickets remaining across all events',
  },
  {
    id: 'inventory-value',
    label: 'Inventory value',
    icon: 'pi pi-wallet',
    values: inventoryValues.value.length > 0 ? inventoryValues.value : ['—'],
    detail: 'Kept per currency, never summed across them',
  },
])

/**
 * Announced when a tile moves.
 *
 * A drag is self-evident to whoever performed it with a pointer and invisible to everyone
 * else. Since the keyboard path exists precisely for people who will not see the tile slide,
 * it has to say what happened.
 */
const moveAnnouncement = ref('')

const arrangement = useSortableList({
  ids: () => tiles.value.map((tile) => tile.id),
  storageKey: 'app.dashboard.tileOrder',
  onMove: (id, position, total) => {
    const label = tiles.value.find((tile) => tile.id === id)?.label ?? id
    moveAnnouncement.value = `${label} moved to position ${position} of ${total}.`
  },
})

/** The tiles in the user's order, each carrying the drag state it needs to render. */
const arrangedTiles = computed(() =>
  arrangement.order.value.flatMap((id, index) => {
    const tile = tiles.value.find((candidate) => candidate.id === id)
    return tile ? [{ ...tile, index }] : []
  }),
)

function resetArrangement(): void {
  arrangement.reset()
  moveAnnouncement.value = 'Tile order reset to the default.'
}
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
      <div class="mb-2 flex items-center justify-end">
        <BaseButton
          v-if="arrangement.isCustomised.value"
          variant="ghost"
          size="sm"
          icon="pi pi-undo"
          label="Reset tile order"
          @click="resetArrangement"
        />
      </div>

      <!--
        `aria-live` rather than a toast: a reorder is a small, repeatable action, and four
        toasts for four arrow presses would be worse than silence. A polite live region says
        it once, to the people who cannot see the tile move.
      -->
      <p class="sr-only" aria-live="polite">{{ moveAnnouncement }}</p>

      <ul class="grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
        <li v-for="tile in arrangedTiles" :key="tile.id" v-bind="arrangement.dragHandlers(tile.id)">
          <StatTile
            :label="tile.label"
            :icon="tile.icon"
            :value="tile.value"
            :values="tile.values"
            :detail="tile.detail"
            :loading="dashboard.isLoading"
            sortable
            :is-dragging="arrangement.draggingId.value === tile.id"
            :is-drop-target="arrangement.overId.value === tile.id"
            :position="tile.index + 1"
            :total="arrangedTiles.length"
            @move="arrangement.moveBy(tile.id, $event)"
          />
        </li>
      </ul>

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
    </template>
  </div>
</template>
