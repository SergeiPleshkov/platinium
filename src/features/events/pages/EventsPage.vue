<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import EventFormDialog from '@/features/events/components/EventFormDialog.vue'
import { useEventsStore } from '@/features/events/store'
import {
  EVENT_STATUS_LABELS,
  EVENT_STATUS_OPTIONS,
  EVENT_STATUS_TONES,
  type Event,
} from '@/features/events/types'
import { ApiError } from '@/shared/api'
import { useNotifications, useTable } from '@/shared/composables'
import { formatDateRange } from '@/shared/utils/date'
import {
  BaseBadge,
  BaseButton,
  BaseConfirmDialog,
  BaseDataTable,
  BaseSearchInput,
  BaseSelect,
  type TableColumn,
} from '@/shared/ui'

/** Events: dates, venues and publication status. */

const store = useEventsStore()
const notifications = useNotifications()

const table = useTable({
  onQuery: (query, signal) => store.fetchList(query, signal),
  defaultSort: 'startDate',
  defaultOrder: 'asc',
  // Declared so these survive a reload and stay in a shared link.
  filterKeys: ['status', 'country'],
})

onMounted(() => {
  void store.fetchCountries()
})

const columns: TableColumn[] = [
  { field: 'name', header: 'Name', sortable: true, priority: 'primary' },
  { field: 'startDate', header: 'Dates', sortable: true },
  { field: 'venue', header: 'Venue', sortable: true },
  { field: 'country', header: 'Country', sortable: true },
  { field: 'status', header: 'Status', sortable: true },
  { field: 'ticketCount', header: 'Tickets', sortable: true, cellClass: 'text-right' },
]

const statusFilter = computed({
  get: () => (table.filters.value['status'] as string | undefined) ?? null,
  set: (value) => table.setFilter('status', value ?? undefined),
})

const countryFilter = computed({
  get: () => (table.filters.value['country'] as string | undefined) ?? null,
  set: (value) => table.setFilter('country', value ?? undefined),
})

const countryOptions = computed(() => store.countries.map((value) => ({ value, label: value })))

/* ---- create / edit ---- */

const formOpen = ref(false)
const editing = ref<Event | null>(null)

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(event: Event): void {
  editing.value = event
  formOpen.value = true
}

async function onSaved(): Promise<void> {
  await Promise.all([table.refresh(), store.fetchCountries()])
}

/* ---- delete ---- */

const deleting = ref<Event | null>(null)
const deletePending = ref(false)
const deleteError = ref<string | null>(null)

const confirmMessage = computed(() =>
  deleting.value
    ? `“${deleting.value.name}” will be permanently deleted. This cannot be undone.`
    : '',
)

function askDelete(event: Event): void {
  deleting.value = event
  deleteError.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleting.value
  if (!target) return

  deletePending.value = true
  deleteError.value = null

  try {
    await store.remove(target.id)
    notifications.success('Event deleted', `“${target.name}” has been removed.`)
    deleting.value = null
    await table.refresh()
    table.adoptPage(store.meta.page)
  } catch (caught) {
    /*
     * An event with tickets cannot be deleted. The server says how many; showing that in the
     * dialog tells the admin what to do next, which a generic failure toast would not.
     */
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'Could not delete the event. Try again.'
  } finally {
    deletePending.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-content">Events</h1>
        <p class="mt-1 text-sm text-content-muted">Dates, venues and publication status.</p>
      </div>
      <BaseButton icon="pi pi-plus" label="New event" @click="openCreate" />
    </header>

    <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_13rem]">
      <BaseSearchInput v-model="table.search.value" label="Search events" />
      <BaseSelect
        v-model="statusFilter"
        label="Status"
        label-hidden
        placeholder="All statuses"
        :options="EVENT_STATUS_OPTIONS"
        clearable
      />
      <BaseSelect
        v-model="countryFilter"
        label="Country"
        label-hidden
        placeholder="All countries"
        :options="countryOptions"
        clearable
        filterable
      />
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
      label="Events"
      empty-title="No events yet"
      empty-description="Create an event before adding tickets to it."
      @sort="table.toggleSort"
      @update:page="table.setPage"
      @update:per-page="table.setPerPage"
      @retry="table.refresh"
      @clear-filters="table.clearFilters"
    >
      <template #cell-startDate="{ row }">
        <span class="whitespace-nowrap">{{ formatDateRange(row.startDate, row.endDate) }}</span>
      </template>

      <template #cell-status="{ row }">
        <BaseBadge
          :label="EVENT_STATUS_LABELS[row.status]"
          :tone="EVENT_STATUS_TONES[row.status]"
        />
      </template>

      <template #cell-ticketCount="{ row }">
        <span class="tabular-nums">{{ row.ticketCount }}</span>
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
        <BaseButton icon="pi pi-plus" label="New event" @click="openCreate" />
      </template>
    </BaseDataTable>

    <EventFormDialog v-model:open="formOpen" :event="editing" @saved="onSaved" />

    <BaseConfirmDialog
      :open="deleting !== null"
      title="Delete event"
      :message="confirmMessage"
      confirm-label="Delete event"
      :busy="deletePending"
      :error-message="deleteError ?? undefined"
      @update:open="deleting = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
