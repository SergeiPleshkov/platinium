<script setup lang="ts" generic="TRow extends { id: string }">
import { computed } from 'vue'

import { useResponsiveLayout } from '@/shared/composables/useBreakpoint'
import { isPendingRow, type BufferRow } from '@/shared/composables/useCollectionState'
import type { ListMeta, SortOrder } from '@/shared/types/api'
import type { TableColumn, TableViewMode } from '@/shared/ui/BaseDataTable/types'
import BaseButton from '@/shared/ui/BaseButton/BaseButton.vue'
import BaseDataTableCards from '@/shared/ui/BaseDataTable/BaseDataTableCards.vue'
import BaseDataTableGrid from '@/shared/ui/BaseDataTable/BaseDataTableGrid.vue'
import BaseEmptyState from '@/shared/ui/BaseEmptyState/BaseEmptyState.vue'

/**
 * The application's data table.
 *
 * Presentational only: it holds no query state and talks to no store. `useTable` owns all
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
  /** True until the first load resolves, shows skeleton rows rather than an empty grid. */
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
  /**
   * `paginated` renders one server page with a paginator. `virtual` renders the whole result
   * set as a scrollable window, fetching pages as they come into view. Grid only, see the
   * note on `useVirtualGrid` below.
   */
  mode?: TableViewMode | undefined
  /** Length-`meta.total` buffer, unfetched pages standing in as placeholders. Virtual mode only. */
  virtualRows?: ReadonlyArray<BufferRow<TRow>> | undefined
  /** Height of the virtual viewport. Fixed by necessity: the scroller needs a known box. */
  scrollHeight?: string | undefined
  /**
   * Ids the user has ticked. Presence of this prop is what turns the checkbox column on, so a
   * table with no bulk actions renders exactly as it did before.
   */
  selectedIds?: readonly string[] | undefined
  selectable?: boolean | undefined
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  initialising: false,
  isEmpty: false,
  isFilteredEmpty: false,
  emptyTitle: 'Nothing here yet',
  rowsPerPageOptions: () => [10, 25, 50, 100],
  mode: 'paginated',
  virtualRows: () => [],
  scrollHeight: '32rem',
  selectedIds: () => [],
  selectable: false,
})

const emit = defineEmits<{
  sort: [field: string]
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  retry: []
  clearFilters: []
  /** Virtual mode: the visible window moved. Indices are zero-based, `last` inclusive. */
  rangeChange: [first: number, last: number]
  toggleRow: [id: string]
  /** The header checkbox. `ids` is every row currently rendered, not the whole result set. */
  toggleAll: [ids: string[], selected: boolean]
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

const firstRecord = computed(() => (props.meta.page - 1) * props.meta.perPage)

/** Default cell rendering, for columns with no `cell-<field>` slot. */
function cellValue(row: TRow, field: string): unknown {
  return (row as Record<string, unknown>)[field]
}

const showEmptyState = computed(
  () => !props.initialising && (props.isEmpty || props.isFilteredEmpty),
)

/**
 * Virtual mode is a *grid* mode. Below `md` this renders cards, whose height depends on their
 * content, and forcing them to a fixed height to satisfy the scroller would let the technique
 * dictate the design. Narrow viewports keep the paginator; the page hides the switch there.
 */
const useVirtualGrid = computed(() => props.mode === 'virtual' && !isMobile.value)

/* ---- selection ---- */

const selectedSet = computed(() => new Set(props.selectedIds))

function isRowSelected(id: string): boolean {
  return selectedSet.value.has(id)
}

/**
 * Prefer the primary column's visible text over a raw id so the checkbox announces what
 * the user actually sees on the row.
 */
function rowSelectLabel(row: TRow): string {
  const primary = primaryColumn.value
  if (primary) {
    const value = cellValue(row, primary.field)
    if (typeof value === 'string' && value.trim() !== '') return `Select ${value}`
    if (
      value !== null &&
      typeof value === 'object' &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      return `Select ${value.name}`
    }
  }
  return `Select row ${row.id}`
}

/**
 * Ids the header checkbox acts on: the rows on screen, not the whole result set.
 *
 * "Select all" meaning *all 250* would be a different feature and a more dangerous one, because the
 * user cannot see what they are agreeing to. This selects what is visible, and the count in
 * the action bar tells them exactly how many that is.
 */
const selectableIds = computed(() =>
  useVirtualGrid.value
    ? props.virtualRows.filter((row) => !isPendingRow(row)).map((row) => row.id)
    : props.rows.map((row) => row.id),
)

const allSelected = computed(
  () =>
    selectableIds.value.length > 0 && selectableIds.value.every((id) => selectedSet.value.has(id)),
)

const someSelected = computed(
  () => !allSelected.value && selectableIds.value.some((id) => selectedSet.value.has(id)),
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
    <BaseDataTableCards
      v-else-if="isMobile"
      :rows="rows"
      :primary-column="primaryColumn"
      :card-columns="cardColumns"
      :skeleton-rows="skeletonRows"
      :meta="meta"
      :initialising="initialising"
      :selectable="selectable"
      :label="label"
      :rows-per-page-options="rowsPerPageOptions"
      :first-record="firstRecord"
      :all-selected="allSelected"
      :some-selected="someSelected"
      :selectable-ids="selectableIds"
      :is-row-selected="isRowSelected"
      :row-select-label="rowSelectLabel"
      @update:page="emit('update:page', $event)"
      @update:per-page="emit('update:perPage', $event)"
      @toggle-row="emit('toggleRow', $event)"
      @toggle-all="(ids, selected) => emit('toggleAll', ids, selected)"
    >
      <template v-for="col in columns" :key="col.field" #[`cell-${col.field}`]="{ row }">
        <slot :name="`cell-${col.field}`" :row="row" />
      </template>
      <template v-if="$slots.actions" #actions="{ row }">
        <slot name="actions" :row="row" />
      </template>
    </BaseDataTableCards>

    <!-- Tablet and up: grid (virtual or paginated). -->
    <BaseDataTableGrid
      v-else
      :rows="rows"
      :columns="columns"
      :meta="meta"
      :loading="loading"
      :initialising="initialising"
      :sort-field="sortField"
      :sort-order="sortOrder"
      :label="label"
      :rows-per-page-options="rowsPerPageOptions"
      :mode="mode"
      :virtual-rows="virtualRows"
      :scroll-height="scrollHeight"
      :selectable="selectable"
      :skeleton-rows="skeletonRows"
      :use-virtual-grid="useVirtualGrid"
      :all-selected="allSelected"
      :some-selected="someSelected"
      :selectable-ids="selectableIds"
      :is-row-selected="isRowSelected"
      :row-select-label="rowSelectLabel"
      @sort="emit('sort', $event)"
      @update:page="emit('update:page', $event)"
      @update:per-page="emit('update:perPage', $event)"
      @range-change="(first, last) => emit('rangeChange', first, last)"
      @toggle-row="emit('toggleRow', $event)"
      @toggle-all="(ids, selected) => emit('toggleAll', ids, selected)"
    >
      <template v-for="col in columns" :key="col.field" #[`cell-${col.field}`]="{ row }">
        <slot :name="`cell-${col.field}`" :row="row" />
      </template>
      <template v-if="$slots.actions" #actions="{ row }">
        <slot name="actions" :row="row" />
      </template>
    </BaseDataTableGrid>
  </div>
</template>
