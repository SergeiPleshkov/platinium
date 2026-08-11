import { computed, ref, type ComputedRef } from 'vue'

/**
 * Which rows the user has ticked — **ids, not records**. A selected row can be re-fetched or
 * paged away between the tick and the action, so holding the object means acting on a stale
 * copy of it.
 *
 * Selection survives paging (ticking across two pages is a normal thing to want) but not a
 * change to the query, because carrying it across is how the wrong records get deleted.
 */

export interface UseRowSelection {
  selectedIds: ComputedRef<string[]>
  count: ComputedRef<number>
  hasSelection: ComputedRef<boolean>
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  /** Selects or clears every id passed — the "select all on this page" control. */
  setMany: (ids: readonly string[], selected: boolean) => void
  clear: () => void
  /** True when every id passed is selected, for the header checkbox. */
  areAllSelected: (ids: readonly string[]) => boolean
}

export function useRowSelection(): UseRowSelection {
  /*
   * A Set inside a ref, exposed as an array. The Set is for the membership tests a table does
   * once per row per render; the array is what templates and the bulk request want.
   */
  const selected = ref(new Set<string>())

  function commit(next: Set<string>): void {
    selected.value = next
  }

  return {
    selectedIds: computed(() => [...selected.value]),

    count: computed(() => selected.value.size),
    hasSelection: computed(() => selected.value.size > 0),

    isSelected: (id) => selected.value.has(id),

    toggle(id) {
      const next = new Set(selected.value)
      if (!next.delete(id)) next.add(id)
      commit(next)
    },

    setMany(ids, isSelecting) {
      const next = new Set(selected.value)
      for (const id of ids) {
        if (isSelecting) next.add(id)
        else next.delete(id)
      }
      commit(next)
    },

    clear: () => commit(new Set()),

    areAllSelected: (ids) => ids.length > 0 && ids.every((id) => selected.value.has(id)),
  }
}
