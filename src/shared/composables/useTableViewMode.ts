import { computed, ref, type ComputedRef } from 'vue'

/**
 * How list views render their rows.
 *
 * This is a **demonstration control**, and it is worth saying so plainly: a production portal
 * would pick one strategy per screen rather than hand the choice to the user. It exists here
 * so both paths can be exercised side by side against the same server-side query, on the same
 * data, without a rebuild, the interesting claim being that switching does not change *what*
 * is fetched, only how much of it is on screen at once.
 *
 * Module-level and persisted, matching `useTheme` and `useSidebar`: the mode is a property of
 * the session, not of whichever list page happens to be mounted, so navigating between
 * Events and Tickets keeps it.
 */

export type TableViewMode = 'paginated' | 'virtual'

const STORAGE_KEY = 'app.table.viewMode'

function readStored(): TableViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'virtual' ? 'virtual' : 'paginated'
  } catch {
    return 'paginated'
  }
}

const mode = ref<TableViewMode>(readStored())

export interface UseTableViewMode {
  /**
   * Read-only on purpose. Exposing the writable ref let a `v-model` bind straight to it and
   * skip `setMode` entirely: the mode changed, the UI updated, and nothing was ever
   * persisted. Making the ref unwritable turns that from a bug into a type error.
   */
  mode: ComputedRef<TableViewMode>
  isVirtual: ComputedRef<boolean>
  setMode: (next: TableViewMode) => void
}

export function useTableViewMode(): UseTableViewMode {
  function setMode(next: TableViewMode): void {
    mode.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* Storage unavailable, the choice still applies for this page. */
    }
  }

  return {
    mode: computed(() => mode.value),
    isVirtual: computed(() => mode.value === 'virtual'),
    setMode,
  }
}

/** Test-only: returns the module to its default state. */
export function resetTableViewMode(): void {
  mode.value = 'paginated'
}
