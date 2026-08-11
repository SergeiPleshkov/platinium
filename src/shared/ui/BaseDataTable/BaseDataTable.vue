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

/**
 * The scroller positions row *n* at `n × itemSize`, so a taller row makes the scrollbar lie
 * and drifts further with every screen. Enforced on the cells rather than left to content.
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
 * Virtual mode is a *grid* mode. Below `md` this renders cards, whose height depends on their
 * content — and forcing them to a fixed height to satisfy the scroller would let the technique
 * dictate the design. Narrow viewports keep the paginator; the page hides the switch there.
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
 * Fixed, not automatic. Automatic layout measures the rows *currently in the DOM*, and virtual
 * scrolling keeps swapping those — so the columns jittered as the user scrolled. The cost is
 * that widths must be declared; columns that declare none share what is left.
 */
const virtualTableStyle = { tableLayout: 'fixed', width: '100%' } as const

/** Two icon buttons, and it must not absorb the slack the text columns need. */
const VIRTUAL_ACTIONS_WIDTH = '6rem'

/**
 * Padding zeroed and height fixed, so a row is exactly `VIRTUAL_ROW_HEIGHT` whatever it holds.
 * Without this a long venue name wraps and the scroller's arithmetic stops matching the page.
 */
const virtualCellStyle = {
  height: `${VIRTUAL_ROW_HEIGHT}px`,
  paddingTop: '0',
  paddingBottom: '0',
}

/**
 * A template cannot apply a generic type guard inline, so the check and the narrowing are
 * split: `pending` gates the branch, `asRow` states the conclusion. Correct only together.
 */
function pending(row: BufferRow<TRow>): boolean {
  return isPendingRow(row)
}

function asRow(row: unknown): TRow {
  return row as TRow
}

/* ---- selection ---- */

const selectedSet = computed(() => new Set(props.selectedIds))

function isRowSelected(id: string): boolean {
  return selectedSet.value.has(id)
}

/**
 * Ids the header checkbox acts on: the rows on screen, not the whole result set.
 *
 * "Select all" meaning *all 250* would be a different feature and a more dangerous one — the
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
      <!--
        A plain checkbox, not PrimeVue's selection column: theirs owns the selection state,
        which would put a second copy beside the one `useRowSelection` already holds.
      -->
      <Column v-if="selectable" :style="{ width: '3rem' }" :body-style="virtualCellStyle">
        <template #header>
          <input
            type="checkbox"
            class="size-4 cursor-pointer accent-brand-600"
            :checked="allSelected"
            :indeterminate="someSelected"
            :aria-label="
              allSelected
                ? `Deselect all ${label.toLowerCase()} on this page`
                : `Select all ${label.toLowerCase()} on this page`
            "
            @change="emit('toggleAll', selectableIds, !allSelected)"
          />
        </template>
        <template #body="{ data }">
          <div class="flex h-full items-center">
            <input
              v-if="!pending(data as BufferRow<TRow>)"
              type="checkbox"
              class="size-4 cursor-pointer accent-brand-600"
              :checked="isRowSelected(asRow(data).id)"
              :aria-label="`Select row ${asRow(data).id}`"
              @change="emit('toggleRow', asRow(data).id)"
            />
          </div>
        </template>
      </Column>

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
      <Column v-if="selectable" :style="{ width: '3rem' }">
        <template #header>
          <input
            type="checkbox"
            class="size-4 cursor-pointer accent-brand-600"
            :checked="allSelected"
            :indeterminate="someSelected"
            :aria-label="
              allSelected
                ? `Deselect all ${label.toLowerCase()} on this page`
                : `Select all ${label.toLowerCase()} on this page`
            "
            @change="emit('toggleAll', selectableIds, !allSelected)"
          />
        </template>
        <template #body="{ data }">
          <Skeleton v-if="initialising" width="1rem" height="1rem" />
          <input
            v-else
            type="checkbox"
            class="size-4 cursor-pointer accent-brand-600"
            :checked="isRowSelected((data as TRow).id)"
            :aria-label="`Select row ${(data as TRow).id}`"
            @change="emit('toggleRow', (data as TRow).id)"
          />
        </template>
      </Column>

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
