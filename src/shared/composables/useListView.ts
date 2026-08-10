import { ref, watch } from 'vue'

import { useTable, type UseTable, type UseTableOptions } from '@/shared/composables/useTable'
import { useTableViewMode, type UseTableViewMode } from '@/shared/composables/useTableViewMode'
import { useVirtualRows, type UseVirtualRows } from '@/shared/composables/useVirtualRows'
import { createListQuery, type ListQuery } from '@/shared/types/api'

/**
 * The glue between query state, render strategy and the store's two loaders.
 *
 * Written *after* all three list pages existed and needed the identical fifteen lines — which
 * is the standard this project applies to abstractions generally, and the reason there is no
 * generic CRUD factory (see docs/DECISIONS.md). Three consumers, one non-obvious ordering
 * problem, and a bug that is easy to reintroduce by hand: that earns a composable.
 *
 * The ordering problem: on a query change in virtual mode, three things must happen in this
 * order — cancel and forget the in-flight pages, empty the buffer, *then* ask for the first
 * window. Doing the last first splices rows for the old query into the new buffer.
 */

export interface UseListViewOptions extends Omit<UseTableOptions, 'onQuery'> {
  /** Replaces the visible page. Used in paginated mode. */
  fetchList: (query: ListQuery, signal: AbortSignal) => Promise<void>
  /** Splices one page into the buffer. Used in virtual mode. */
  fetchWindow: (query: ListQuery, signal: AbortSignal) => Promise<void>
  /** Empties the buffer. The store's, so the rows stay in one place. */
  resetBuffer: () => void
}

export interface UseListView {
  table: UseTable
  viewMode: UseTableViewMode
  virtual: UseVirtualRows
  /** Wire to `BaseDataTable`'s `range-change`. */
  onRangeChange: (first: number, last: number) => void
}

export function useListView(options: UseListViewOptions): UseListView {
  const { fetchList, fetchWindow, resetBuffer, ...tableOptions } = options

  const viewMode = useTableViewMode()

  /*
   * The query `useTable` last handed us.
   *
   * Kept here rather than read back off the returned `table`, because `useTable` issues its
   * first query *during its own construction* — before this function has a `table` to read
   * from. Closing over the table would work in every case except the first one, which is the
   * worst kind of bug to ship.
   */
  const lastQuery = ref<ListQuery>(createListQuery())

  const virtual = useVirtualRows({
    perPage: () => lastQuery.value.perPage,
    onLoadPage: (page, signal) => fetchWindow({ ...lastQuery.value, page }, signal),
  })

  async function load(query: ListQuery, signal: AbortSignal): Promise<void> {
    lastQuery.value = query

    if (!viewMode.isVirtual.value) {
      await fetchList(query, signal)
      return
    }

    virtual.reset()
    resetBuffer()
    /*
     * Seeded through `requestRange` rather than by calling `fetchWindow` directly, so the
     * first page is recorded as requested. Fetching it behind the bookkeeping's back would
     * mean the scroller's opening range event immediately asks for it a second time.
     */
    await virtual.requestRange(0, query.perPage - 1)
  }

  const table = useTable({ ...tableOptions, onQuery: load })

  // Flipping the switch changes how rows are fetched, so the current view has to be rebuilt.
  watch(viewMode.mode, () => {
    void table.refresh()
  })

  return {
    table,
    viewMode,
    virtual,
    onRangeChange: (first, last) => {
      void virtual.requestRange(first, last)
    },
  }
}
