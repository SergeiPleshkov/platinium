import { computed, ref, type ComputedRef } from 'vue'

/**
 * Desktop sidebar collapse state.
 *
 * Module-level rather than per-component, for the same reason as `useTheme`: the header's
 * toggle and the nav itself are siblings, and two independent copies of this flag would let
 * the button and the thing it controls disagree.
 *
 * Only meaningful at `lg` and up. Below that the sidebar is an off-canvas drawer whose
 * open/closed state is a different question with a different answer, owned by the layout
 * collapsing a drawer to icons would leave a 56px column of glyphs over the content.
 */

const STORAGE_KEY = 'app.sidebar.collapsed'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed'
  } catch {
    // Private mode or a blocked storage partition. Expanded is the safe default.
    return false
  }
}

const collapsed = ref(readStored())

export interface UseSidebar {
  /** Read-only: writes go through `setCollapsed`, which is what persists them. */
  collapsed: ComputedRef<boolean>
  /** Inverse of `collapsed`, for `aria-expanded`, which reads the other way round. */
  expanded: ComputedRef<boolean>
  setCollapsed: (next: boolean) => void
  toggle: () => void
}

export function useSidebar(): UseSidebar {
  function setCollapsed(next: boolean): void {
    collapsed.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded')
    } catch {
      /* Storage unavailable, the choice still applies for this page. */
    }
  }

  return {
    collapsed: computed(() => collapsed.value),
    expanded: computed(() => !collapsed.value),
    setCollapsed,
    toggle: () => setCollapsed(!collapsed.value),
  }
}

/** Test-only: returns the module to its default state. */
export function resetSidebar(): void {
  collapsed.value = false
}
