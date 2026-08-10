import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'

import { ApiError } from '@/shared/api'
import { useTable, type UseTable } from '@/shared/composables/useTable'
import type { ListQuery, ListResponse } from '@/shared/types/api'

interface Row {
  id: string
}

/**
 * Runs a composable inside its own effect scope, so `onScopeDispose` cleanup can be exercised
 * the way a real unmount would exercise it.
 */
function withScope<T>(factory: () => T): { result: T; dispose: () => void } {
  const scope = effectScope()
  const result = scope.run(factory)!
  return { result, dispose: () => scope.stop() }
}

function page(rows: Row[], total = rows.length, pageNumber = 1, perPage = 10): ListResponse<Row> {
  return {
    data: rows,
    meta: { total, page: pageNumber, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  }
}

/** `page`, already wrapped in a promise — the shape a fetcher returns. */
function resolved(...args: Parameters<typeof page>): Promise<ListResponse<Row>> {
  return Promise.resolve(page(...args))
}

/** Waits out the 300ms search debounce and lets the resulting promise settle. */
async function flushDebounce(): Promise<void> {
  await vi.advanceTimersByTimeAsync(300)
  await nextTick()
}

let scopes: Array<() => void> = []

function makeTable(
  fetcher: (query: ListQuery, signal: AbortSignal) => Promise<ListResponse<Row>>,
  overrides: Partial<Parameters<typeof useTable<Row>>[0]> = {},
): UseTable<Row> {
  const { result, dispose } = withScope(() =>
    useTable<Row>({
      resource: 'rows',
      fetcher,
      defaultSort: 'createdAt',
      // No router in these tests: the URL round-trip is covered by the integration suite.
      syncUrl: false,
      ...overrides,
    }),
  )
  scopes.push(dispose)
  return result
}

beforeEach(() => {
  vi.useFakeTimers()
  scopes = []
})

afterEach(() => {
  for (const dispose of scopes) dispose()
  vi.useRealTimers()
})

describe('useTable', () => {
  it('loads immediately and exposes rows and meta', async () => {
    const fetcher = vi.fn(() => resolved([{ id: 'a' }, { id: 'b' }], 42))
    const table = makeTable(fetcher)

    await vi.waitFor(() => expect(table.rows.value).toHaveLength(2))

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(table.meta.value.total).toBe(42)
    expect(table.loading.value).toBe(false)
  })

  it('can be told not to load until asked', async () => {
    const fetcher = vi.fn(() => resolved([]))
    const table = makeTable(fetcher, { immediate: false })

    await nextTick()
    expect(fetcher).not.toHaveBeenCalled()

    await table.reload()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  describe('search', () => {
    it('debounces, issuing one request rather than one per keystroke', async () => {
      const fetcher = vi.fn((_query: ListQuery, _signal: AbortSignal) => resolved([]))
      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

      table.search.value = 'g'
      await nextTick()
      table.search.value = 'ga'
      await nextTick()
      table.search.value = 'gal'
      await nextTick()
      table.search.value = 'gala'
      await nextTick()

      expect(fetcher).toHaveBeenCalledTimes(1)

      await flushDebounce()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher.mock.calls[1]?.[0].search).toBe('gala')
    })

    it('returns to page 1, because page 4 of the old result set is meaningless', async () => {
      const fetcher = vi.fn((_query: ListQuery, _signal: AbortSignal) => resolved([], 500, 1, 10))
      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

      table.setPage(4)
      await nextTick()

      table.search.value = 'gala'
      await flushDebounce()

      expect(fetcher.mock.calls.at(-1)?.[0].page).toBe(1)
    })
  })

  describe('sorting', () => {
    it('cycles a column ascending, descending, then back to the default', async () => {
      const fetcher = vi.fn(() => resolved([]))
      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'name', order: 'asc' })

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'name', order: 'desc' })

      table.toggleSort('name')
      await nextTick()
      expect(table.query.value).toMatchObject({ sort: 'createdAt', order: 'desc' })
    })

    it('starts a newly chosen column ascending', async () => {
      const table = makeTable(() => resolved([]))
      await nextTick()

      table.toggleSort('price')
      await nextTick()
      table.toggleSort('name')
      await nextTick()

      expect(table.query.value).toMatchObject({ sort: 'name', order: 'asc' })
    })
  })

  describe('filters', () => {
    it('applies a filter and resets to page 1', async () => {
      const fetcher = vi.fn((_query: ListQuery, _signal: AbortSignal) => resolved([], 500))
      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

      table.setPage(3)
      await nextTick()
      table.setFilter('status', 'on_sale')
      await nextTick()

      const last = fetcher.mock.calls.at(-1)?.[0]
      expect(last?.filters).toEqual({ status: 'on_sale' })
      expect(last?.page).toBe(1)
    })

    it('removes a filter when cleared to an empty value', async () => {
      const fetcher = vi.fn((_query: ListQuery, _signal: AbortSignal) => resolved([]))
      const table = makeTable(fetcher)
      await nextTick()

      table.setFilter('status', 'draft')
      await nextTick()
      table.setFilter('status', undefined)
      await nextTick()

      expect(fetcher.mock.calls.at(-1)?.[0].filters).toEqual({})
    })

    it('treats an empty array as no filter rather than "match nothing"', async () => {
      const fetcher = vi.fn(() => resolved([]))
      const table = makeTable(fetcher)
      await nextTick()

      table.setFilter('status', [])
      await nextTick()

      expect(table.hasActiveFilters.value).toBe(false)
    })

    it('clears filters and search together', async () => {
      const table = makeTable(() => resolved([]))
      await nextTick()

      table.setFilter('status', 'draft')
      table.search.value = 'gala'
      await nextTick()
      expect(table.hasActiveFilters.value).toBe(true)

      table.clearFilters()
      await nextTick()
      expect(table.hasActiveFilters.value).toBe(false)
      expect(table.search.value).toBe('')
    })
  })

  describe('empty states', () => {
    it('distinguishes an empty resource from an over-filtered one', async () => {
      const fetcher = vi.fn(() => resolved([], 0))
      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(table.isEmpty.value).toBe(true))

      // Nothing at all: offer a create action.
      expect(table.isEmpty.value).toBe(true)
      expect(table.isFilteredEmpty.value).toBe(false)

      table.setFilter('status', 'draft')
      await vi.waitFor(() => expect(table.isFilteredEmpty.value).toBe(true))

      // Nothing *matching*: offer to clear the filters instead.
      expect(table.isEmpty.value).toBe(false)
    })

    it('reports neither empty state before the first load resolves', () => {
      const table = makeTable(() => new Promise(() => {}))

      expect(table.isEmpty.value).toBe(false)
      expect(table.isFilteredEmpty.value).toBe(false)
      expect(table.initialising.value).toBe(true)
    })
  })

  describe('races and cancellation', () => {
    it('aborts the request a new one supersedes', async () => {
      const signals: AbortSignal[] = []
      const fetcher = vi.fn((_query: ListQuery, signal: AbortSignal) => {
        signals.push(signal)
        return new Promise<ListResponse<Row>>((resolve) => {
          setTimeout(() => resolve(page([])), 50)
        })
      })

      const table = makeTable(fetcher)
      await nextTick()
      table.setPage(2)
      await nextTick()

      expect(signals[0]?.aborted).toBe(true)
      expect(signals[1]?.aborted).toBe(false)
    })

    it('ignores a superseded response so slow page 1 cannot overwrite page 2', async () => {
      let call = 0
      const fetcher = vi.fn(
        () =>
          new Promise<ListResponse<Row>>((resolve) => {
            call += 1
            const isFirst = call === 1
            setTimeout(
              () => resolve(page([{ id: isFirst ? 'stale' : 'fresh' }])),
              isFirst ? 100 : 10,
            )
          }),
      )

      const table = makeTable(fetcher)
      await nextTick()
      table.setPage(2)
      await nextTick()

      await vi.advanceTimersByTimeAsync(200)

      expect(table.rows.value).toEqual([{ id: 'fresh' }])
    })

    it('does not surface an aborted request as an error', async () => {
      const fetcher = vi.fn(() =>
        Promise.reject(new ApiError({ kind: 'aborted', status: 0, message: 'Cancelled' })),
      )
      const table = makeTable(fetcher)

      await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
      await nextTick()

      expect(table.error.value).toBeNull()
    })
  })

  describe('errors', () => {
    it('records a failure and keeps it retryable', async () => {
      let shouldFail = true
      const fetcher = vi.fn(() =>
        shouldFail
          ? Promise.reject(new ApiError({ kind: 'http', status: 500, message: 'Server error' }))
          : resolved([{ id: 'a' }]),
      )

      const table = makeTable(fetcher)
      await vi.waitFor(() => expect(table.error.value).not.toBeNull())
      expect(table.error.value?.isRetryable).toBe(true)

      shouldFail = false
      await table.reload()

      expect(table.error.value).toBeNull()
      expect(table.rows.value).toHaveLength(1)
    })

    it('wraps a non-ApiError rejection instead of leaking it', async () => {
      const table = makeTable(() => Promise.reject(new TypeError('boom')))

      await vi.waitFor(() => expect(table.error.value).not.toBeNull())
      expect(table.error.value).toBeInstanceOf(ApiError)
      expect(table.error.value?.message).toMatch(/could not load this list/i)
    })
  })

  describe('pagination', () => {
    it('adopts the page the server clamped to', async () => {
      // Deleting the last row on page 4 should land the user on page 3, not a blank table.
      const fetcher = vi.fn(() => resolved([{ id: 'a' }], 21, 3, 10))
      const table = makeTable(fetcher)

      await vi.waitFor(() => expect(table.meta.value.page).toBe(3))
      expect(table.query.value.page).toBe(3)
    })

    it('returns to page 1 when the page size changes', async () => {
      const fetcher = vi.fn((_query: ListQuery, _signal: AbortSignal) => resolved([], 500))
      const table = makeTable(fetcher)
      await nextTick()

      table.setPage(4)
      await nextTick()
      table.setPerPage(100)
      await nextTick()

      const last = fetcher.mock.calls.at(-1)?.[0]
      expect(last?.perPage).toBe(100)
      expect(last?.page).toBe(1)
    })

    it('refuses a page below 1', async () => {
      const table = makeTable(() => resolved([]))
      await nextTick()

      table.setPage(-5)
      await nextTick()

      expect(table.query.value.page).toBe(1)
    })
  })

  it('cancels in-flight work when its scope is disposed', async () => {
    const signals: AbortSignal[] = []
    const { result: _table, dispose } = withScope(() =>
      useTable<Row>({
        resource: 'rows',
        fetcher: (_query, signal) => {
          signals.push(signal)
          return new Promise(() => {})
        },
        defaultSort: 'createdAt',
        syncUrl: false,
      }),
    )

    await nextTick()
    dispose()

    expect(signals[0]?.aborted).toBe(true)
  })
})
