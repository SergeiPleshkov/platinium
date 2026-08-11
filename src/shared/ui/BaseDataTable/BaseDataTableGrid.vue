<script setup lang="ts" generic="TRow extends { id: string }">
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent, type DataTableSortEvent } from 'primevue/datatable'
import Skeleton from 'primevue/skeleton'
import type { VirtualScrollerLazyEvent } from 'primevue/virtualscroller'
import { computed } from 'vue'

import { isPendingRow, type BufferRow } from '@/shared/composables/useCollectionState'
import type { ListMeta, SortOrder } from '@/shared/types/api'
import type { TableColumn, TableViewMode } from '@/shared/ui/BaseDataTable/types'

interface Props {
  rows: readonly TRow[]
  columns: readonly TableColumn[]
  meta: ListMeta
  loading: boolean
  initialising: boolean
  sortField?: string | undefined
  sortOrder?: SortOrder | undefined
  label: string
  rowsPerPageOptions: readonly number[]
  mode: TableViewMode
  virtualRows: ReadonlyArray<BufferRow<TRow>>
  scrollHeight: string
  selectable: boolean
  skeletonRows: readonly { id: string }[]
  useVirtualGrid: boolean
  allSelected: boolean
  someSelected: boolean
  selectableIds: readonly string[]
  isRowSelected: (id: string) => boolean
  rowSelectLabel: (row: TRow) => string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  sort: [field: string]
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  rangeChange: [first: number, last: number]
  toggleRow: [id: string]
  toggleAll: [ids: string[], selected: boolean]
}>()

defineSlots<{
  [key: `cell-${string}`]: ((props: { row: TRow }) => unknown) | undefined
  actions?: (props: { row: TRow }) => unknown
}>()

/**
 * The scroller positions row *n* at `n × itemSize`, so a taller row makes the scrollbar lie
 * and drifts further with every screen. Enforced on the cells rather than left to content.
 */
const VIRTUAL_ROW_HEIGHT = 52

const primeSortOrder = computed(() => (props.sortOrder === 'asc' ? 1 : -1))
const firstRecord = computed(() => (props.meta.page - 1) * props.meta.perPage)

function cellValue(row: TRow, field: string): unknown {
  return (row as Record<string, unknown>)[field]
}

function onSort(event: DataTableSortEvent): void {
  if (typeof event.sortField === 'string') emit('sort', event.sortField)
}

function onPage(event: DataTablePageEvent): void {
  if (event.rows !== props.meta.perPage) emit('update:perPage', event.rows)
  else emit('update:page', event.page + 1)
}

function pending(row: BufferRow<TRow>): boolean {
  return isPendingRow(row)
}

function asRow(row: unknown): TRow {
  return row as TRow
}

const virtualScrollerOptions = computed(() => ({
  lazy: true,
  itemSize: VIRTUAL_ROW_HEIGHT,
  numToleratedItems: 10,
  showLoader: false,
  onLazyLoad: (event: VirtualScrollerLazyEvent) => {
    emit('rangeChange', Number(event.first), Number(event.last))
  },
}))

/**
 * Fixed, not automatic. Automatic layout measures the rows *currently in the DOM*, and virtual
 * scrolling keeps swapping those, so the columns jittered as the user scrolled.
 */
const virtualTableStyle = { tableLayout: 'fixed', width: '100%' } as const

const VIRTUAL_ACTIONS_WIDTH = '6rem'

const virtualCellStyle = {
  height: `${VIRTUAL_ROW_HEIGHT}px`,
  paddingTop: '0',
  paddingBottom: '0',
}
</script>

<template>
  <!--
    Virtual mode: one scroll surface over the whole result set. No paginator —
    the scrollbar *is* the position indicator, and pages arrive as their rows come into view.
  -->
  <DataTable
    v-if="useVirtualGrid"
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
          @change="emit('toggleAll', [...selectableIds], !allSelected)"
        />
      </template>
      <template #body="{ data }">
        <div class="flex h-full items-center">
          <input
            v-if="!pending(data as BufferRow<TRow>)"
            type="checkbox"
            class="size-4 cursor-pointer accent-brand-600"
            :checked="isRowSelected(asRow(data).id)"
            :aria-label="rowSelectLabel(asRow(data))"
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

  <!-- Paginated mode: a real grid with server-driven paging and sorting. -->
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
          @change="emit('toggleAll', [...selectableIds], !allSelected)"
        />
      </template>
      <template #body="{ data }">
        <Skeleton v-if="initialising" width="1rem" height="1rem" />
        <input
          v-else
          type="checkbox"
          class="size-4 cursor-pointer accent-brand-600"
          :checked="isRowSelected((data as TRow).id)"
          :aria-label="rowSelectLabel(data as TRow)"
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
</template>
