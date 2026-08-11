<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import CategoryFormDialog from '@/features/categories/components/CategoryFormDialog.vue'
import { useCategoriesStore } from '@/features/categories/store'
import type { Category } from '@/features/categories/types'
import { usePermissions } from '@/features/auth'
import {
  useBulkAction,
  useEntityPage,
  useListView,
  useNotifications,
  useRowSelection,
} from '@/shared/composables'
import {
  BaseBadge,
  BaseBulkBar,
  BaseBulkFailures,
  BaseButton,
  BaseConfirmDialog,
  BaseDataTable,
  BaseSearchInput,
  TableViewModeSwitch,
  type TableColumn,
} from '@/shared/ui'

/**
 * Ticket categories.
 *
 * Wires the store (which owns the rows) to `useTable` (which owns the query) to
 * `BaseDataTable` (which renders). Dialog open/close and single-delete live in
 * `useEntityPage`; this page keeps columns, bulk actions and permissions.
 */

const store = useCategoriesStore()
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
  defaultSort: 'name',
  defaultOrder: 'asc',
})

/*
 * `width` is only read in virtual mode, which lays out with `table-layout: fixed` so the
 * columns stop resizing as rows recycle. The two text columns declare none and share what is
 * left, which is what they want anyway.
 */
const columns: TableColumn[] = [
  { field: 'name', header: 'Name', sortable: true, priority: 'primary', width: '18rem' },
  { field: 'description', header: 'Description' },
  {
    field: 'ticketCount',
    header: 'Tickets',
    sortable: true,
    cellClass: 'text-right',
    width: '7rem',
  },
]

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
  labelFor: (id) => store.items.find((category) => category.id === id)?.name ?? id,
  entityLabel: 'categories',
})

const bulkDeleteOpen = ref(false)

const bulkDeleteMessage = computed(
  () =>
    `${selection.count.value} category${selection.count.value === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`,
)

async function confirmBulkDelete(): Promise<void> {
  bulkDeleteOpen.value = false
  await bulk.execute({ action: 'delete', ids: selection.selectedIds.value }, 'deleted')
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
} = useEntityPage<Category>({
  refresh: () => table.refresh(),
  adoptPage: (page) => table.adoptPage(page),
  currentPage: () => store.meta.page,
  remove: (id) => store.remove(id),
  entityLabel: 'Category',
  success: notifications.success,
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
          <h1 class="text-2xl font-semibold text-content">Categories</h1>
          <!-- Explains the missing buttons. Absence alone reads as a broken page. -->
          <BaseBadge v-if="permissions.readOnly.value" label="Read only" tone="info" />
        </div>
        <p class="mt-1 text-sm text-content-muted">Ticket tiers, shared across every event.</p>
      </div>
      <BaseButton
        v-if="permissions.canCreate.value"
        icon="pi pi-plus"
        label="New category"
        @click="openCreate"
      />
    </header>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="w-full sm:w-auto sm:max-w-xs sm:min-w-64">
        <BaseSearchInput v-model="table.search.value" label="Search categories" />
      </div>
      <TableViewModeSwitch />
    </div>

    <BaseBulkBar
      :count="selection.count.value"
      :can-update="permissions.canUpdate.value"
      :can-delete="permissions.canDelete.value"
      :busy="bulk.busy.value"
      entity-label="categories"
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
      label="Categories"
      empty-title="No categories yet"
      empty-description="Ticket tiers group tickets across events. Create the first one."
      @sort="table.toggleSort"
      @update:page="table.setPage"
      @update:per-page="table.setPerPage"
      @retry="table.refresh"
      @clear-filters="table.clearFilters"
      @range-change="onRangeChange"
      @toggle-row="selection.toggle"
      @toggle-all="selection.setMany"
    >
      <template #cell-description="{ row }">
        <span class="text-content-muted">{{ row.description || '—' }}</span>
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
          label="New category"
          @click="openCreate"
        />
      </template>
    </BaseDataTable>

    <CategoryFormDialog v-model:open="formOpen" :category="editing" @saved="onSaved" />

    <BaseConfirmDialog
      :open="bulkDeleteOpen"
      title="Delete categories"
      :message="bulkDeleteMessage"
      confirm-label="Delete categories"
      :busy="bulk.busy.value"
      @update:open="bulkDeleteOpen = false"
      @confirm="confirmBulkDelete"
    />

    <BaseConfirmDialog
      :open="deleting !== null"
      title="Delete category"
      :message="confirmMessage"
      confirm-label="Delete category"
      :busy="deletePending"
      :error-message="deleteError ?? undefined"
      @update:open="closeDelete"
      @confirm="confirmDelete"
    />
  </div>
</template>
