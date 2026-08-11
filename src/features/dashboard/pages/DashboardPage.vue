<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { useAuthStore } from '@/features/auth'
import DashboardPanel from '@/features/dashboard/components/DashboardPanel.vue'
import StatTile from '@/features/dashboard/components/StatTile.vue'
import { useDashboardStore } from '@/features/dashboard/store'
import { EVENT_STATUS_LABELS } from '@/features/events'
import { formatDate } from '@/shared/utils/date'
import { reconcile, useNotifications, useSortableList } from '@/shared/composables'
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
 * literal path strings, the only hardcoded routes in the codebase, because the boundary
 * rule stops a feature importing `app/`. That was working around the boundary rather than
 * respecting it, and it gave up the guarantee `RouteName` exists for: a renamed path would
 * have kept the sidebar working while silently 404ing here.
 */

const auth = useAuthStore()
const dashboard = useDashboardStore()
const notifications = useNotifications()

onMounted(() => {
  void dashboard.fetchStats()
})

const number = new Intl.NumberFormat('en-GB')

const stats = computed(() => dashboard.stats)

/** One formatted amount per currency, never joined into a single figure. */
const inventoryValues = computed(() =>
  (stats.value?.inventoryValue ?? []).map((entry) => formatMoney(entry.totalMinor, entry.currency)),
)

/* ---- arrangeable tiles ---- */

/**
 * Every dashboard widget, whether it is a figure or a panel.
 *
 * One list, not two. Splitting the metrics from the panels would be simpler, and would also
 * mean a user could never move a panel above the figures, which is exactly the arrangement
 * someone who cares more about upcoming events than about totals would want. The `span` keeps
 * the default layout identical to what it was: four one-column tiles fill the first row of the
 * four-column grid, two two-column panels fill the second.
 */
interface WidgetDescriptor {
  id: string
  label: string
  /** Columns occupied in the four-column grid. */
  span: 1 | 2
  icon?: string
  value?: string
  values?: string[]
  detail?: string
  /** Panels render their own body from a named slot instead of a figure. */
  panel?: 'upcoming' | 'busiest'
}

const widgets = computed<WidgetDescriptor[]>(() => [
  {
    id: 'events',
    label: 'Events',
    span: 1,
    icon: 'pi pi-calendar',
    value: number.format(stats.value?.events.total ?? 0),
    detail: `${stats.value?.events.published ?? 0} published · ${stats.value?.events.upcoming ?? 0} upcoming`,
  },
  {
    id: 'tickets',
    label: 'Tickets',
    span: 1,
    icon: 'pi pi-ticket',
    value: number.format(stats.value?.tickets.total ?? 0),
    detail: `${stats.value?.tickets.onSale ?? 0} on sale · ${stats.value?.tickets.soldOut ?? 0} sold out`,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    span: 1,
    icon: 'pi pi-box',
    value: number.format(stats.value?.tickets.inventory ?? 0),
    detail: 'Tickets remaining across all events',
  },
  {
    id: 'inventory-value',
    label: 'Inventory value',
    span: 1,
    icon: 'pi pi-wallet',
    values: inventoryValues.value.length > 0 ? inventoryValues.value : ['—'],
    detail: 'Kept per currency, never summed across them',
  },
  { id: 'upcoming-events', label: 'Upcoming events', span: 2, panel: 'upcoming' },
  {
    id: 'busiest-events',
    label: 'Busiest events',
    span: 2,
    panel: 'busiest',
    detail: 'By number of ticket types.',
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
  ids: () => widgets.value.map((widget) => widget.id),
  storageKey: 'app.dashboard.tileOrder',
  onMove: (id, position, total) => {
    const label = widgets.value.find((widget) => widget.id === id)?.label ?? id
    moveAnnouncement.value = `${label} moved to position ${position} of ${total}.`
  },
})

/** The widgets in the user's order, each carrying the drag state it needs to render. */
const arrangedWidgets = computed(() =>
  arrangement.order.value.flatMap((id, index) => {
    const widget = widgets.value.find((candidate) => candidate.id === id)
    return widget ? [{ ...widget, index }] : []
  }),
)

function resetArrangement(): void {
  arrangement.reset()
  moveAnnouncement.value = 'Layout reset to the default.'
}

/* ---- saving the arrangement to the account ---- */

const saving = ref(false)

/**
 * Whether the on-screen order differs from the one stored against the account.
 *
 * This, rather than "has it been dragged", is what gates the save button: dragging a widget
 * away and back leaves nothing to save, and offering the button anyway would invite a
 * pointless request and a misleading "saved" toast.
 */
const hasUnsavedArrangement = computed(() => {
  const saved = auth.preferences.dashboardOrder
  if (!saved) return arrangement.isCustomised.value

  return (
    reconcile(
      saved,
      widgets.value.map((widget) => widget.id),
    ).join() !== arrangement.order.value.join()
  )
})

async function saveArrangement(): Promise<void> {
  saving.value = true
  try {
    await auth.savePreferences({ dashboardOrder: [...arrangement.order.value] })
    notifications.success('Layout saved', 'It will follow you to any browser you sign in from.')
  } catch (caught) {
    notifications.fromError(caught, 'Could not save the layout. Try again.')
  } finally {
    saving.value = false
  }
}

/**
 * Adopts the saved arrangement once the session is known.
 *
 * Watched rather than read in `onMounted`, because on a page reload the user is restored
 * asynchronously. The dashboard renders before `/auth/me` answers, and reading preferences
 * at mount would find nothing and silently leave the account's layout unapplied.
 */
watch(
  () => auth.preferences.dashboardOrder,
  (saved) => {
    if (saved && saved.length > 0) arrangement.setOrder(saved)
  },
  { immediate: true },
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
      <div class="mb-2 flex items-center justify-end gap-1">
        <BaseButton
          v-if="hasUnsavedArrangement"
          variant="secondary"
          size="sm"
          icon="pi pi-save"
          label="Save layout"
          :loading="saving"
          @click="saveArrangement"
        />
        <BaseButton
          v-if="arrangement.isCustomised.value"
          variant="ghost"
          size="sm"
          icon="pi pi-undo"
          label="Reset layout"
          :disabled="saving"
          @click="resetArrangement"
        />
      </div>

      <!--
        `aria-live` rather than a toast: a reorder is a small, repeatable action, and four
        toasts for four arrow presses would be worse than silence. A polite live region says
        it once, to the people who cannot see the tile move.
      -->
      <p class="sr-only" aria-live="polite">{{ moveAnnouncement }}</p>

      <!--
        One grid for every widget, with each declaring its span. The defaults reproduce the
        previous layout exactly, four single-column tiles fill row one of four, two
        double-column panels fill row two, while allowing any arrangement of the six.

        `items-stretch` plus `h-full` on the child is what makes a short tile match a tall one
        beside it. Grid stretches the `<li>` by default; without the `h-full` the card inside
        it kept its content height and left a gap under itself.
      -->
      <ul class="grid list-none grid-cols-1 items-stretch gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
        <li
          v-for="widget in arrangedWidgets"
          :key="widget.id"
          :class="widget.span === 2 ? 'sm:col-span-2' : ''"
          v-bind="arrangement.dragHandlers(widget.id)"
        >
          <StatTile
            v-if="!widget.panel"
            :label="widget.label"
            :icon="widget.icon"
            :value="widget.value"
            :values="widget.values"
            :detail="widget.detail"
            :loading="dashboard.isLoading"
            sortable
            :is-dragging="arrangement.draggingId.value === widget.id"
            :is-drop-target="arrangement.overId.value === widget.id"
            :position="widget.index + 1"
            :total="arrangedWidgets.length"
            @move="arrangement.moveBy(widget.id, $event)"
          />

          <DashboardPanel
            v-else
            :label="widget.label"
            :detail="widget.detail"
            :is-dragging="arrangement.draggingId.value === widget.id"
            :is-drop-target="arrangement.overId.value === widget.id"
            :position="widget.index + 1"
            :total="arrangedWidgets.length"
            @move="arrangement.moveBy(widget.id, $event)"
          >
            <template v-if="widget.panel === 'upcoming'">
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
            </template>

            <ul v-else class="mt-3 divide-y divide-border">
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
          </DashboardPanel>
        </li>
      </ul>
    </template>
  </div>
</template>
