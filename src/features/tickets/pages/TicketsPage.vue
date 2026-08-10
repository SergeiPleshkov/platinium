<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useCategoriesStore } from '@/features/categories'
import { useEventsStore } from '@/features/events'
import TicketFormDialog from '@/features/tickets/components/TicketFormDialog.vue'
import { useTicketsStore } from '@/features/tickets/store'
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_OPTIONS,
  TICKET_STATUS_TONES,
  type TicketWithRelations,
} from '@/features/tickets/types'
import { ApiError } from '@/shared/api'
import { useListView, useNotifications } from '@/shared/composables'
import { formatMoney } from '@/shared/utils/money'
import {
  BaseBadge,
  BaseButton,
  BaseConfirmDialog,
  BaseDataTable,
  BaseSearchInput,
  BaseSelect,
  TableViewModeSwitch,
  type TableColumn,
} from '@/shared/ui'

/**
 * Tickets: pricing, inventory and availability.
 *
 * The relational slice. Rows show event and category *names*, which the API embeds — the
 * client never resolves an id, and never loads every event to do it.
 */

const store = useTicketsStore()
const eventsStore = useEventsStore()
const categoriesStore = useCategoriesStore()
const notifications = useNotifications()

const { table, viewMode, onRangeChange } = useListView({
  fetchList: (query, signal) => store.fetchList(query, signal),
  fetchWindow: (query, signal) => store.fetchWindow(query, signal),
  resetBuffer: () => store.resetBuffer(),
  defaultSort: 'createdAt',
  defaultOrder: 'desc',
  filterKeys: ['status', 'eventId', 'categoryId'],
})

onMounted(() => {
  void eventsStore.fetchOptions()
  void categoriesStore.fetchOptions()
})

/* Widths are for virtual mode's fixed layout — see the note in CategoriesPage. */
const columns: TableColumn[] = [
  { field: 'name', header: 'Name', sortable: true, priority: 'primary' },
  { field: 'event', header: 'Event', sortable: true },
  { field: 'category', header: 'Category', sortable: true, width: '11rem' },
  {
    field: 'priceMinor',
    header: 'Price',
    sortable: true,
    cellClass: 'text-right',
    width: '6rem',
  },
  {
    field: 'quantity',
    header: 'Quantity',
    sortable: true,
    cellClass: 'text-right',
    width: '7rem',
  },
  { field: 'status', header: 'Status', sortable: true, width: '6rem' },
]

function filterModel(key: string) {
  return computed({
    get: () => (table.filters.value[key] as string | undefined) ?? null,
    set: (value: string | null) => table.setFilter(key, value ?? undefined),
  })
}

const statusFilter = filterModel('status')
const eventFilter = filterModel('eventId')
const categoryFilter = filterModel('categoryId')

const eventOptions = computed(() =>
  eventsStore.options.map((option) => ({ value: option.id, label: option.name })),
)
const categoryOptions = computed(() =>
  categoriesStore.options.map((option) => ({ value: option.id, label: option.name })),
)

/* ---- create / edit ---- */

const formOpen = ref(false)
const editing = ref<TicketWithRelations | null>(null)

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(ticket: TicketWithRelations): void {
  editing.value = ticket
  formOpen.value = true
}

async function onSaved(): Promise<void> {
  await table.refresh()
}

/* ---- export ---- */

const exporting = ref(false)

async function exportCsv(): Promise<void> {
  exporting.value = true
  try {
    // The *current* query, not the current page: what you filtered is what you get.
    await store.exportCsv(table.query.value)
    notifications.success('Export ready', `${store.meta.total} tickets downloaded as CSV.`)
  } catch (caught) {
    notifications.fromError(caught, 'Could not export the tickets. Try again.')
  } finally {
    exporting.value = false
  }
}

/* ---- delete ---- */

const deleting = ref<TicketWithRelations | null>(null)
const deletePending = ref(false)
const deleteError = ref<string | null>(null)

const confirmMessage = computed(() =>
  deleting.value
    ? `“${deleting.value.name}” for ${deleting.value.event.name} will be permanently deleted.`
    : '',
)

function askDelete(ticket: TicketWithRelations): void {
  deleting.value = ticket
  deleteError.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleting.value
  if (!target) return

  deletePending.value = true
  deleteError.value = null

  try {
    await store.remove(target.id)
    notifications.success('Ticket deleted', `“${target.name}” has been removed.`)
    deleting.value = null
    await table.refresh()
    table.adoptPage(store.meta.page)
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'Could not delete the ticket. Try again.'
  } finally {
    deletePending.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-content">Tickets</h1>
        <p class="mt-1 text-sm text-content-muted">Pricing, inventory and availability.</p>
      </div>
      <div class="flex gap-2">
        <BaseButton
          variant="secondary"
          icon="pi pi-download"
          label="Export CSV"
          :loading="exporting"
          @click="exportCsv"
        />
        <BaseButton icon="pi pi-plus" label="New ticket" @click="openCreate" />
      </div>
    </header>

    <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_14rem_12rem]">
      <BaseSearchInput v-model="table.search.value" label="Search tickets" />
      <BaseSelect
        v-model="statusFilter"
        label="Status"
        label-hidden
        placeholder="All statuses"
        :options="TICKET_STATUS_OPTIONS"
        clearable
      />
      <BaseSelect
        v-model="eventFilter"
        label="Event"
        label-hidden
        placeholder="All events"
        :options="eventOptions"
        clearable
        filterable
      />
      <BaseSelect
        v-model="categoryFilter"
        label="Category"
        label-hidden
        placeholder="All categories"
        :options="categoryOptions"
        clearable
        filterable
      />
    </div>

    <div class="mb-4 flex justify-end">
      <TableViewModeSwitch />
    </div>

    <BaseDataTable
      :rows="store.items"
      :columns="columns"
      :meta="store.meta"
      :loading="store.isLoading"
      :initialising="store.isInitialising"
      :error-message="store.errorMessage"
      :is-empty="store.isEmpty && !table.hasActiveFilters.value"
      :is-filtered-empty="store.isEmpty && table.hasActiveFilters.value"
      :sort-field="table.sortField.value"
      :sort-order="table.sortOrder.value"
      :mode="viewMode.mode.value"
      :virtual-rows="store.buffer"
      label="Tickets"
      empty-title="No tickets yet"
      empty-description="Create a ticket against an event to start selling."
      @sort="table.toggleSort"
      @update:page="table.setPage"
      @update:per-page="table.setPerPage"
      @retry="table.refresh"
      @clear-filters="table.clearFilters"
      @range-change="onRangeChange"
    >
      <!-- Relations render as names, embedded by the API. No id ever reaches the screen. -->
      <template #cell-event="{ row }">
        <span class="text-content">{{ row.event.name }}</span>
      </template>

      <template #cell-category="{ row }">
        <span class="text-content-muted">{{ row.category.name }}</span>
      </template>

      <template #cell-priceMinor="{ row }">
        <span class="tabular-nums whitespace-nowrap">
          {{ formatMoney(row.priceMinor, row.currency) }}
        </span>
      </template>

      <template #cell-quantity="{ row }">
        <span class="tabular-nums">{{ row.quantity.toLocaleString('en-GB') }}</span>
      </template>

      <template #cell-status="{ row }">
        <BaseBadge
          :label="TICKET_STATUS_LABELS[row.status]"
          :tone="TICKET_STATUS_TONES[row.status]"
        />
      </template>

      <template #actions="{ row }">
        <div class="flex justify-end gap-1">
          <BaseButton
            variant="ghost"
            size="sm"
            icon="pi pi-pencil"
            :aria-label="`Edit ${row.name}`"
            @click="openEdit(row)"
          />
          <BaseButton
            variant="ghost"
            size="sm"
            icon="pi pi-trash"
            :aria-label="`Delete ${row.name}`"
            @click="askDelete(row)"
          />
        </div>
      </template>

      <template #emptyAction>
        <BaseButton icon="pi pi-plus" label="New ticket" @click="openCreate" />
      </template>
    </BaseDataTable>

    <TicketFormDialog v-model:open="formOpen" :ticket="editing" @saved="onSaved" />

    <BaseConfirmDialog
      :open="deleting !== null"
      title="Delete ticket"
      :message="confirmMessage"
      confirm-label="Delete ticket"
      :busy="deletePending"
      :error-message="deleteError ?? undefined"
      @update:open="deleting = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
