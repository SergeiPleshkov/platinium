<script setup lang="ts" generic="TRow extends { id: string }">
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable'
import Paginator, { type PageState } from 'primevue/paginator'
import Skeleton from 'primevue/skeleton'
import { computed } from 'vue'

import { useResponsiveLayout } from '@/shared/composables/useBreakpoint'
import type { ListMeta, SortOrder } from '@/shared/types/api'
import type { TableColumn } from '@/shared/ui/BaseDataTable/types'
import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseEmptyState from '@/shared/ui/BaseEmptyState/BaseEmptyState.vue'

/**
 * The application's data table.
 *
 * Presentational only — it holds no query state and talks to no store. `useTable` owns all
 * of that and passes results down, which is what lets the same engine drive this component
 * today and a hand-written table later.
 *
 * Below `md` it renders a card list instead of a grid. Horizontally scrolling a nine-column
 * table on a phone is not "responsive".
 */

interface Props {
  rows: readonly TRow[]
  columns: readonly TableColumn[]
  meta: ListMeta
  loading?: boolean | undefined
  /** True until the first load resolves — shows skeleton rows rather than an empty grid. */
  initialising?: boolean | undefined
  /** Message from a failed load. Renders the error state with a retry action. */
  errorMessage?: string | undefined
  isEmpty?: boolean | undefined
  isFilteredEmpty?: boolean | undefined
  sortField?: string | undefined
  sortOrder?: SortOrder | undefined
  /** Accessible caption; screen-reader users need to know what the grid contains. */
  label: string
  emptyTitle?: string | undefined
  emptyDescription?: string | undefined
  rowsPerPageOptions?: readonly number[] | undefined
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  initialising: false,
  isEmpty: false,
  isFilteredEmpty: false,
  emptyTitle: 'Nothing here yet',
  rowsPerPageOptions: () => [10, 25, 50, 100],
})

const emit = defineEmits<{
  sort: [field: string]
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  retry: []
  clearFilters: []
}>()

defineSlots<{
  /** Per-column cell override, named `cell-<field>`. */
  [key: `cell-${string}`]: ((props: { row: TRow }) => unknown) | undefined
  actions?: (props: { row: TRow }) => unknown
  emptyAction?: () => unknown
}>()

const { isMobile } = useResponsiveLayout()

const skeletonRows = computed(() =>
  Array.from({ length: Math.min(props.meta.perPage, 8) }, (_unused, index) => ({
    id: `skeleton-${index}`,
  })),
)

const primaryColumn = computed(
  () => props.columns.find((column) => column.priority === 'primary') ?? props.columns[0],
)

const cardColumns = computed(() =>
  props.columns.filter(
    (column) => !column.hideOnMobile && column.field !== primaryColumn.value?.field,
  ),
)

/** PrimeVue reports sort direction as 1 / -1; our contract is 'asc' / 'desc'. */
const primeSortOrder = computed(() => (props.sortOrder === 'asc' ? 1 : -1))

const firstRecord = computed(() => (props.meta.page - 1) * props.meta.perPage)

/** Default cell rendering, for columns with no `cell-<field>` slot. */
function cellValue(row: TRow, field: string): unknown {
  return (row as Record<string, unknown>)[field]
}

function onSort(event: DataTableSortEvent): void {
  if (typeof event.sortField === 'string') emit('sort', event.sortField)
}

function onPage(event: DataTablePageEvent | PageState): void {
  if (event.rows !== props.meta.perPage) emit('update:perPage', event.rows)
  else emit('update:page', event.page + 1)
}

const showEmptyState = computed(
  () => !props.initialising && (props.isEmpty || props.isFilteredEmpty),
)
</script>

<template>
  <div class="rounded-lg border border-border bg-surface-0 dark:bg-surface-900">
    <!--
      Error takes precedence over every other state: a stale grid under an invisible failure
      is worse than no grid, because the user believes what they are looking at.
    -->
    <div v-if="errorMessage" class="px-6 py-12 text-center" role="alert">
      <i
        class="pi pi-exclamation-triangle text-3xl text-red-600 dark:text-red-400"
        aria-hidden="true"
      />
      <p class="mt-3 font-medium text-content">Could not load {{ label.toLowerCase() }}</p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-content-muted">{{ errorMessage }}</p>
      <BaseButton class="mt-4" variant="secondary" icon="pi pi-refresh" @click="emit('retry')">
        Try again
      </BaseButton>
    </div>

    <template v-else-if="showEmptyState">
      <BaseEmptyState
        v-if="isFilteredEmpty"
        icon="pi pi-filter-slash"
        title="No matches"
        description="No records match the current search and filters."
      >
        <template #action>
          <BaseButton variant="secondary" @click="emit('clearFilters')">Clear filters</BaseButton>
        </template>
      </BaseEmptyState>

      <BaseEmptyState v-else :title="emptyTitle" :description="emptyDescription">
        <template v-if="$slots.emptyAction" #action>
          <slot name="emptyAction" />
        </template>
      </BaseEmptyState>
    </template>

    <!-- Mobile: cards, not a grid. -->
    <template v-else-if="isMobile">
      <ul v-if="initialising" class="divide-y divide-border">
        <li v-for="placeholder in skeletonRows" :key="placeholder.id" class="p-4">
          <Skeleton width="60%" height="1.1rem" />
          <Skeleton class="mt-2" width="40%" height="0.8rem" />
        </li>
      </ul>

      <ul v-else class="divide-y divide-border" :aria-label="label">
        <li v-for="row in rows" :key="row.id" class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-content">
                <slot v-if="primaryColumn" :name="`cell-${primaryColumn.field}`" :row="row">
                  {{ cellValue(row, primaryColumn.field) }}
                </slot>
              </p>
              <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <template v-for="column in cardColumns" :key="column.field">
                  <dt class="text-xs text-content-muted">{{ column.header }}</dt>
                  <dd class="truncate text-right text-xs text-content">
                    <slot :name="`cell-${column.field}`" :row="row">
                      {{ cellValue(row, column.field) }}
                    </slot>
                  </dd>
                </template>
              </dl>
            </div>
            <div v-if="$slots.actions" class="shrink-0">
              <slot name="actions" :row="row" />
            </div>
          </div>
        </li>
      </ul>

      <Paginator
        v-if="meta.total > 0"
        :first="firstRecord"
        :rows="meta.perPage"
        :total-records="meta.total"
        :rows-per-page-options="[...rowsPerPageOptions]"
        @page="onPage"
      />
    </template>

    <!-- Tablet and up: a real grid, with server-driven paging and sorting. -->
    <DataTable
      v-else
      :value="initialising ? skeletonRows : rows"
      lazy
      :loading="loading && !initialising"
      :paginator="!initialising && meta.total > 0"
      :rows="meta.perPage"
      :first="firstRecord"
      :total-records="meta.total"
      :rows-per-page-options="[...rowsPerPageOptions]"
      :sort-field="sortField"
      :sort-order="primeSortOrder"
      :aria-label="label"
      data-key="id"
      removable-sort
      @sort="onSort"
      @page="onPage"
    >
      <Column
        v-for="column in columns"
        :key="column.field"
        :field="column.field"
        :header="column.header"
        :sortable="column.sortable ?? false"
        :body-class="column.cellClass"
      >
        <template #body="{ data }">
          <Skeleton v-if="initialising" width="70%" height="1rem" />
          <slot v-else :name="`cell-${column.field}`" :row="data as TRow">
            {{ cellValue(data as TRow, column.field) }}
          </slot>
        </template>
      </Column>

      <Column v-if="$slots.actions" header="Actions" :style="{ width: '1%' }">
        <template #body="{ data }">
          <Skeleton v-if="initialising" width="4rem" height="1rem" />
          <slot v-else name="actions" :row="data as TRow" />
        </template>
      </Column>
    </DataTable>
  </div>
</template>
