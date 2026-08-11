import { computed, onScopeDispose, ref, type ComputedRef } from 'vue'

/**
 * Turns a visible row range into page requests, and remembers which pages it has asked for so
 * dragging the scrollbar over a region does not re-request it every frame.
 *
 * Holds **no rows** — those live in the store's buffer, for the same reason `useTable` holds
 * none. One copy of server state, in one place; this owns only the bookkeeping.
 */

export interface UseVirtualRowsOptions {
  /**
   * Page size to translate row indices into page numbers. A getter, not a number: the page
   * size can be restored from the URL after this composable is constructed, and a stale copy
   * would map every index to the wrong page.
   */
  perPage: () => number
  /**
   * Fetches one page and splices it into the buffer. The signal aborts when `reset` is called,
   * so a page still in flight when the query changes cannot land in the new buffer.
   */
  onLoadPage: (page: number, signal: AbortSignal) => Promise<void>
}

export interface UseVirtualRows {
  /** True while at least one page request is in flight. */
  isLoading: ComputedRef<boolean>
  /** Pages requested so far, for tests and for the demo read-out. */
  loadedPages: ComputedRef<number[]>
  /** Called by the scroller. `first`/`last` are zero-based row indices, `last` inclusive. */
  requestRange: (first: number, last: number) => Promise<void>
  /** Forgets everything and cancels in-flight loads. Call when the query changes. */
  reset: () => void
}

export function useVirtualRows(options: UseVirtualRowsOptions): UseVirtualRows {
  const { perPage, onLoadPage } = options

  /*
   * Requested, not *loaded*: a page is added before its request resolves. Recording it on
   * success instead would let a burst of range events during a fast scroll fire the same
   * request several times over, since none of them would have resolved yet.
   */
  const requested = ref(new Set<number>())
  const inFlight = ref(0)

  let controller = new AbortController()

  function forget(page: number): void {
    requested.value.delete(page)
    // Reassigned so the Set change is reactive; mutation alone would not notify.
    requested.value = new Set(requested.value)
  }

  function pagesCovering(first: number, last: number): number[] {
    const size = Math.max(1, perPage())
    const from = Math.max(1, Math.floor(Math.max(0, first) / size) + 1)
    const to = Math.max(from, Math.floor(Math.max(0, last) / size) + 1)

    const pages: number[] = []
    for (let page = from; page <= to; page += 1) pages.push(page)
    return pages
  }

  async function requestRange(first: number, last: number): Promise<void> {
    const pending = pagesCovering(first, last).filter((page) => !requested.value.has(page))
    if (pending.length === 0) return

    for (const page of pending) requested.value.add(page)
    requested.value = new Set(requested.value)

    const { signal } = controller
    inFlight.value += pending.length

    await Promise.all(
      pending.map(async (page) => {
        try {
          await onLoadPage(page, signal)
        } catch {
          /*
           * Drop it so scrolling back over the gap retries. The store has already recorded the
           * failure for the UI; rethrowing here would only produce an unhandled rejection
           * inside a scroll handler.
           */
          forget(page)
        } finally {
          inFlight.value -= 1
        }
      }),
    )
  }

  function reset(): void {
    controller.abort()
    controller = new AbortController()
    requested.value = new Set()
    inFlight.value = 0
  }

  onScopeDispose(() => controller.abort())

  return {
    isLoading: computed(() => inFlight.value > 0),
    loadedPages: computed(() => [...requested.value].sort((a, b) => a - b)),
    requestRange,
    reset,
  }
}
