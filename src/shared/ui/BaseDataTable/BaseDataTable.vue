<script setup lang="ts" generic="TRow extends { id: string }">
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable'
import Paginator, { type PageState } from 'primevue/paginator'
import Skeleton from 'primevue/skeleton'
import type { VirtualScrollerLazyEvent } from 'primevue/virtualscroller'
import { computed } from 'vue'

import { useResponsiveLayout } from '@/shared/composables/useBreakpoint'
import { isPendingRow, type BufferRow } from '@/shared/composables/useCollectionState'
import type { ListMeta, SortOrder } from '@/shared/types/api'
import type { TableColumn, TableViewMode } from '@/shared/ui/BaseDataTable/types'
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
  /**
   * `paginated` renders one server page with a paginator. `virtual` renders the whole result
   * set as a scrollable window, fetching pages as they come into view. Grid only — see the
   * note on `useVirtualGrid` below.
   */
  mode?: TableViewMode | undefined
  /** Length-`meta.total` buffer, unfetched pages standing in as placeholders. Virtual mode only. */
  virtualRows?: ReadonlyArray<BufferRow<TRow>> | undefined
  /** Height of the virtual viewport. Fixed by necessity: the scroller needs a known box. */
  scrollHeight?: string | undefined
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
})

const emit = defineEmits<{
  sort: [field: string]
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  retry: []
  clearFilters: []
  /** Virtual mode: the visible window moved. Indices are zero-based, `last` inclusive. */
  rangeChange: [first: number, last: number]
}>()

defineSlots<{
  /** Per-column cell override, named `cell-<field>`. */
  [key: `cell-${string}`]: ((props: { row: TRow }) => unknown) | undefined
  actions?: (props: { row: TRow }) => unknown
  emptyAction?: () => unknown
}>()

/**
 * Virtual rows must be a fixed, known height — the scroller positions row *n* at
 * `n × itemSize`, so a row that renders taller than this makes the scrollbar lie about how
 * much data there is and drifts further with every screen. Enforced on the cells below rather
 * than left to the content.
 */
const VIRTUAL_ROW_HEIGHT = 52

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

/**
 * Virtual mode is a *grid* mode.
 *
 * Below `md` this component renders cards, whose height depends on how much text each row
 * carries — and a virtual scroller needs every item to be exactly `itemSize` tall or the
 * scrollbar misreports the length of the list. Forcing cards to a fixed height to satisfy the
 * scroller would be letting the technique dictate the design. Narrow viewports therefore keep
 * the paginator, and the page hides the switch there rather than offering a control that
 * silently does nothing.
 */
const useVirtualGrid = computed(() => props.mode === 'virtual' && !isMobile.value)

const virtualScrollerOptions = computed(() => ({
  lazy: true,
  itemSize: VIRTUAL_ROW_HEIGHT,
  /*
   * Rows rendered beyond the viewport. Enough that a flick-scroll lands on real rows rather
   * than placeholders, not so many that the DOM advantage is given back.
   */
  numToleratedItems: 10,
  showLoader: false,
  onLazyLoad: (event: VirtualScrollerLazyEvent) => {
    emit('rangeChange', Number(event.first), Number(event.last))
  },
}))

/**
 * Fixed layout, not automatic.
 *
 * Automatic layout measures the rows *currently in the DOM* — and virtual scrolling exists
 * precisely to keep swapping those. Every recycle re-measured, so the columns jittered back
 * and forth as the user scrolled. Fixed layout derives its widths from the header row alone,
 * so they are decided once and hold for the whole scroll.
 *
 * The cost is that widths must be declared rather than discovered. Columns that declare none
 * share whatever is left over, which is the right default for the text-heavy ones.
 */
const virtualTableStyle = { tableLayout: 'fixed', width: '100%' } as const

/** Two icon buttons, and it must not absorb the slack the text columns need. */
const VIRTUAL_ACTIONS_WIDTH = '6rem'

/**
 * Vertical padding is removed and the height fixed, so a row is exactly `VIRTUAL_ROW_HEIGHT`
 * whatever it contains. The inner wrapper restores the visual centring and clips overflow —
 * without it a long venue name wraps to two lines, the row grows, and the scroller's
 * arithmetic (position = index × itemSize) silently stops matching the page.
 */
const virtualCellStyle = {
  height: `${VIRTUAL_ROW_HEIGHT}px`,
  paddingTop: '0',
  paddingBottom: '0',
}

/**
 * Narrows a buffer slot for the template.
 *
 * A template cannot apply a generic type guard inline, so the check and the narrowing are
 * split: `pending` gates the branch, `asRow` states the conclusion. The two are only correct
 * together, which is why they live side by side.
 */
function pending(row: BufferRow<TRow>): boolean {
  return isPendingRow(row)
}

function asRow(row: unknown): TRow {
  return row as TRow
}
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

    <!--
      Tablet and up, virtual mode: one scroll surface over the whole result set. No paginator —
      the scrollbar *is* the position indicator — and pages arrive as their rows come into view.
    -->
    <!--
      No loading overlay here. The placeholder rows already say "this is arriving" exactly
      where it is arriving, and a banner on top of them said the same thing a second time
      while covering rows the user could otherwise read.
    -->
    <DataTable
      v-else-if="useVirtualGrid"
      :value="virtualRows"
      scrollable
      :scroll-height="scrollHeight"
      :virtual-scroller-options="virtualScrollerOptions"
      :table-style="virtualTableStyle"
      :sort-field="sortField"
      :sort-order="primeSortOrder"
      :aria-label="label"
      data-key="id"
      lazy
      removable-sort
      @sort="onSort"
    >
      <Column
        v-for="column in columns"
        :key="column.field"
        :field="column.field"
        :header="column.header"
        :sortable="column.sortable ?? false"
        :body-class="column.cellClass"
        :body-style="virtualCellStyle"
        :style="column.width ? { width: column.width } : undefined"
      >
        <template #body="{ data }">
          <div class="flex h-full items-center overflow-hidden whitespace-nowrap">
            <!--
              The one loading affordance in this mode: a skeleton in the cell whose page has
              not arrived. It appears exactly where the row will be, at the row's own height,
              so nothing moves when the data lands.
            -->
            <Skeleton v-if="pending(data as BufferRow<TRow>)" width="70%" height="1rem" />
            <span v-else class="truncate">
              <slot :name="`cell-${column.field}`" :row="asRow(data)">
                {{ cellValue(asRow(data), column.field) }}
              </slot>
            </span>
          </div>
        </template>
      </Column>

      <Column
        v-if="$slots.actions"
        header="Actions"
        :style="{ width: VIRTUAL_ACTIONS_WIDTH }"
        :body-style="virtualCellStyle"
      >
        <template #body="{ data }">
          <div class="flex h-full items-center justify-end">
            <Skeleton v-if="pending(data as BufferRow<TRow>)" width="4rem" height="1rem" />
            <slot v-else name="actions" :row="asRow(data)" />
          </div>
        </template>
      </Column>
    </DataTable>

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
