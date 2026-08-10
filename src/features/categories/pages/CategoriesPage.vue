<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import CategoryFormDialog from '@/features/categories/components/CategoryFormDialog.vue'
import { useCategoriesStore } from '@/features/categories/store'
import type { Category } from '@/features/categories/types'
import { usePermissions } from '@/features/auth'
import { ApiError } from '@/shared/api'
import { useBulkAction, useListView, useNotifications, useRowSelection } from '@/shared/composables'
import {
  BaseBadge,
  BaseBulkBar,
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
 * `BaseDataTable` (which renders). The page itself holds only what is genuinely local: which
 * dialog is open, and which record it is about.
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

/* ---- create / edit ---- */

const formOpen = ref(false)
const editing = ref<Category | null>(null)

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(category: Category): void {
  editing.value = category
  formOpen.value = true
}

async function onSaved(): Promise<void> {
  // A new record may belong on another page under the current sort, so re-query.
  await table.refresh()
}

/* ---- delete ---- */

const deleting = ref<Category | null>(null)
const deletePending = ref(false)
const deleteError = ref<string | null>(null)

const confirmMessage = computed(() =>
  deleting.value
    ? `“${deleting.value.name}” will be permanently deleted. This cannot be undone.`
    : '',
)

function askDelete(category: Category): void {
  deleting.value = category
  deleteError.value = null
}

async function confirmDelete(): Promise<void> {
  const target = deleting.value
  if (!target) return

  deletePending.value = true
  deleteError.value = null

  try {
    await store.remove(target.id)
    notifications.success('Category deleted', `“${target.name}” has been removed.`)
    deleting.value = null

    /*
     * Deleting the last row on a page leaves it empty; the server clamps to the last valid
     * page and `adoptPage` follows it, so the user never lands on a blank table.
     */
    await table.refresh()
    table.adoptPage(store.meta.page)
  } catch (caught) {
    // Kept in the dialog rather than a toast: the explanation belongs next to the action.
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'Could not delete the category. Try again.'
  } finally {
    deletePending.value = false
  }
}
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

    <div
      v-if="bulk.hasFailures.value"
      class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
      role="alert"
      aria-label="Bulk action failures"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-content">
            {{ bulk.failures.value.length }} could not be changed
          </p>
          <ul class="mt-2 space-y-1">
            <li
              v-for="failure in bulk.failures.value"
              :key="failure.id"
              class="text-sm text-content-muted"
            >
              <span class="font-medium text-content">{{ failure.label }}</span>
              — {{ failure.reason }}
            </li>
          </ul>
        </div>
        <BaseButton
          variant="ghost"
          size="sm"
          icon="pi pi-times"
          aria-label="Dismiss failure report"
          @click="bulk.dismissFailures"
        />
      </div>
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
      @update:open="deleting = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
