import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useVirtualRows } from '@/shared/composables/useVirtualRows'

/**
 * The page-request bookkeeping behind virtual scrolling.
 *
 * Tested without a scroller on purpose. The interesting behaviour, never asking twice,
 * mapping indices onto pages, abandoning in-flight pages when the query changes, is pure
 * logic, and a jsdom scroller (no layout, so no virtualisation) could not exercise any of it.
 */

interface Harness {
  virtual: ReturnType<typeof useVirtualRows>
  loadPage: ReturnType<typeof vi.fn>
}

function harness(
  perPage = 10,
  impl?: (page: number, signal: AbortSignal) => Promise<void>,
): Harness {
  const loadPage = vi.fn(impl ?? (() => Promise.resolve()))
  const virtual = useVirtualRows({ perPage: () => perPage, onLoadPage: loadPage })
  return { virtual, loadPage }
}

function pagesRequested(loadPage: ReturnType<typeof vi.fn>): number[] {
  return loadPage.mock.calls.map((call) => call[0] as number).sort((a, b) => a - b)
}

describe('useVirtualRows', () => {
  it('maps a visible range onto the pages covering it', async () => {
    const { virtual, loadPage } = harness(10)

    // Rows 0-24 span pages 1, 2 and 3 at ten per page.
    await virtual.requestRange(0, 24)

    expect(pagesRequested(loadPage)).toEqual([1, 2, 3])
  })

  it('asks for one page when the range sits inside it', async () => {
    const { virtual, loadPage } = harness(10)

    await virtual.requestRange(31, 38)

    expect(pagesRequested(loadPage)).toEqual([4])
  })

  it('never requests the same page twice', async () => {
    const { virtual, loadPage } = harness(10)

    await virtual.requestRange(0, 24)
    await virtual.requestRange(10, 34)

    // Pages 2 and 3 overlap and must not be re-fetched; only 4 is new.
    expect(pagesRequested(loadPage)).toEqual([1, 2, 3, 4])
  })

  it('deduplicates across concurrent ranges, before any of them resolve', async () => {
    // The real failure mode: a fast scroll emits several ranges within one frame, so waiting
    // for a response before recording the page would fire the same request repeatedly.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { virtual, loadPage } = harness(10, () => gate)

    const first = virtual.requestRange(0, 9)
    const second = virtual.requestRange(0, 9)
    release()
    await Promise.all([first, second])

    expect(loadPage).toHaveBeenCalledTimes(1)
  })

  it('reports loading while requests are outstanding', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { virtual } = harness(10, () => gate)

    const pending = virtual.requestRange(0, 9)
    expect(virtual.isLoading.value).toBe(true)

    release()
    await pending
    expect(virtual.isLoading.value).toBe(false)
  })

  it('retries a page whose request failed', async () => {
    let attempt = 0
    const { virtual, loadPage } = harness(10, () => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('offline')) : Promise.resolve()
    })

    await virtual.requestRange(0, 9)
    await virtual.requestRange(0, 9)

    // A gap the user can scroll back to must not be permanently blank.
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('forgets every page on reset, so a new query starts empty', async () => {
    const { virtual, loadPage } = harness(10)

    await virtual.requestRange(0, 19)
    virtual.reset()
    await virtual.requestRange(0, 19)

    expect(loadPage).toHaveBeenCalledTimes(4)
    expect(virtual.loadedPages.value).toEqual([1, 2])
  })

  it('aborts in-flight pages on reset', async () => {
    const signals: AbortSignal[] = []
    const { virtual } = harness(10, (_page, signal) => {
      signals.push(signal)
      return Promise.resolve()
    })

    await virtual.requestRange(0, 9)
    expect(signals[0]?.aborted).toBe(false)

    /*
     * Without this, a page still in flight when the search term changes would resolve after
     * the buffer was rebuilt and splice rows for the old query into the new result set.
     */
    virtual.reset()
    expect(signals[0]?.aborted).toBe(true)
  })

  it('reads the page size at call time, not at construction', async () => {
    let perPage = 10
    const loadPage = vi.fn(() => Promise.resolve())
    const virtual = useVirtualRows({ perPage: () => perPage, onLoadPage: loadPage })

    // The size can be restored from the URL after this composable is built.
    perPage = 25
    await virtual.requestRange(0, 24)

    expect(pagesRequested(loadPage)).toEqual([1])
  })

  it('clamps a negative first index to the first page', async () => {
    const { virtual, loadPage } = harness(10)

    await virtual.requestRange(-5, 3)

    expect(pagesRequested(loadPage)).toEqual([1])
  })

  it('aborts outstanding requests when its scope is disposed', async () => {
    const signals: AbortSignal[] = []
    const scope = effectScope()

    await scope.run(async () => {
      const virtual = useVirtualRows({
        perPage: () => 10,
        onLoadPage: (_page, signal) => {
          signals.push(signal)
          return Promise.resolve()
        },
      })
      await virtual.requestRange(0, 9)
    })

    scope.stop()
    expect(signals[0]?.aborted).toBe(true)
  })
})
