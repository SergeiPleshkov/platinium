<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import EventFormDialog from '@/features/events/components/EventFormDialog.vue'
import { useEventsStore } from '@/features/events/store'
import {
  EVENT_STATUS_LABELS,
  EVENT_STATUS_OPTIONS,
  EVENT_STATUS_TONES,
  type Event,
} from '@/features/events/types'
import { usePermissions } from '@/features/auth'
import {
  useBulkAction,
  useEntityPage,
  useListView,
  useNotifications,
  useRowSelection,
} from '@/shared/composables'
import { formatDateRange } from '@/shared/utils/date'
import {
  BaseBadge,
  BaseBulkBar,
  BaseBulkFailures,
  BaseButton,
  BaseConfirmDialog,
  BaseDataTable,
  BaseSearchInput,
  BaseSelect,
  TableViewModeSwitch,
  type TableColumn,
} from '@/shared/ui'

/** Events: dates, venues and publication status. */

const store = useEventsStore()
const notifications = useNotifications()
/*
 * Gating here rather than inside `BaseDataTable`: a shared primitive must not know what
 * a role is. The page owns the domain question, the kit owns the rendering.
 */
const permissions = usePermissions()

const { table, viewMode, onRangeChange } = useListView({
  fetchList: (query, signal) => store.fetchList(query, signal),
  fetchWindow: (query, signal) => store.fetchWindow(query, signal),
  resetBuffer: () => store.resetBuffer(),
  defaultSort: 'startDate',
  defaultOrder: 'asc',
  // Declared so these survive a reload and stay in a shared link.
  filterKeys: ['status', 'country'],
})

onMounted(() => {
  void store.fetchCountries()
})

/* Widths are for virtual mode's fixed layout, see the note in CategoriesPage. */
const columns: TableColumn[] = [
  { field: 'name', header: 'Name', sortable: true, priority: 'primary' },
  { field: 'startDate', header: 'Dates', sortable: true, width: '13rem' },
  { field: 'venue', header: 'Venue', sortable: true },
  { field: 'country', header: 'Country', sortable: true, width: '10rem' },
  { field: 'status', header: 'Status', sortable: true, width: '8rem' },
  {
    field: 'ticketCount',
    header: 'Tickets',
    sortable: true,
    cellClass: 'text-right',
    width: '7rem',
  },
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

/* ---- bulk actions ---- */

const selection = useRowSelection()

// A selection only means anything against the query that produced it.
watch(
  () => table.query.value,
  () => selection.clear(),
)

const bulk = useBulkAction({
  run: (payload) => store.bulk(payload),
  refresh: () => table.refresh(),
  clearSelection: selection.clear,
  labelFor: (id) => store.items.find((event) => event.id === id)?.name ?? id,
  entityLabel: 'events',
})

const bulkDeleteOpen = ref(false)

const bulkDeleteMessage = computed(
  () =>
    `${selection.count.value} event${selection.count.value === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`,
)

async function confirmBulkDelete(): Promise<void> {
  bulkDeleteOpen.value = false
  await bulk.execute({ action: 'delete', ids: selection.selectedIds.value }, 'deleted')
}

async function applyBulkStatus(status: string): Promise<void> {
  await bulk.execute({ action: 'status', ids: selection.selectedIds.value, status }, 'updated')
}

const {
  formOpen,
  editing,
  openCreate,
  openEdit,
  onSaved,
  deleting,
  deletePending,
  deleteError,
  askDelete,
  closeDelete,
  confirmDelete,
} = useEntityPage<Event>({
  refresh: () => table.refresh(),
  adoptPage: (page) => table.adoptPage(page),
  currentPage: () => store.meta.page,
  remove: (id) => store.remove(id),
  entityLabel: 'Event',
  success: notifications.success,
  afterSave: () => store.fetchCountries(),
})

const confirmMessage = computed(() =>
  deleting.value
    ? `“${deleting.value.name}” will be permanently deleted. This cannot be undone.`
    : '',
)
</script>

<template>
  <div>
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-semibold text-content">Events</h1>
          <!-- Explains the missing buttons. Absence alone reads as a broken page. -->
          <BaseBadge v-if="permissions.readOnly.value" label="Read only" tone="info" />
        </div>
        <p class="mt-1 text-sm text-content-muted">Dates, venues and publication status.</p>
      </div>
      <BaseButton
        v-if="permissions.canCreate.value"
        icon="pi pi-plus"
        label="New event"
        @click="openCreate"
      />
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

    <div class="mb-4 flex justify-end">
      <TableViewModeSwitch />
    </div>

    <BaseBulkBar
      :count="selection.count.value"
      :status-options="EVENT_STATUS_OPTIONS"
      :can-update="permissions.canUpdate.value"
      :can-delete="permissions.canDelete.value"
      :busy="bulk.busy.value"
      entity-label="events"
      @apply-status="applyBulkStatus"
      @delete-selected="bulkDeleteOpen = true"
      @clear="selection.clear"
    />

    <BaseBulkFailures :failures="bulk.failures.value" @dismiss="bulk.dismissFailures" />

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
      :selectable="permissions.canUpdate.value || permissions.canDelete.value"
      :selected-ids="selection.selectedIds.value"
      label="Events"
      empty-title="No events yet"
      empty-description="Create an event before adding tickets to it."
      @sort="table.toggleSort"
      @update:page="table.setPage"
      @update:per-page="table.setPerPage"
      @retry="table.refresh"
      @clear-filters="table.clearFilters"
      @range-change="onRangeChange"
      @toggle-row="selection.toggle"
      @toggle-all="selection.setMany"
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

      <!--
        The whole slot goes, not just the buttons: leaving it would render an empty
        "Actions" column header over a column of nothing.
      -->
      <template
        v-if="permissions.canUpdate.value || permissions.canDelete.value"
        #actions="{ row }"
      >
        <div class="flex justify-end gap-1">
          <BaseButton
            v-if="permissions.canUpdate.value"
            variant="ghost"
            size="sm"
            icon="pi pi-pencil"
            :aria-label="`Edit ${row.name}`"
            @click="openEdit(row)"
          />
          <BaseButton
            v-if="permissions.canDelete.value"
            variant="ghost"
            size="sm"
            icon="pi pi-trash"
            :aria-label="`Delete ${row.name}`"
            @click="askDelete(row)"
          />
        </div>
      </template>

      <template #emptyAction>
        <BaseButton
          v-if="permissions.canCreate.value"
          icon="pi pi-plus"
          label="New event"
          @click="openCreate"
        />
      </template>
    </BaseDataTable>

    <EventFormDialog v-model:open="formOpen" :event="editing" @saved="onSaved" />

    <BaseConfirmDialog
      :open="bulkDeleteOpen"
      title="Delete events"
      :message="bulkDeleteMessage"
      confirm-label="Delete events"
      :busy="bulk.busy.value"
      @update:open="bulkDeleteOpen = false"
      @confirm="confirmBulkDelete"
    />

    <BaseConfirmDialog
      :open="deleting !== null"
      title="Delete event"
      :message="confirmMessage"
      confirm-label="Delete event"
      :busy="deletePending"
      :error-message="deleteError ?? undefined"
      @update:open="closeDelete"
      @confirm="confirmDelete"
    />
  </div>
</template>
