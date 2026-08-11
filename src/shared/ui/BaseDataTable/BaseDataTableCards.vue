<script setup lang="ts" generic="TRow extends { id: string }">
import Paginator, { type PageState } from 'primevue/paginator'

import type { ListMeta } from '@/shared/types/api'
import type { TableColumn } from '@/shared/ui/BaseDataTable/types'
import BaseSkeleton from '@/shared/ui/BaseSkeleton/BaseSkeleton.vue'

interface Props {
  rows: readonly TRow[]
  primaryColumn: TableColumn | undefined
  cardColumns: readonly TableColumn[]
  skeletonRows: readonly { id: string }[]
  meta: ListMeta
  initialising: boolean
  selectable: boolean
  label: string
  rowsPerPageOptions: readonly number[]
  firstRecord: number
  allSelected: boolean
  someSelected: boolean
  selectableIds: readonly string[]
  isRowSelected: (id: string) => boolean
  rowSelectLabel: (row: TRow) => string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:page': [page: number]
  'update:perPage': [perPage: number]
  toggleRow: [id: string]
  toggleAll: [ids: string[], selected: boolean]
}>()

defineSlots<{
  [key: `cell-${string}`]: ((props: { row: TRow }) => unknown) | undefined
  actions?: (props: { row: TRow }) => unknown
}>()

function cellValue(row: TRow, field: string): unknown {
  return (row as Record<string, unknown>)[field]
}

function onPage(event: PageState): void {
  if (event.rows !== props.meta.perPage) emit('update:perPage', event.rows)
  else emit('update:page', event.page + 1)
}
</script>

<template>
  <div
    v-if="selectable && !initialising && rows.length > 0"
    class="flex items-center gap-2 border-b border-border px-4 py-2"
  >
    <!--
      44×44 hit target around a visually small checkbox: fingers need the padding, eyes do not.
    -->
    <label class="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
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
    </label>
    <span class="text-sm text-content-muted">Select page</span>
  </div>

  <ul v-if="initialising" class="divide-y divide-border">
    <li v-for="placeholder in skeletonRows" :key="placeholder.id" class="p-4">
      <BaseSkeleton width="60%" height="1.1rem" />
      <BaseSkeleton class="mt-2" width="40%" height="0.8rem" />
    </li>
  </ul>

  <ul v-else class="divide-y divide-border" :aria-label="label">
    <li v-for="row in rows" :key="row.id" class="p-4">
      <div class="flex items-start gap-3">
        <label
          v-if="selectable"
          class="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
        >
          <input
            type="checkbox"
            class="size-4 cursor-pointer accent-brand-600"
            :checked="isRowSelected(row.id)"
            :aria-label="rowSelectLabel(row)"
            @change="emit('toggleRow', row.id)"
          />
        </label>
        <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
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
